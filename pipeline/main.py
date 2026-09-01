"""FastAPI app entrypoint and pipeline orchestration.

Each stage (collect / detect / analyze / score / assemble / render) is called
independently here so the pipeline can also be driven from a script or a
scheduled Cloud Function without going through HTTP at all.
"""

import logging
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import select

from pipeline.analysis.analyst import analyze_change, retrieve_related_context
from pipeline.analysis.validator import validate_signal
from pipeline.collectors import COLLECTOR_BY_SOURCE_TYPE
from pipeline.db.models import Signal, Snapshot, Source, TargetCompany
from pipeline.db.session import SessionLocal
from pipeline.detection.change_detector import embed, is_real_change
from pipeline.report.assembler import assemble_report, build_signal_cards
from pipeline.report.charts import render_report_charts
from pipeline.report.pdf_renderer import render_pdf
from pipeline.scoring.scorer import score_signal

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


def run_pipeline_for_target(
    target_company_id: str,
    week_start: date | None = None,
    week_end: date | None = None,
):
    week_end = week_end or date.today()
    week_start = week_start or (week_end - timedelta(days=7))

    session = SessionLocal()
    try:
        target_company = session.get(TargetCompany, target_company_id)
        sources = session.execute(
            select(Source).join(Source.competitor).where(
                Source.competitor.has(target_company_id=target_company_id)
            )
        ).scalars().all()

        new_signals: list[Signal] = []

        for source in sources:
            new_signals.extend(_process_source(session, source))

        session.commit()

        report = assemble_report(session, target_company, week_start, week_end, new_signals)
        cards = build_signal_cards(session, new_signals)

        chart_paths = render_report_charts(report.chart_data, OUTPUT_DIR / str(report.id))
        pdf_path = render_pdf(
            report, target_company, cards, chart_paths, OUTPUT_DIR / str(report.id) / "report.pdf"
        )
        report.pdf_url = str(pdf_path)
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
        logger.info("First snapshot for %s, nothing to compare yet", source.url)
        return []

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
