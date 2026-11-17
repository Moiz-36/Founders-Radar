"""Row Level Security, triggers and cascades from infra/sql/schema.sql, exercised as real
Supabase API roles (`authenticated` / `anon`) — the path every frontend query takes."""

import uuid

import psycopg
import pytest

from tests.conftest import as_user


@pytest.fixture
def world(db_conn, make_user):
    """Owner with a company, competitor, source, snapshot, signal and a private report;
    plus an unrelated user and an invited user."""
    owner = make_user("owner@example.com", {"company_name": "Acme", "job_title": "CEO"})
    stranger = make_user("stranger@example.com")
    invited = make_user("Invited@Example.com")
    ids = {k: uuid.uuid4() for k in ("company", "competitor", "source", "snapshot", "signal", "report")}
    q = db_conn.execute
    q("INSERT INTO target_companies (id, name, owner_id) VALUES (%s, 'Acme', %s)", (ids["company"], owner))
    q("INSERT INTO competitors (id, target_company_id, name) VALUES (%s, %s, 'Rival')", (ids["competitor"], ids["company"]))
    q("INSERT INTO sources (id, competitor_id, source_type, url) VALUES (%s, %s, 'pricing', 'https://r/p')",
      (ids["source"], ids["competitor"]))
    q("INSERT INTO snapshots (id, source_id, content, content_hash) VALUES (%s, %s, 'secret pricing', 'h')",
      (ids["snapshot"], ids["source"]))
    q("INSERT INTO signals (id, source_id, new_snapshot_id, what_changed) VALUES (%s, %s, %s, 'x')",
      (ids["signal"], ids["source"], ids["snapshot"]))
    q("INSERT INTO reports (id, target_company_id, week_start, week_end, signal_ids) "
      "VALUES (%s, %s, '2026-01-01', '2026-01-08', ARRAY[%s]::uuid[])", (ids["report"], ids["company"], ids["signal"]))
    q("INSERT INTO chat_messages (scope, subject_id, role, content) VALUES ('report', %s, 'user', 'q1'), "
      "('company', %s, 'user', 'q2')", (ids["report"], ids["company"]))
    return {"owner": owner, "stranger": stranger, "invited": invited, **ids}


def visible(conn, table, row_id):
    return conn.execute(f"SELECT count(*) FROM {table} WHERE id = %s", (row_id,)).fetchone()[0] == 1


ALL_TABLES = [("target_companies", "company"), ("competitors", "competitor"), ("sources", "source"),
              ("snapshots", "snapshot"), ("signals", "signal"), ("reports", "report")]


@pytest.mark.parametrize(("table", "key"), ALL_TABLES)
def test_owner_sees_everything_others_see_nothing(db_conn, world, table, key):
    with as_user(db_conn, world["owner"], "owner@example.com"):
        assert visible(db_conn, table, world[key])
    with as_user(db_conn, world["stranger"], "stranger@example.com"):
        assert not visible(db_conn, table, world[key])
    with as_user(db_conn, None, role="anon"):
        assert not visible(db_conn, table, world[key])


def test_public_report_is_readable_but_company_stays_private(db_conn, world):
    db_conn.execute("UPDATE reports SET visibility = 'public' WHERE id = %s", (world["report"],))
    with as_user(db_conn, None, role="anon"):
        assert visible(db_conn, "reports", world["report"])
        assert visible(db_conn, "signals", world["signal"])
        assert visible(db_conn, "snapshots", world["snapshot"])
        assert not visible(db_conn, "target_companies", world["company"])
        assert not visible(db_conn, "sources", world["source"])


def test_invited_email_can_read_case_insensitively(db_conn, world):
    db_conn.execute("INSERT INTO report_shares (report_id, email) VALUES (%s, 'invited@example.com')", (world["report"],))
    with as_user(db_conn, world["invited"], "INVITED@example.com"):
        assert visible(db_conn, "reports", world["report"])
        assert visible(db_conn, "signals", world["signal"])
        assert visible(db_conn, "snapshots", world["snapshot"])
        assert db_conn.execute("SELECT count(*) FROM report_shares").fetchone()[0] == 0  # invite list hidden
        assert not visible(db_conn, "target_companies", world["company"])
    with as_user(db_conn, world["stranger"], "stranger@example.com"):
        assert not visible(db_conn, "reports", world["report"])


def test_strangers_cannot_write(db_conn, world):
    with as_user(db_conn, world["stranger"], "stranger@example.com"):
        assert db_conn.execute("UPDATE reports SET visibility = 'public' WHERE id = %s", (world["report"],)).rowcount == 0
        assert db_conn.execute("DELETE FROM target_companies WHERE id = %s", (world["company"],)).rowcount == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db_conn.execute("INSERT INTO competitors (target_company_id, name) VALUES (%s, 'x')", (world["company"],))
    with as_user(db_conn, world["stranger"]):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db_conn.execute("INSERT INTO report_shares (report_id, email) VALUES (%s, 'me@x.com')", (world["report"],))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db_conn.execute("INSERT INTO target_companies (name, owner_id) VALUES ('x', %s)", (world["owner"],))


def test_owner_can_share_and_flip_visibility(db_conn, world):
    with as_user(db_conn, world["owner"], "owner@example.com"):
        db_conn.execute("INSERT INTO report_shares (report_id, email) VALUES (%s, 'a@b.com')", (world["report"],))
        assert db_conn.execute("UPDATE reports SET visibility = 'public' WHERE id = %s", (world["report"],)).rowcount == 1
        with pytest.raises(psycopg.errors.CheckViolation):
            db_conn.execute("UPDATE reports SET visibility = 'everyone' WHERE id = %s", (world["report"],))


def test_chat_history_visibility(db_conn, world):
    def chat_count():
        return db_conn.execute("SELECT count(*) FROM chat_messages").fetchone()[0]

    with as_user(db_conn, world["owner"], "owner@example.com"):
        assert chat_count() == 2
    with as_user(db_conn, world["stranger"], "stranger@example.com"):
        assert chat_count() == 0
    db_conn.execute("UPDATE reports SET visibility = 'public' WHERE id = %s", (world["report"],))
    with as_user(db_conn, None, role="anon"):
        # Documents current behavior: the policy's join through target_companies is hidden by
        # that table's owner-only RLS, so even a public report's chat history is owner-only —
        # despite the policy comment in schema.sql. Never the company chat either way.
        assert chat_count() == 0


def test_owner_can_see_run_status(db_conn, world):
    db_conn.execute("UPDATE target_companies SET run_status = 'running' WHERE id = %s", (world["company"],))
    with as_user(db_conn, world["owner"], "owner@example.com"):
        assert db_conn.execute("SELECT run_status FROM target_companies").fetchone()[0] == "running"
    with pytest.raises(psycopg.errors.CheckViolation):
        db_conn.execute("UPDATE target_companies SET run_status = 'weird'")


def test_owner_delete_cascades_including_chat(db_conn, world):
    with as_user(db_conn, world["owner"], "owner@example.com"):
        assert db_conn.execute("DELETE FROM target_companies WHERE id = %s", (world["company"],)).rowcount == 1
    for table in ("target_companies", "competitors", "sources", "snapshots", "signals", "reports", "chat_messages"):
        assert db_conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0, table


def test_profile_created_by_signup_trigger(db_conn, world):
    row = db_conn.execute("SELECT company_name, job_title FROM profiles WHERE id = %s", (world["owner"],)).fetchone()
    assert row == ("Acme", "CEO")
    with as_user(db_conn, world["stranger"]):
        assert db_conn.execute("SELECT count(*) FROM profiles").fetchone()[0] == 1  # only their own


def test_source_type_constraint_matches_collectors(db_conn, world):
    from backend.collectors import COLLECTOR_BY_SOURCE_TYPE

    for source_type in COLLECTOR_BY_SOURCE_TYPE:
        db_conn.execute("INSERT INTO sources (competitor_id, source_type, url) VALUES (%s, %s, 'u')",
                        (world["competitor"], source_type))
    with pytest.raises(psycopg.errors.CheckViolation):
        db_conn.execute("INSERT INTO sources (competitor_id, source_type, url) VALUES (%s, 'tiktok', 'u')",
                        (world["competitor"],))
