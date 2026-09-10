"""FastAPI app entrypoint and pipeline orchestration.

Each stage (collect / detect / analyze / score / assemble / render) is called
independently here so the pipeline can also be driven from a script or a
scheduled Cloud Function without going through HTTP at all.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel
from sqlalchemy import select

from backend.analysis.analyst import analyze_change, retrieve_related_context, summarize_baseline
from backend.analysis.validator import validate_signal
from backend.collectors import COLLECTOR_BY_SOURCE_TYPE
from backend.db.models import Report, Signal, Snapshot, Source, TargetCompany
from backend.db.session import SessionLocal
from backend.detection.change_detector import embed, is_real_change
from backend.discovery import find_competitors, find_sources
from backend.report.assembler import assemble_report, build_signal_cards
from backend.report.charts import render_report_charts
from backend.report.pdf_renderer import render_pdf
from backend.report.storage import upload_report_pdf
from backend.scoring.scorer import score_signal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("founders_radar.pipeline")

app = FastAPI(title="Founder's Radar Pipeline")

OUTPUT_DIR = Path(__file__).parent / "output"


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/run/{target_company_id}")
def trigger_run(target_company_id: str) -> dict:
    report = run_pipeline_for_target(target_company_id)
    return {"report_id": str(report.id), "pdf_url": report.pdf_url}


class DiscoverCompetitorsRequest(BaseModel):
    company_name: str
    website: str | None = None


class DiscoverSourcesRequest(BaseModel):
    competitor_name: str
    website: str | None = None


@app.post("/discover/competitors")
def discover_competitors(body: DiscoverCompetitorsRequest) -> dict:
    """Proposes candidate competitors — never written to the DB here. The frontend shows
    these for the user to review/edit/remove before anything is saved (docs/09-v2-plan.md)."""
    candidates = find_competitors(body.company_name, body.website)
    return {"competitors": [c.__dict__ for c in candidates]}


@app.post("/discover/sources")
def discover_sources(body: DiscoverSourcesRequest) -> dict:
    """Proposes candidate source URLs for one competitor — same review-before-save flow."""
    candidates = find_sources(body.competitor_name, body.website)
    return {"sources": [c.__dict__ for c in candidates]}


def _is_report_due(session, target_company: TargetCompany) -> bool:
    """A company is due once report_interval_days have passed since its latest report
    (or immediately, if it has never had one)."""
    latest_report_at = session.execute(
        select(Report.created_at)
        .where(Report.target_company_id == target_company.id)
        .order_by(Report.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    if latest_report_at is None:
        return True

    if latest_report_at.tzinfo is None:
        latest_report_at = latest_report_at.replace(tzinfo=timezone.utc)

    return datetime.now(timezone.utc) - latest_report_at >= timedelta(days=target_company.report_interval_days)


def run_pipeline_for_all_active_companies() -> list[dict]:
    """Loop over every target company whose report_interval_days has elapsed since its last
    report, isolating failures so one company's collectors or LLM errors don't block the rest.
    Meant to be called on a frequent, fixed schedule (e.g. daily) — see infra/scheduler_config.yaml
    — with each company's own interval deciding whether it actually runs today."""
    session = SessionLocal()
    try:
        companies = session.execute(select(TargetCompany)).scalars().all()
        due_ids = [c.id for c in companies if _is_report_due(session, c)]
    finally:
        session.close()

    results = []
    for company_id in due_ids:
        try:
            report = run_pipeline_for_target(str(company_id))
            results.append({"target_company_id": str(company_id), "report_id": str(report.id)})
        except Exception:
            logger.exception("Pipeline run failed for target company %s", company_id)
            results.append({"target_company_id": str(company_id), "error": "pipeline run failed"})
    return results


def run_pipeline_for_target(
    target_company_id: str,
    week_start: date | None = None,
    week_end: date | None = None,
):
    session = SessionLocal()
    try:
        target_company = session.get(TargetCompany, target_company_id)

        # Report period defaults to this company's own interval (not always 7 days) so a
        # company checked every 2 days gets a 2-day report window, not a stale 7-day one.
        week_end = week_end or date.today()
        week_start = week_start or (week_end - timedelta(days=target_company.report_interval_days))
        sources = session.execute(
            select(Source).join(Source.competitor).where(
                Source.competitor.has(target_company_id=target_company_id)
            )
        ).scalars().all()

        new_signals: list[Signal] = []

        for source in sources:
            try:
                new_signals.extend(_process_source(session, source))
                source.status = "active"
            except Exception:
                # One source failing (blocked by robots.txt, exhausted retries, etc.)
                # must not abort the rest of this company's sources or its report.
                logger.exception("Source %s failed, marking broken and continuing", source.url)
                source.status = "broken"

        session.commit()

        report = assemble_report(session, target_company, week_start, week_end, new_signals)
        cards = build_signal_cards(session, new_signals)

        chart_paths = render_report_charts(report.chart_data, OUTPUT_DIR / str(report.id))
        pdf_path = render_pdf(
            report, target_company, cards, chart_paths, OUTPUT_DIR / str(report.id) / "report.pdf"
        )
        report.pdf_url = upload_report_pdf(pdf_path, report.id)
        session.commit()
        session.refresh(report)

        logger.info("Report %s generated with %d signals -> %s", report.id, len(new_signals), pdf_path)
        return report
    finally:
        session.close()


def _process_source(session, source: Source) -> list[Signal]:
    """Collect, detect, analyze, validate, and score a single source. Returns new signals."""
    collector_cls = COLLECTOR_BY_SOURCE_TYPE[source.source_type]
    collector = collector_cls(source.url)

    collected = collector.collect(source.last_content_hash)
    if collected is None:
        logger.info("No hash change for %s", source.url)
        return []

    latest_snapshot = session.execute(
        select(Snapshot)
        .where(Snapshot.source_id == source.id)
        .order_by(Snapshot.fetched_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    new_embedding = embed(collected.normalized_content)
    new_snapshot = Snapshot(
        source_id=source.id,
        content=collected.normalized_content,
        content_hash=collected.content_hash,
        embedding=new_embedding,
    )
    session.add(new_snapshot)
    session.flush()

    source.last_content_hash = collected.content_hash
    source.last_checked_at = new_snapshot.fetched_at

    if latest_snapshot is None:
        logger.info("First snapshot for %s, summarizing as a baseline finding", source.url)
        related_context = retrieve_related_context(session, source, new_embedding)
        analyst_output = summarize_baseline(source, collected.normalized_content, related_context)

        validated = validate_signal(analyst_output, collected.normalized_content)
        priority = score_signal(source.source_type)

        signal = Signal(
            source_id=source.id,
            old_snapshot_id=None,
            new_snapshot_id=new_snapshot.id,
            similarity_score=None,
            what_changed=analyst_output.what_changed,
            why_it_matters=analyst_output.why_it_matters,
            suggested_response=analyst_output.suggested_response,
            priority=priority,
            validated=validated,
            is_baseline=True,
        )
        session.add(signal)
        session.flush()

        if not validated:
            logger.warning("Baseline signal %s failed validation — kept but flagged", signal.id)

        return [signal]

    is_real, similarity = is_real_change(latest_snapshot.content, collected.normalized_content)
    logger.info("Similarity for %s: %.4f (real_change=%s)", source.url, similarity, is_real)

    if not is_real:
        return []

    related_context = retrieve_related_context(session, source, new_embedding)
    analyst_output = analyze_change(
        source, latest_snapshot.content, collected.normalized_content, related_context
    )

    validated = validate_signal(analyst_output, collected.normalized_content)
    priority = score_signal(source.source_type)

    signal = Signal(
        source_id=source.id,
        old_snapshot_id=latest_snapshot.id,
        new_snapshot_id=new_snapshot.id,
        similarity_score=similarity,
        what_changed=analyst_output.what_changed,
        why_it_matters=analyst_output.why_it_matters,
        suggested_response=analyst_output.suggested_response,
        priority=priority,
        validated=validated,
    )
    session.add(signal)
    session.flush()

    if not validated:
        logger.warning("Signal %s failed validation — kept but flagged, not silently dropped", signal.id)

    return [signal]
