"""Test harness.

Safety first: backend/__init__.py loads the repo's real .env (live Supabase URL, real API
keys) on import. load_dotenv() never overrides variables that are already set, so every
variable it would load is pinned here BEFORE anything imports `backend` — tests can only
ever reach the throwaway local database started below. On top of that, outbound network
connections are blocked for the whole session (only localhost is allowed), so a missed mock
fails loudly instead of calling Groq, Tavily, or a real website.

The database is a real local Postgres + pgvector (pgserver, no Docker needed). The real
infra/sql/schema.sql is applied on top of minimal stand-ins for Supabase's `auth` and
`storage` schemas, so schema migrations, triggers and RLS policies are all exercised for real.
"""

import json
import os
import socket
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_SQL = REPO_ROOT / "infra" / "sql" / "schema.sql"

# --- Start the throwaway database before importing backend --------------------------------

import pgserver  # noqa: E402
import psycopg  # noqa: E402

_PG_DIR = Path(tempfile.gettempdir()) / "founders_radar_pytest_pg"
_server = pgserver.get_server(str(_PG_DIR), cleanup_mode="stop")
_ADMIN_URI = _server.get_uri()  # postgresql://postgres:@127.0.0.1:<port>/postgres
TEST_DB = "founders_radar_test"
TEST_DB_URI = _ADMIN_URI.rsplit("/", 1)[0] + f"/{TEST_DB}"

os.environ["DATABASE_URL"] = TEST_DB_URI.replace("postgresql://", "postgresql+psycopg://", 1)
os.environ["GROQ_API_KEY"] = "test-key-not-real"
os.environ["TAVILY_API_KEY"] = "test-key-not-real"
os.environ["PIPELINE_SHARED_SECRET"] = ""  # middleware no-op unless a test sets it
os.environ["SUPABASE_URL"] = "http://localhost.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key-not-real"
os.environ["HF_HUB_OFFLINE"] = "1"  # the embedding model is loaded from the local cache only
os.environ["TRANSFORMERS_OFFLINE"] = "1"

SUPABASE_STUBS = """
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS
    $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
"""

# Supabase's API roles: requests run as `authenticated` (signed in) or `anon`, both subject
# to RLS — unlike the backend's own superuser-ish DATABASE_URL connection.
GRANTS = """
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO authenticated, anon;
"""


def _create_test_database() -> None:
    with psycopg.connect(_ADMIN_URI, autocommit=True) as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        conn.execute(f"CREATE DATABASE {TEST_DB}")
    with psycopg.connect(TEST_DB_URI, autocommit=True) as conn:
        conn.execute(SUPABASE_STUBS)
        conn.execute(SCHEMA_SQL.read_text(encoding="utf-8"))
        conn.execute(GRANTS)


_create_test_database()


# --- Network guard -------------------------------------------------------------------------

_LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
_real_connect = socket.socket.connect


def _guarded_connect(self, address):
    host = address[0] if isinstance(address, tuple) else address
    if host not in _LOCAL_HOSTS:
        raise RuntimeError(f"Tests must not use the network (attempted connection to {address!r})")
    return _real_connect(self, address)


socket.socket.connect = _guarded_connect


# --- Fixtures ------------------------------------------------------------------------------

TABLES = (
    "chat_messages, report_shares, dashboard_widgets, reports, signals, snapshots, sources, "
    "competitors, target_companies, profiles, auth.users"
)


@pytest.fixture
def db_conn():
    """A raw autocommit psycopg connection to the test database (superuser: bypasses RLS)."""
    with psycopg.connect(TEST_DB_URI, autocommit=True) as conn:
        yield conn


@pytest.fixture(autouse=True)
def clean_db():
    yield
    with psycopg.connect(TEST_DB_URI, autocommit=True) as conn:
        conn.execute(f"TRUNCATE {TABLES} CASCADE")


@pytest.fixture
def session():
    from backend.db.session import SessionLocal

    with SessionLocal() as s:
        yield s


@contextmanager
def as_user(conn, user_id: uuid.UUID | None, email: str | None = None, role: str = "authenticated"):
    """Run queries on `conn` as a Supabase API user, so RLS applies. user_id=None is a
    signed-out visitor."""
    conn.execute(f"SET ROLE {role}")
    conn.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(user_id) if user_id else "",))
    conn.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"email": email} if email else {}),))
    try:
        yield conn
    finally:
        conn.execute("RESET ROLE")
        conn.execute("SELECT set_config('request.jwt.claim.sub', '', false)")
        conn.execute("SELECT set_config('request.jwt.claims', '', false)")


@pytest.fixture
def make_user(db_conn):
    def _make(email: str | None = None, metadata: dict | None = None) -> uuid.UUID:
        uid = uuid.uuid4()
        db_conn.execute(
            "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (%s, %s, %s)",
            (uid, email or f"{uid}@example.com", json.dumps(metadata or {})),
        )
        return uid

    return _make


@pytest.fixture
def make_company(session):
    """Creates a company with competitors and sources. `sources` maps competitor name to a
    list of (source_type, url)."""
    from backend.db.models import Competitor, Source, TargetCompany

    def _make(name="Acme", owner_id=None, sources=None, interval=7):
        company = TargetCompany(name=name, owner_id=owner_id, report_interval_days=interval)
        session.add(company)
        session.flush()
        for competitor_name, competitor_sources in (sources or {}).items():
            competitor = Competitor(target_company_id=company.id, name=competitor_name, website=None)
            session.add(competitor)
            session.flush()
            for source_type, url in competitor_sources:
                session.add(Source(competitor_id=competitor.id, source_type=source_type, url=url))
        session.commit()
        return company.id

    return _make


class FakeWeb:
    """Stands in for every collector's fetch: `pages[url]` is the page text, or an Exception
    instance to raise."""

    def __init__(self):
        self.pages: dict[str, object] = {}
        self.fetches: list[str] = []

    def fetch(self, collector) -> str:
        self.fetches.append(collector.url)
        page = self.pages[collector.url]
        if isinstance(page, Exception):
            raise page
        return page


class FakeLLM:
    """Stands in for backend.llm.complete_json. Produces grounded output (taken from the
    content it's given) so the validator passes, unless a test says otherwise."""

    def __init__(self):
        self.significance = "high"
        self.fail_with: Exception | None = None
        self.fail_for_url: str | None = None
        self.fail_summary = False
        self.calls: list[tuple[str, str]] = []

    def __call__(self, system_prompt: str, user_message: str, max_tokens: int = 2048) -> dict:
        self.calls.append((system_prompt, user_message))
        if "executive summary" in system_prompt:
            if self.fail_summary:
                raise RuntimeError("summary LLM failure")
            return {"headline": "Test headline", "executive_summary": "Test summary."}
        if self.fail_with is not None and (self.fail_for_url is None or self.fail_for_url in user_message):
            raise self.fail_with
        if "CHANGED REGIONS:" in user_message:
            region = user_message.split("CHANGED REGIONS:\n", 1)[1].split("\n\nOLD CONTENT:", 1)[0]
            new_line = next((ln for ln in region.splitlines() if ln.startswith("NEW: ")), "NEW: (removed)")
            claim = new_line.removeprefix("NEW: ")
        else:
            current = user_message.split("CURRENT CONTENT:\n", 1)[1].split("\n\nRELATED HISTORICAL CONTEXT:", 1)[0]
            claim = " ".join(current.split()[:15])
        return {
            "what_changed": claim,
            "why_it_matters": "It matters.",
            "suggested_response": None,
            "significance": self.significance,
        }

    def analyst_calls(self) -> int:
        return sum(1 for system, _ in self.calls if "executive summary" not in system)


@pytest.fixture
def fake_web(monkeypatch):
    from backend.collectors import base

    web = FakeWeb()
    for cls in (base.StaticPageCollector, base.RenderedPageCollector, base.HackerNewsCollector):
        monkeypatch.setattr(cls, "fetch_raw", lambda self: web.fetch(self))
    monkeypatch.setattr(base, "is_allowed_by_robots", lambda url: True)
    return web


@pytest.fixture
def fake_llm(monkeypatch):
    from backend.analysis import analyst
    from backend.report import assembler

    llm = FakeLLM()
    monkeypatch.setattr(analyst, "complete_json", llm)
    monkeypatch.setattr(assembler, "complete_json", llm)
    return llm
