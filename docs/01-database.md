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
Schema written and matches `models.py` exactly. **Not yet applied** to the actual Supabase project — run step 2 above.

## Gotchas
- `embedding VECTOR(384)` — dimension matches the local `all-MiniLM-L6-v2` model in [03-change-detection.md](./03-change-detection.md), not OpenAI's 1536-dim embeddings. If the embedding model ever changes, both `models.py` and `schema.sql` need updating together.
