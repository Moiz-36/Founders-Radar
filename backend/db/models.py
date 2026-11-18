"""SQLAlchemy models matching infra/sql/schema.sql (the authoritative schema)."""

import uuid
from datetime import date, datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 384  # matches local sentence-transformers all-MiniLM-L6-v2 (see detection/change_detector.py)


def _utcnow() -> datetime:
    # Timezone-aware, unlike the deprecated naive UTC helper, to match the TIMESTAMPTZ columns.
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TargetCompany(Base):
    __tablename__ = "target_companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # References Supabase auth.users(id) — not modeled as an ORM relationship since auth.users
    # lives outside this app's schema. Nullable: the ComplyDo pilot company has no owner and is
    # reachable only by direct report link, not through the owner-scoped dashboard (see infra/sql/schema.sql).
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # User-configurable per company (default matches the original hardcoded weekly cadence).
    # A company is "due" for a new report once this many days have passed since its latest
    # report — see _is_report_due() in backend/main.py.
    report_interval_days: Mapped[int] = mapped_column(Integer, default=7)
    # Latest pipeline run: running | done | skipped (nothing new) | failed. NULL = never run.
    # Set by claim_run()/execute_claimed_run() in backend/main.py; the frontend polls it after
    # "Run report now", since a run takes minutes and returns before finishing.
    run_status: Mapped[str | None] = mapped_column(String)
    run_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    run_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    competitors: Mapped[list["Competitor"]] = relationship(back_populates="target_company")
    reports: Mapped[list["Report"]] = relationship(back_populates="target_company")


class Competitor(Base):
    __tablename__ = "competitors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("target_companies.id"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    website: Mapped[str | None] = mapped_column(String)
    # Optional "track my own company too" (see docs/decisions.md): this row is the target
    # company itself, not an actual competitor. Same pipeline either way — purely a UI flag
    # (a "Your company" badge, distinguishable in the widget comparison picker) so it never
    # reads as a competitive threat in generated report language.
    is_self: Mapped[bool] = mapped_column(default=False)
    # Market data (backend/market/): a ticker for publicly traded competitors (set by the
    # user, or suggested by the funding lookup), and when funding was last looked up.
    stock_ticker: Mapped[str | None] = mapped_column(String)
    funding_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    target_company: Mapped["TargetCompany"] = relationship(back_populates="competitors")
    sources: Mapped[list["Source"]] = relationship(back_populates="competitor")


class FundingRoundRow(Base):
    """One funding round extracted from web search (backend/market/funding.py), always with
    the source URL it was extracted from. Replaced wholesale on each refresh."""

    __tablename__ = "funding_rounds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("competitors.id", ondelete="CASCADE"))
    round: Mapped[str] = mapped_column(String, nullable=False)
    announced_on: Mapped[date | None] = mapped_column()
    amount_usd: Mapped[float | None] = mapped_column(Float)
    valuation_usd: Mapped[float | None] = mapped_column(Float)
    investors: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PricePlanRow(Base):
    """One plan from a competitor's pricing page, extracted by backend/market/pricing.py from
    the page's latest snapshot. Replaced wholesale when the page content changes."""

    __tablename__ = "price_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("competitors.id", ondelete="CASCADE"))
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"))
    plan: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String)
    billing_period: Mapped[str | None] = mapped_column(String)
    monthly_price: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String)
    position: Mapped[int] = mapped_column(default=0)
    source_hash: Mapped[str] = mapped_column(String, nullable=False)
    extracted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("competitors.id"))
    # pricing | feature | job_posting | news | community | review | general — see backend/collectors
    source_type: Mapped[str] = mapped_column(String)
    url: Mapped[str] = mapped_column(String, nullable=False)
    last_content_hash: Mapped[str | None] = mapped_column(String)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # active: last collect() succeeded (or hasn't run yet). broken: last collect() raised
    # (robots.txt disallow, exhausted retries, an LLM error, etc.) — surfaced in the dashboard
    # instead of only appearing in pipeline logs. needs_review: allowed by the schema but not
    # currently used (discovery output is reviewed before it's ever saved).
    status: Mapped[str] = mapped_column(String, default="active")

    competitor: Mapped["Competitor"] = relationship(back_populates="sources")
    snapshots: Mapped[list["Snapshot"]] = relationship(back_populates="source")
    signals: Mapped[list["Signal"]] = relationship(back_populates="source")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    source: Mapped["Source"] = relationship(back_populates="snapshots")


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"))
    old_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("snapshots.id"))
    new_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("snapshots.id"))
    similarity_score: Mapped[float | None] = mapped_column(Float)
    what_changed: Mapped[str | None] = mapped_column(Text)
    why_it_matters: Mapped[str | None] = mapped_column(Text)
    suggested_response: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str | None] = mapped_column(String)  # high | medium | low
    validated: Mapped[bool] = mapped_column(default=False)
    # True for the one-time "here's what we found" summary generated the first time a source
    # is ever collected (old_snapshot_id is None for these — there's nothing to diff against
    # yet). False for ordinary change-detected signals. See summarize_baseline() in
    # backend/analysis/analyst.py.
    is_baseline: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    source: Mapped["Source"] = relationship(back_populates="signals")
    # Two separate FKs to the same table, so each needs its own foreign_keys= to disambiguate.
    # Used by backend/report/assembler.py to build the raw old-vs-new diff view alongside the
    # LLM summary (docs/10-competitive-feature-research.md quick win #2).
    old_snapshot: Mapped["Snapshot | None"] = relationship(foreign_keys=[old_snapshot_id])
    new_snapshot: Mapped["Snapshot | None"] = relationship(foreign_keys=[new_snapshot_id])


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("target_companies.id"))
    week_start: Mapped[date] = mapped_column(nullable=False)
    week_end: Mapped[date] = mapped_column(nullable=False)
    headline: Mapped[str | None] = mapped_column(Text)
    executive_summary: Mapped[str | None] = mapped_column(Text)
    signal_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    chart_data: Mapped[dict | None] = mapped_column(JSONB)
    # Legacy: PDFs used to be pre-rendered and uploaded on every run. They're rendered on
    # demand now (backend/report/pdf_renderer.py), so new reports leave this NULL.
    pdf_url: Mapped[str | None] = mapped_column(String)
    # private: owner only. public: anyone with the link (see infra/sql/schema.sql RLS).
    # Set explicitly in assemble_report() rather than relying on this default alone — the
    # ownerless ComplyDo pilot company's reports must stay public. See docs/decisions.md.
    visibility: Mapped[str] = mapped_column(String, default="private")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    target_company: Mapped["TargetCompany"] = relationship(back_populates="reports")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope: Mapped[str] = mapped_column(String)  # report | company
    # A report_id or target_company_id depending on scope — not a real FK, since it points to
    # two different tables (see infra/sql/schema.sql for why).
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    role: Mapped[str] = mapped_column(String)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
