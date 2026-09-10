# Database

## Purpose
Stores tracked companies/competitors/sources, raw scraped snapshots (with embeddings for similarity search), detected signals, and assembled reports. Postgres + pgvector, hosted on Supabase.

## File structure
```
backend/db/models.py     # SQLAlchemy models — source of truth for the schema in code
backend/db/session.py    # engine/session setup, reads DATABASE_URL
infra/sql/schema.sql      # raw SQL version of the same schema, for `psql -f` against Supabase
```

## Build steps
1. Create a Supabase project (done — user already has one).
2. Run `infra/sql/schema.sql` against it: `psql "$DATABASE_URL" -f infra/sql/schema.sql`. This also runs `CREATE EXTENSION IF NOT EXISTS vector;` and creates an ivfflat index for pgvector similarity search.
3. Set `DATABASE_URL` in `.env` — **must** use the `postgresql+psycopg://` scheme, not plain `postgresql://` (see [decisions.md](./decisions.md) — this project uses psycopg v3, and SQLAlchemy defaults to psycopg2 without the `+psycopg` suffix).
4. `backend/db/session.py` reads `DATABASE_URL` at import time and exposes `SessionLocal` + a `get_session()` FastAPI dependency.

## Status
Applied and live on the production Supabase project (has been since the v1 build) — `schema.sql` is append-only/cumulative rather than a separate migrations folder, so re-running the whole file against an already-provisioned project is **not** safe (the early `CREATE TABLE` statements have no `IF NOT EXISTS`); apply only the new block(s) added since the last run. This session's additions were applied directly via `backend/db/session.py`'s engine (`DATABASE_URL`) from a one-off script rather than `psql`, since `psql` isn't installed on this machine — same effect, `schema.sql` still stays the durable record of what was applied.

As of 2026-09-10, beyond the v1 tables (`target_companies`/`competitors`/`sources`/`snapshots`/`signals`/`reports`), the schema also has:
- **v2 multi-tenancy**: `owner_id` on `target_companies` (nullable — the ownerless ComplyDo pilot stays a public portfolio demo), `status` on `sources` (`active`/`broken`/`needs_review`), `report_interval_days` on `target_companies`, `is_baseline` on `signals`, and a `profiles` table (populated by an `auth.users` insert trigger, not app code — see `docs/decisions.md`'s 2026-09-09 entry).
- **`dashboard_widgets`** — the customizable dashboard's widget configs, owner-scoped directly by `owner_id` (no parent row to join through, unlike the tables below).
- **`reports.visibility`** (`private`/`public`) and **`report_shares`** (per-email invites) — replaced the v1 "reports/signals are public read" policy, which had become a real cross-tenant leak once real users existed. See `docs/decisions.md`'s 2026-09-10 entry for the full RLS design, including the `SECURITY DEFINER` helper function the invite check needs.
- **`sources.source_type`** now also allows `'community'` (`backend/collectors/community_collector.py`).

RLS is enabled on every table except `snapshots`' write path (writes only ever go through the pipeline's direct `DATABASE_URL` connection, which uses the table-owning role and bypasses RLS entirely — RLS here only governs what the frontend's anon-key/session-based reads and writes can see).

## Gotchas
- `embedding VECTOR(384)` — dimension matches the local `all-MiniLM-L6-v2` model in [03-change-detection.md](./03-change-detection.md), not OpenAI's 1536-dim embeddings. If the embedding model ever changes, both `models.py` and `schema.sql` need updating together.
- Two `CHECK` constraints enumerate valid `source_type` values (`sources` and `dashboard_widgets`) — both were created inline without an explicit name, so Postgres auto-named them (`<table>_source_type_check`); adding a new source type means dropping and recreating both by that generated name, not just editing the `CREATE TABLE` in `schema.sql` (which only affects a fresh install).
- A policy's `USING`/`WITH CHECK` subquery runs as the *querying* role, not as the table owner — a policy on table A that inline-queries table B is silently defeated if B's own RLS denies that role read access to the row it needs. The `is_report_shared_with_me()` `SECURITY DEFINER` function exists specifically to route around this for the report-sharing feature; keep that pattern in mind before adding another cross-table policy check.
