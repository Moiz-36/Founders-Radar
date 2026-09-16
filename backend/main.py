"""FastAPI app entrypoint and pipeline orchestration.

Each stage (collect / detect / analyze / score / assemble / render) is called
independently here so the pipeline can also be driven from a script or a
scheduled Cloud Function without going through HTTP at all.
"""

import logging
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from backend.analysis.analyst import analyze_change, retrieve_related_context, summarize_baseline
from backend.analysis.validator import validate_signal
from backend.chat.qa import (
    ChatMessage,
    CompetitorSummary,
    SignalContext,
    SnapshotContext,
    build_company_system_prompt,
    build_report_system_prompt,
    stream_answer,
)
from backend.collectors import COLLECTOR_BY_SOURCE_TYPE
from backend.db.models import ChatMessage as ChatMessageRow
from backend.db.models import Competitor, Report, Signal, Snapshot, Source, TargetCompany
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

# Every route below other than /health has "no auth of its own" by design — see the
# comments on frontend/app/api/*/route.ts, which are what actually enforce ownership/session
# checks before ever calling here. That was a safe assumption while this service was only
# reachable via GCP's private (--no-allow-unauthenticated) Cloud Run invocation; it stops
# being safe the moment this is deployed somewhere public like Render, where anyone who finds
# the URL could hit /run/{id} or /discover/* directly and trigger real Groq/Tavily calls and
# DB writes for free. PIPELINE_SHARED_SECRET closes that gap without touching every route's
# own signature: unset (the local-dev default), this is a no-op; set it here and in the
# frontend's own server-only env (see frontend/app/api/*/route.ts), and only requests
# carrying the matching header get through.
PIPELINE_SHARED_SECRET = os.environ.get("PIPELINE_SHARED_SECRET")


@app.middleware("http")
async def require_shared_secret(request: Request, call_next):
    if (
        PIPELINE_SHARED_SECRET
        and request.url.path != "/health"
        and request.headers.get("x-pipeline-secret") != PIPELINE_SHARED_SECRET
    ):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


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


class ChatRequest(BaseModel):
    question: str


# Per report/company, per hour. A generous cap for real usage, but a message here is a live
# Groq call (unlike the weekly pipeline run's fixed cost) — this bounds runaway cost/abuse.
CHAT_RATE_LIMIT_PER_HOUR = 30
# How many past messages to load from chat_messages for context — matches
# backend/chat/qa.py's HISTORY_TURNS_KEPT (fetch exactly what will be used, no more).
CHAT_HISTORY_ROWS = 6


def _check_chat_rate_limit(session, scope: str, subject_id: str) -> None:
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    count = session.execute(
        select(func.count())
        .select_from(ChatMessageRow)
        .where(
            ChatMessageRow.scope == scope,
            ChatMessageRow.subject_id == subject_id,
            ChatMessageRow.role == "user",
            ChatMessageRow.created_at >= since,
        )
    ).scalar_one()
    if count >= CHAT_RATE_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=429, detail=f"Rate limit reached: max {CHAT_RATE_LIMIT_PER_HOUR} questions/hour"
        )


def _load_chat_history(session, scope: str, subject_id: str) -> list[ChatMessage]:
    rows = session.execute(
        select(ChatMessageRow)
        .where(ChatMessageRow.scope == scope, ChatMessageRow.subject_id == subject_id)
        .order_by(ChatMessageRow.created_at.desc())
        .limit(CHAT_HISTORY_ROWS)
    ).scalars().all()
    rows.reverse()
    return [ChatMessage(role=r.role, content=r.content) for r in rows]


def _stream_chat_answer(
    session, scope: str, subject_id: str, system_prompt: str, history: list[ChatMessage], question: str
) -> StreamingResponse:
    """Streams the answer token-by-token, then persists it once generation finishes. The
    session stays open past this function's return — StreamingResponse pulls from `generate()`
    lazily, after the route handler itself has already returned — so it's closed inside the
    generator's own `finally`, not by the route."""

    def generate():
        chunks: list[str] = []
        try:
            for delta in stream_answer(system_prompt, history, question):
                chunks.append(delta)
                yield delta
        except Exception:
            logger.exception("Chat generation failed (%s %s)", scope, subject_id)
            if not chunks:
                yield "Sorry, something went wrong answering that. Please try again."
        finally:
            answer = "".join(chunks)
            if answer:
                session.add(ChatMessageRow(scope=scope, subject_id=subject_id, role="assistant", content=answer))
                session.commit()
            session.close()

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/chat/report/{report_id}")
def chat_about_report(report_id: str, body: ChatRequest) -> StreamingResponse:
    """Report-scoped Q&A (Phase 1 — see docs/decisions.md). No auth here: the Next.js
    /api/chat route already checked the caller can see this report (owner or shared/public,
    via an RLS-scoped Supabase query) before ever calling this endpoint — same trust model
    as /run and /discover/*."""
    session = SessionLocal()
    try:
        report = session.get(Report, report_id)
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        _check_chat_rate_limit(session, "report", report_id)
        history = _load_chat_history(session, "report", report_id)

        signals = session.execute(
            select(Signal).where(Signal.id.in_(report.signal_ids or []))
        ).scalars().all()

        signal_contexts = [
            SignalContext(
                competitor_name=s.source.competitor.name,
                source_type=s.source.source_type,
                source_url=s.source.url,
                priority=s.priority,
                is_baseline=s.is_baseline,
                what_changed=s.what_changed,
                why_it_matters=s.why_it_matters,
                suggested_response=s.suggested_response,
                old_content=s.old_snapshot.content if s.old_snapshot else None,
                new_content=s.new_snapshot.content if s.new_snapshot else None,
            )
            for s in signals
        ]

        system_prompt = build_report_system_prompt(
            headline=report.headline,
            week_start=str(report.week_start),
            week_end=str(report.week_end),
            executive_summary=report.executive_summary,
            signals=signal_contexts,
        )

        session.add(ChatMessageRow(scope="report", subject_id=report.id, role="user", content=body.question))
        session.commit()

        return _stream_chat_answer(session, "report", str(report.id), system_prompt, history, body.question)
    except Exception:
        session.close()
        raise


# How many of a company's most recent signals (across all competitors) to always include for
# orientation-type questions ("anything new this month?") that semantic search alone wouldn't
# surface well, since they're not about one specific fact. Kept small to control prompt tokens.
COMPANY_CHAT_RECENT_SIGNALS = 8
# How many snapshots to pull via pgvector similarity search against the question's own
# embedding — the actual RAG step that lets this scope answer specific factual questions a
# fixed recent-signals list can't ("what's Drata's current pricing?").
COMPANY_CHAT_RELEVANT_SNAPSHOTS = 5


@app.post("/chat/company/{target_company_id}")
def chat_about_company(target_company_id: str, body: ChatRequest) -> StreamingResponse:
    """Company-wide Q&A (Phase 2 — see docs/decisions.md). Same trust model as
    /chat/report/{report_id}: the Next.js /api/chat route already checked the caller owns this
    company (target_companies RLS is owner-only, no sharing) before calling this endpoint."""
    session = SessionLocal()
    try:
        target_company = session.get(TargetCompany, target_company_id)
        if target_company is None:
            raise HTTPException(status_code=404, detail="Company not found")

        _check_chat_rate_limit(session, "company", target_company_id)
        history = _load_chat_history(session, "company", target_company_id)

        competitors = session.execute(
            select(Competitor).where(Competitor.target_company_id == target_company_id)
        ).scalars().all()
        competitor_ids = [c.id for c in competitors]

        competitor_summaries = [
            CompetitorSummary(name=c.name, website=c.website, is_self=c.is_self) for c in competitors
        ]

        recent_signal_rows: list[Signal] = []
        relevant_snapshot_rows: list[Snapshot] = []
        if competitor_ids:
            recent_signal_rows = session.execute(
                select(Signal)
                .join(Signal.source)
                .where(Source.competitor_id.in_(competitor_ids))
                .order_by(Signal.created_at.desc())
                .limit(COMPANY_CHAT_RECENT_SIGNALS)
            ).scalars().all()

            question_embedding = embed(body.question)
            relevant_snapshot_rows = session.execute(
                select(Snapshot)
                .join(Snapshot.source)
                .where(Source.competitor_id.in_(competitor_ids))
                .order_by(Snapshot.embedding.cosine_distance(question_embedding))
                .limit(COMPANY_CHAT_RELEVANT_SNAPSHOTS)
            ).scalars().all()

        recent_signal_contexts = [
            SignalContext(
                competitor_name=s.source.competitor.name,
                source_type=s.source.source_type,
                source_url=s.source.url,
                priority=s.priority,
                is_baseline=s.is_baseline,
                what_changed=s.what_changed,
                why_it_matters=s.why_it_matters,
                suggested_response=s.suggested_response,
                old_content=None,  # snapshot bodies come via relevant_snapshots instead, to avoid duplicating content in the prompt
                new_content=None,
                created_at=str(s.created_at.date()),
            )
            for s in recent_signal_rows
        ]
        relevant_snapshot_contexts = [
            SnapshotContext(
                competitor_name=snap.source.competitor.name,
                source_type=snap.source.source_type,
                source_url=snap.source.url,
                fetched_at=str(snap.fetched_at.date()),
                content=snap.content,
            )
            for snap in relevant_snapshot_rows
        ]

        system_prompt = build_company_system_prompt(
            company_name=target_company.name,
            competitors=competitor_summaries,
            recent_signals=recent_signal_contexts,
            relevant_snapshots=relevant_snapshot_contexts,
        )

        session.add(
            ChatMessageRow(scope="company", subject_id=target_company.id, role="user", content=body.question)
        )
        session.commit()

        return _stream_chat_answer(
            session, "company", str(target_company.id), system_prompt, history, body.question
        )
    except Exception:
        session.close()
        raise


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

        # Re-query for this company's not-yet-reported signals rather than using new_signals
        # directly: a signal only counts as "spent" once it's actually included in a
        # persisted report's signal_ids, so if a previous run's report generation failed
        # after signals were already committed above (see docs/decisions.md's 2026-09-15 QA
        # entry — that used to lose the whole report silently), this run picks up exactly
        # what was lost alongside anything new, with no duplicate-signal risk.
        reported_ids = {
            sid
            for ids in session.execute(
                select(Report.signal_ids).where(Report.target_company_id == target_company_id)
            ).scalars()
            if ids
            for sid in ids
        }
        report_signals = session.execute(
            select(Signal).join(Signal.source).join(Source.competitor).where(
                Source.competitor.has(target_company_id=target_company_id),
                Signal.id.not_in(reported_ids),
            )
        ).scalars().all()

        try:
            report = assemble_report(session, target_company, week_start, week_end, report_signals)
            cards = build_signal_cards(session, report_signals)

            chart_paths = render_report_charts(report.chart_data, OUTPUT_DIR / str(report.id))
            pdf_path = render_pdf(
                report, target_company, cards, chart_paths, OUTPUT_DIR / str(report.id) / "report.pdf"
            )
            report.pdf_url = upload_report_pdf(pdf_path, report.id)
            session.commit()
            session.refresh(report)
        except Exception:
            # The signals themselves are already committed and safe (above) — only report
            # generation (LLM summary, chart render, PDF render/upload) failed here. Roll
            # back just the half-built Report row instead of leaving it partially set, and
            # raise loudly instead of the previous silent failure. The frontend's own call to
            # trigger a run is a deliberate fire-and-forget (see frontend/app/company/new/page.tsx),
            # so this won't reach the user directly yet — but every pending signal is now
            # recoverable by the query above on the very next run, instead of lost for good.
            session.rollback()
            logger.exception(
                "Report generation failed for target %s (%d signals pending, recoverable on next run)",
                target_company_id, len(report_signals),
            )
            raise

        logger.info(
            "Report %s generated with %d signals (%d new this run) -> %s",
            report.id, len(report_signals), len(new_signals), pdf_path,
        )
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
