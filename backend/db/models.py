"""SQLAlchemy models matching the schema defined in context.md (section 5)."""

import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 384  # matches local sentence-transformers all-MiniLM-L6-v2 (see detection/change_detector.py)


class Base(DeclarativeBase):
    pass


class TargetCompany(Base):
    __tablename__ = "target_companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
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
    source_type: Mapped[str] = mapped_column(String)  # pricing | feature | job_posting | news
    url: Mapped[str] = mapped_column(String, nullable=False)
    last_content_hash: Mapped[str | None] = mapped_column(String)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    target_company: Mapped["TargetCompany"] = relationship(back_populates="reports")
