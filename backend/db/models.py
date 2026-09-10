"""SQLAlchemy models matching the schema defined in context.md (section 5)."""

import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 384  # matches local sentence-transformers all-MiniLM-L6-v2 (see detection/change_detector.py)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    competitors: Mapped[list["Competitor"]] = relationship(back_populates="target_company")
    reports: Mapped[list["Report"]] = relationship(back_populates="target_company")


class Competitor(Base):
    __tablename__ = "competitors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("target_companies.id"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    website: Mapped[str | None] = mapped_column(String)

    target_company: Mapped["TargetCompany"] = relationship(back_populates="competitors")
    sources: Mapped[list["Source"]] = relationship(back_populates="competitor")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("competitors.id"))
    source_type: Mapped[str] = mapped_column(String)  # pricing | feature | job_posting | news | community
    url: Mapped[str] = mapped_column(String, nullable=False)
    last_content_hash: Mapped[str | None] = mapped_column(String)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # active: last collect() succeeded (or hasn't run yet). broken: last collect() raised
    # (robots.txt disallow, exhausted retries, etc.) — surfaced in the dashboard instead of
    # only appearing in pipeline logs. needs_review: reserved for Phase 2 discovery output
    # the user hasn't confirmed yet.
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
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    source: Mapped["Source"] = relationship(back_populates="signals")


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
    pdf_url: Mapped[str | None] = mapped_column(String)
    # private: owner only. public: anyone with the link (see infra/sql/schema.sql RLS).
    # Set explicitly in assemble_report() rather than relying on this default alone — the
    # ownerless ComplyDo pilot company's reports must stay public. See docs/decisions.md.
    visibility: Mapped[str] = mapped_column(String, default="private")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    target_company: Mapped["TargetCompany"] = relationship(back_populates="reports")
