"""FastAPI app entrypoint and pipeline orchestration.

Each stage (collect / detect / analyze / score / assemble) is called independently here so
the pipeline can also be driven from a script or the scheduled Cloud Run service without
going through HTTP at all.
"""

import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select, update

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
from backend.db.models import Competitor, FundingRoundRow, Report, Signal, Snapshot, Source, TargetCompany
from backend.db.session import SessionLocal
from backend.detection.change_detector import detect_change, embed
from backend.discovery import find_competitors, find_sources
from backend.market.funding import find_funding
from backend.market.stocks import fetch_price_history
from backend.report.assembler import assemble_report
from backend.report.pdf_renderer import render_report_pdf
from backend.scoring.scorer import score_signal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("founders_radar.pipeline")

app = FastAPI(title="Founder's Radar Pipeline")

# The routes below have no per-user auth of their own: the frontend's app/api/* routes check
# the caller's session and ownership (via RLS-scoped Supabase queries) before calling here.
# This service is public on Cloud Run, so PIPELINE_SHARED_SECRET makes sure only that
# frontend can call it — anyone else who finds the URL can't trigger Groq/Tavily calls or DB
# writes. Unset (the local-dev default), the check is a no-op.
PIPELINE_SHARED_SECRET = os.environ.get("PIPELINE_SHARED_SECRET")

# A run marked "running" for longer than this is assumed dead (its instance was shut down
# mid-run) and may be claimed again.
RUN_STALE_AFTER = timedelta(minutes=45)
# The scheduled pass stops *starting* new companies after this long, so it finishes inside
# the Cloud Run request timeout (3600s — see infra/scheduler_config.yaml). Companies it
# didn't reach stay due and go first tomorrow (most overdue first).
SCHEDULED_TIME_BUDGET_SECONDS = int(os.environ.get("PIPELINE_TIME_BUDGET_SECONDS", "2700"))
# The scheduler fires at a fixed time, but a run's own timestamps land a little after it.
# Without slack, a 7-day company checked at 08:00:40 isn't due at 08:00:10 a week later and
# slips to day 8.
DUE_CHECK_GRACE = timedelta(hours=1)


@app.middleware("http")
async def require_shared_secret(request: Request, call_next):
    if (
        PIPELINE_SHARED_SECRET
        and request.url.path != "/health"
        and request.headers.get("x-pipeline-secret") != PIPELINE_SHARED_SECRET
    ):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


def _parse_uuid(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"{what} not found") from None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# --- Running the pipeline ------------------------------------------------------------------


def claim_run(company_id: uuid.UUID) -> bool:
    """Atomically marks a company as running. False if it doesn't exist or a run is already
    in progress — prevents a double-click (or the scheduler overlapping a manual run) from
    processing the same sources twice and creating duplicate signals."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        claimed = session.execute(
            update(TargetCompany)
            .where(
                TargetCompany.id == company_id,
                or_(
                    TargetCompany.run_status.is_(None),
                    TargetCompany.run_status != "running",
                    TargetCompany.run_started_at < now - RUN_STALE_AFTER,
                ),
            )
            .values(run_status="running", run_started_at=now, run_finished_at=None)
            .returning(TargetCompany.id)
        ).first()
        session.commit()
    return claimed is not None


def _finish_run(company_id: uuid.UUID, status: str) -> None:
    with SessionLocal() as session:
        session.execute(
            update(TargetCompany)
            .where(TargetCompany.id == company_id)
            .values(run_status=status, run_finished_at=datetime.now(timezone.utc))
        )
        session.commit()


def execute_claimed_run(company_id: uuid.UUID) -> dict:
    """Runs the pipeline for a company already claimed via claim_run(), and records the
    outcome (done / skipped / failed) where the frontend polls for it."""
    try:
        report = run_pipeline_for_target(company_id)
    except Exception:
        logger.exception("Pipeline run failed for target company %s", company_id)
        _finish_run(company_id, "failed")
        return {"target_company_id": str(company_id), "status": "failed"}
    status = "skipped" if report is None else "done"
    _finish_run(company_id, status)
    return {
        "target_company_id": str(company_id),
        "status": status,
        "report_id": str(report.id) if report else None,
    }


@app.post("/run/{target_company_id}", status_code=202)
def trigger_run(target_company_id: str) -> dict:
    """Starts a run in the background and returns immediately. A full run (scraping,
    Playwright, several LLM calls) takes minutes — far longer than the frontend's serverless
    request limit — so the caller polls target_companies.run_status instead of waiting.

    Requires the Cloud Run service to keep CPU allocated outside requests
    (`--no-cpu-throttling`), otherwise the background thread is starved once this returns.
    """
    company_id = _parse_uuid(target_company_id, "Company")
    with SessionLocal() as session:
        if session.get(TargetCompany, company_id) is None:
            raise HTTPException(status_code=404, detail="Company not found")
    if not claim_run(company_id):
        raise HTTPException(status_code=409, detail="A run is already in progress for this company")
    threading.Thread(target=execute_claimed_run, args=(company_id,), daemon=True).start()
    return {"status": "running"}


def _latest_activity(session, company_id: uuid.UUID) -> datetime | None:
    """The later of the company's latest report and its sources' latest successful check. A
    run with no changes produces no report, so the report time alone would make a quiet
    company look overdue every single day."""
    latest_report_at = session.execute(
        select(func.max(Report.created_at)).where(Report.target_company_id == company_id)
    ).scalar_one_or_none()
    latest_check_at = session.execute(
        select(func.max(Source.last_checked_at))
        .join(Source.competitor)
        .where(Competitor.target_company_id == company_id)
    ).scalar_one_or_none()
    timestamps = [
        t if t.tzinfo else t.replace(tzinfo=timezone.utc) for t in (latest_report_at, latest_check_at) if t
    ]
    return max(timestamps) if timestamps else None


def _is_report_due(session, target_company: TargetCompany) -> bool:
    """Due once report_interval_days have passed since the company was last checked, or
    immediately if it never has been."""
    latest = _latest_activity(session, target_company.id)
    if latest is None:
        return True
    elapsed = datetime.now(timezone.utc) - latest
    return elapsed >= timedelta(days=target_company.report_interval_days) - DUE_CHECK_GRACE


def run_pipeline_for_all_active_companies() -> list[dict]:
    """The scheduled pass: run every company whose interval has elapsed, most overdue first,
    isolating failures so one company's errors don't block the rest. Called daily by Cloud
    Scheduler (infra/scheduler_config.yaml); each company's own interval decides whether it
    actually runs that day."""
    started = time.monotonic()
    with SessionLocal() as session:
        companies = session.execute(select(TargetCompany)).scalars().all()
        never = datetime.min.replace(tzinfo=timezone.utc)
        due = sorted(
            (c for c in companies if _is_report_due(session, c)),
            key=lambda c: _latest_activity(session, c.id) or never,
        )
        due_ids = [c.id for c in due]

    results = []
    for company_id in due_ids:
        if time.monotonic() - started > SCHEDULED_TIME_BUDGET_SECONDS:
            logger.warning("Time budget reached; %d due companies deferred to the next pass",
                           len(due_ids) - len(results))
            break
        if not claim_run(company_id):
            results.append({"target_company_id": str(company_id), "status": "already_running"})
            continue
        results.append(execute_claimed_run(company_id))
    return results


def run_pipeline_for_target(
    target_company_id: uuid.UUID | str,
    week_start: date | None = None,
    week_end: date | None = None,
) -> Report | None:
    """Collects every source of one company and, if anything new turned up, assembles a
    report. Returns None (no report) when there's nothing new to report."""
    company_id = uuid.UUID(str(target_company_id))
    session = SessionLocal()
    try:
        target_company = session.get(TargetCompany, company_id)
        if target_company is None:
            raise ValueError(f"Target company {company_id} not found")

        # The report period matches the company's own interval (not always 7 days).
        week_end = week_end or date.today()
        week_start = week_start or (week_end - timedelta(days=target_company.report_interval_days))
        sources = session.execute(
            select(Source).join(Source.competitor).where(Competitor.target_company_id == company_id)
        ).scalars().all()

        new_signal_count = 0
        for source in sources:
            try:
                # A savepoint per source: if anything fails part-way (Groq rate limit, bad
                # JSON, a scrape error), the new snapshot and content hash are rolled back
                # with it. Previously they were committed anyway, so the next run saw an
                # unchanged hash and that change was never reported.
                with session.begin_nested():
                    if _process_source(session, source) is not None:
                        new_signal_count += 1
                source.status = "active"
            except Exception:
                logger.exception("Source %s failed, marking broken and continuing", source.url)
                source.status = "broken"
        session.commit()

        # Re-query this company's not-yet-reported signals rather than using this run's own:
        # a signal is only "spent" once a persisted report includes it, so if an earlier
        # run's report generation failed, its signals are picked up here.
        reported_ids = {
            sid
            for ids in session.execute(
                select(Report.signal_ids).where(Report.target_company_id == company_id)
            ).scalars()
            if ids
            for sid in ids
        }
        report_signals = session.execute(
            select(Signal)
            .join(Signal.source)
            .join(Source.competitor)
            .where(Competitor.target_company_id == company_id, Signal.id.not_in(reported_ids))
            .order_by(Signal.created_at)
        ).scalars().all()

        if not report_signals:
            # Nothing new — skip the report rather than spend LLM calls on an empty one. The
            # sources' last_checked_at (committed above) records the check, so the company
            # isn't due again until a full interval has passed.
            logger.info("No new signals for target %s, skipping report", company_id)
            return None

        try:
            report = assemble_report(session, target_company, week_start, week_end, list(report_signals))
            session.commit()
            session.refresh(report)
        except Exception:
            # The signals are already committed above, so they're picked up again next run.
            session.rollback()
            logger.exception(
                "Report generation failed for target %s (%d signals pending, recoverable on next run)",
                company_id, len(report_signals),
            )
            raise

        logger.info("Report %s generated with %d signals (%d new this run)",
                    report.id, len(report_signals), new_signal_count)
        return report
    finally:
        session.close()


def _process_source(session, source: Source) -> Signal | None:
    """Collect, detect, analyze, validate, and score one source. Returns the new signal, if any."""
    collector = COLLECTOR_BY_SOURCE_TYPE[source.source_type](source.url)

    collected = collector.collect(source.last_content_hash)
    # Every successful fetch counts as a check, changed or not — _is_report_due() relies on it.
    source.last_checked_at = datetime.now(timezone.utc)
    if collected is None:
        logger.info("No change for %s", source.url)
        return None

    latest_snapshot = session.execute(
        select(Snapshot)
        .where(Snapshot.source_id == source.id)
        .order_by(Snapshot.fetched_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    content = collected.normalized_content
    old_content = latest_snapshot.content if latest_snapshot else None
    change = detect_change(old_content, content) if old_content is not None else None
    if change is not None and not change.is_real:
        # Only noise changed (whitespace, punctuation, a year). Remember the new hash so it
        # isn't re-checked, but don't store a snapshot or bother the LLM.
        logger.info("Noise-only change for %s (similarity %.4f)", source.url, change.similarity)
        source.last_content_hash = collected.content_hash
        return None

    new_embedding = embed(content)
    related_context = retrieve_related_context(session, source, new_embedding)

    new_snapshot = Snapshot(
        source_id=source.id, content=content, content_hash=collected.content_hash, embedding=new_embedding
    )
    session.add(new_snapshot)
    session.flush()
    source.last_content_hash = collected.content_hash

    if change is None:
        logger.info("First snapshot for %s, summarizing as a baseline", source.url)
        analyst_output = summarize_baseline(source, content, related_context)
    else:
        logger.info("Candidate change for %s (similarity %.4f, %d regions)",
                    source.url, change.similarity, len(change.regions))
        analyst_output = analyze_change(source, old_content, content, related_context, change.regions)
        if analyst_output.significance == "none":
            # The snapshot is kept (it's the new "latest" to diff against), but no signal.
            logger.info("Analyst rated the change insignificant for %s: %s", source.url, analyst_output.what_changed)
            return None

    validated = validate_signal(analyst_output, content, old_content)
    signal = Signal(
        source_id=source.id,
        old_snapshot_id=latest_snapshot.id if latest_snapshot else None,
        new_snapshot_id=new_snapshot.id,
        similarity_score=change.similarity if change else None,
        what_changed=analyst_output.what_changed,
        why_it_matters=analyst_output.why_it_matters,
        suggested_response=analyst_output.suggested_response,
        priority=score_signal(source.source_type, analyst_output.significance),
        validated=validated,
        is_baseline=change is None,
    )
    session.add(signal)
    session.flush()
    if not validated:
        logger.warning("Signal %s failed validation — kept but flagged, not silently dropped", signal.id)
    return signal


# --- Reports -------------------------------------------------------------------------------


@app.get("/reports/{report_id}/pdf")
def report_pdf(report_id: str) -> Response:
    """Renders a report's PDF on demand. Same trust model as the other routes: the frontend's
    /api/reports/[id]/pdf checks the caller can see this report (RLS) before calling here."""
    with SessionLocal() as session:
        report = session.get(Report, _parse_uuid(report_id, "Report"))
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")
        pdf = render_report_pdf(session, report)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="founders-radar-report-{report_id}.pdf"'},
    )


# --- Market data ---------------------------------------------------------------------------

STOCK_FETCH_WORKERS = 8


@app.get("/market/{target_company_id}/stocks")
def company_stock_prices(target_company_id: str) -> dict:
    """About a year of daily closes for every competitor of this company that has a ticker.
    A ticker that fails (unknown symbol, provider down) is reported in `errors` rather than
    failing the whole response. Same trust model as the other routes: the frontend's
    /api/companies/[id]/market route has already checked ownership."""
    company_id = _parse_uuid(target_company_id, "Company")
    with SessionLocal() as session:
        if session.get(TargetCompany, company_id) is None:
            raise HTTPException(status_code=404, detail="Company not found")
        competitors = session.execute(
            select(Competitor)
            .where(Competitor.target_company_id == company_id, Competitor.stock_ticker.is_not(None))
            .order_by(Competitor.is_self.desc(), Competitor.name)
        ).scalars().all()
        targets = [(str(c.id), c.name, c.stock_ticker) for c in competitors]

    def load(target):
        competitor_id, name, ticker = target
        try:
            history = fetch_price_history(ticker)
        except Exception as exc:  # unknown symbol, provider outage — reported per ticker
            logger.warning("Stock prices for %s (%s) failed: %s", name, ticker, exc)
            return None, {"competitor_id": competitor_id, "name": name, "ticker": ticker, "error": str(exc)[:200]}
        return {
            "competitor_id": competitor_id,
            "name": name,
            "ticker": history.ticker,
            "currency": history.currency,
            "points": [{"date": p.date.isoformat(), "close": p.close} for p in history.points],
        }, None

    series, errors = [], []
    if targets:
        with ThreadPoolExecutor(max_workers=min(STOCK_FETCH_WORKERS, len(targets))) as pool:
            for ok, err in pool.map(load, targets):
                if ok:
                    series.append(ok)
                else:
                    errors.append(err)
    return {"series": series, "errors": errors}


@app.post("/market/competitors/{competitor_id}/funding")
def refresh_competitor_funding(competitor_id: str) -> dict:
    """Looks up one competitor's funding rounds (web search + LLM) and replaces its stored
    rounds. One competitor per request keeps each call well inside the frontend's serverless
    time limit; the frontend refreshes a company's competitors one after another. If the
    lookup fails, the previously stored rounds are left untouched."""
    with SessionLocal() as session:
        competitor = session.get(Competitor, _parse_uuid(competitor_id, "Competitor"))
        if competitor is None:
            raise HTTPException(status_code=404, detail="Competitor not found")
        try:
            profile = find_funding(competitor.name, competitor.website)
        except Exception:
            logger.exception("Funding lookup failed for %s", competitor.name)
            raise HTTPException(status_code=502, detail="Funding lookup failed — try again later") from None

        session.execute(delete(FundingRoundRow).where(FundingRoundRow.competitor_id == competitor.id))
        for r in profile.rounds:
            session.add(FundingRoundRow(
                competitor_id=competitor.id, round=r.round, announced_on=r.announced_on,
                amount_usd=r.amount_usd, valuation_usd=r.valuation_usd, investors=r.investors,
                source_url=r.source_url,
            ))
        # Only fill in a ticker the user hasn't set — never overwrite their choice.
        if competitor.stock_ticker is None and profile.ticker:
            competitor.stock_ticker = profile.ticker
        competitor.funding_checked_at = datetime.now(timezone.utc)
        session.commit()
        return {"rounds": len(profile.rounds), "ticker": competitor.stock_ticker}


# --- Discovery -----------------------------------------------------------------------------


class DiscoverCompetitorsRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    website: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)


class DiscoverSourcesRequest(BaseModel):
    competitor_name: str = Field(min_length=1, max_length=200)
    website: str | None = Field(default=None, max_length=500)


@app.post("/discover/competitors")
def discover_competitors(body: DiscoverCompetitorsRequest) -> dict:
    """Proposes candidate competitors — never written to the DB here. The frontend shows
    these for the user to review/edit/remove before anything is saved (docs/09-v2-plan.md)."""
    if not body.company_name.strip():
        raise HTTPException(status_code=422, detail="company_name must not be blank")
    candidates = find_competitors(body.company_name.strip(), body.website or None, body.description or None)
    return {"competitors": [c.__dict__ for c in candidates]}


@app.post("/discover/sources")
def discover_sources(body: DiscoverSourcesRequest) -> dict:
    """Proposes candidate source URLs for one competitor — same review-before-save flow."""
    if not body.competitor_name.strip():
        raise HTTPException(status_code=422, detail="competitor_name must not be blank")
    candidates = find_sources(body.competitor_name.strip(), body.website or None)
    return {"sources": [c.__dict__ for c in candidates]}


# --- Chat ----------------------------------------------------------------------------------


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


# Per report/company, per hour. A message is a live Groq call, so this bounds cost and abuse.
CHAT_RATE_LIMIT_PER_HOUR = 30
# Past messages loaded for context — matches backend/chat/qa.py's HISTORY_TURNS_KEPT.
CHAT_HISTORY_ROWS = 6
# How many of a company's most recent signals to always include for orientation-type
# questions ("anything new this month?") that semantic search alone wouldn't surface well.
COMPANY_CHAT_RECENT_SIGNALS = 8
# Snapshots pulled via pgvector similarity search against the question — the RAG step that
# answers specific factual questions ("what's Drata's current pricing?").
COMPANY_CHAT_RELEVANT_SNAPSHOTS = 5


def _check_chat_rate_limit(session, scope: str, subject_id: uuid.UUID) -> None:
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


def _load_chat_history(session, scope: str, subject_id: uuid.UUID) -> list[ChatMessage]:
    rows = session.execute(
        select(ChatMessageRow)
        .where(ChatMessageRow.scope == scope, ChatMessageRow.subject_id == subject_id)
        .order_by(ChatMessageRow.created_at.desc())
        .limit(CHAT_HISTORY_ROWS)
    ).scalars().all()
    return [ChatMessage(role=r.role, content=r.content) for r in reversed(rows)]


def _signal_context(s: Signal, include_content: bool) -> SignalContext:
    return SignalContext(
        competitor_name=s.source.competitor.name,
        source_type=s.source.source_type,
        source_url=s.source.url,
        priority=s.priority,
        is_baseline=s.is_baseline,
        what_changed=s.what_changed,
        why_it_matters=s.why_it_matters,
        suggested_response=s.suggested_response,
        old_content=s.old_snapshot.content if include_content and s.old_snapshot else None,
        new_content=s.new_snapshot.content if include_content and s.new_snapshot else None,
        created_at=None if include_content else str(s.created_at.date()),
    )


def _stream_chat_answer(
    session, scope: str, subject_id: uuid.UUID, system_prompt: str, history: list[ChatMessage], question: str
) -> StreamingResponse:
    """Streams the answer token-by-token, then persists it once generation finishes. The
    session stays open past this function's return — StreamingResponse pulls from `generate()`
    lazily, after the route handler has returned — so it's closed in the generator's `finally`."""

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
            try:
                answer = "".join(chunks)
                if answer:
                    session.add(ChatMessageRow(scope=scope, subject_id=subject_id, role="assistant", content=answer))
                    session.commit()
            finally:
                session.close()

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/chat/report/{report_id}")
def chat_about_report(report_id: str, body: ChatRequest) -> StreamingResponse:
    """Report-scoped Q&A. The frontend's /api/chat route has already checked the caller can
    see this report (owner, invited, or public) before calling here."""
    subject_id = _parse_uuid(report_id, "Report")
    session = SessionLocal()
    try:
        report = session.get(Report, subject_id)
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        _check_chat_rate_limit(session, "report", subject_id)
        history = _load_chat_history(session, "report", subject_id)

        signals = session.execute(select(Signal).where(Signal.id.in_(report.signal_ids or []))).scalars().all()
        system_prompt = build_report_system_prompt(
            headline=report.headline,
            week_start=str(report.week_start),
            week_end=str(report.week_end),
            executive_summary=report.executive_summary,
            signals=[_signal_context(s, include_content=True) for s in signals],
        )

        session.add(ChatMessageRow(scope="report", subject_id=subject_id, role="user", content=body.question))
        session.commit()
        return _stream_chat_answer(session, "report", subject_id, system_prompt, history, body.question)
    except Exception:
        session.close()
        raise


@app.post("/chat/company/{target_company_id}")
def chat_about_company(target_company_id: str, body: ChatRequest) -> StreamingResponse:
    """Company-wide Q&A. The frontend's /api/chat route has already checked the caller owns
    this company (target_companies RLS is owner-only) before calling here."""
    subject_id = _parse_uuid(target_company_id, "Company")
    session = SessionLocal()
    try:
        target_company = session.get(TargetCompany, subject_id)
        if target_company is None:
            raise HTTPException(status_code=404, detail="Company not found")

        _check_chat_rate_limit(session, "company", subject_id)
        history = _load_chat_history(session, "company", subject_id)

        competitors = session.execute(
            select(Competitor).where(Competitor.target_company_id == subject_id)
        ).scalars().all()
        competitor_ids = [c.id for c in competitors]

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
            relevant_snapshot_rows = session.execute(
                select(Snapshot)
                .join(Snapshot.source)
                .where(Source.competitor_id.in_(competitor_ids), Snapshot.embedding.is_not(None))
                .order_by(Snapshot.embedding.cosine_distance(embed(body.question)))
                .limit(COMPANY_CHAT_RELEVANT_SNAPSHOTS)
            ).scalars().all()

        system_prompt = build_company_system_prompt(
            company_name=target_company.name,
            competitors=[CompetitorSummary(name=c.name, website=c.website, is_self=c.is_self) for c in competitors],
            # Snapshot bodies come via relevant_snapshots instead, to avoid duplicating content.
            recent_signals=[_signal_context(s, include_content=False) for s in recent_signal_rows],
            relevant_snapshots=[
                SnapshotContext(
                    competitor_name=snap.source.competitor.name,
                    source_type=snap.source.source_type,
                    source_url=snap.source.url,
                    fetched_at=str(snap.fetched_at.date()),
                    content=snap.content,
                )
                for snap in relevant_snapshot_rows
            ],
        )

        session.add(ChatMessageRow(scope="company", subject_id=subject_id, role="user", content=body.question))
        session.commit()
        return _stream_chat_answer(session, "company", subject_id, system_prompt, history, body.question)
    except Exception:
        session.close()
        raise
