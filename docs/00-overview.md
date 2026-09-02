# Build Overview

How Founder's Radar gets built, broken into one doc per feature/component. Each doc covers: what it does, its file structure, the steps to build/run it, and current status. See [`decisions.md`](./decisions.md) for the "why" behind every non-obvious choice made along the way.

## Build order

| # | Doc | What it covers | Status |
|---|-----|-----------------|--------|
| 1 | [01-database.md](./01-database.md) | Supabase/Postgres schema, pgvector | Schema written, not yet applied to the real Supabase project |
| 2 | [02-collectors.md](./02-collectors.md) | Scraping pricing/feature/jobs/news sources | Code written, still untested against real URLs — next real blocker |
| 3 | [03-change-detection.md](./03-change-detection.md) | Embedding similarity, local model | Working — local model verified, threshold calibrated on synthetic data only |
| 4 | [04-analyst-validator.md](./04-analyst-validator.md) | Grok-powered analysis + hallucination check | Code written, needs `XAI_API_KEY` in `.env` to test against a real call |
| 5 | [05-scoring.md](./05-scoring.md) | Priority rubric | Done — pure logic, no external deps |
| 6 | [06-report-assembly.md](./06-report-assembly.md) | Charts, PDF rendering | **Verified end-to-end** with a smoke test (fake signal data) — charts and PDF both render correctly |
| 7 | [07-frontend.md](./07-frontend.md) | Next.js report viewer | Scaffolded, not run |
| 8 | [08-infra-scheduling.md](./08-infra-scheduling.md) | Cloud Function + Scheduler | Scaffolded, not deployed |

## Current blocker

Real competitor URLs for the ComplyDo pilot. Everything downstream of the collectors (change detection, analysis, scoring, report assembly) has been exercised with synthetic/fake data, but none of it has run against a real scraped page yet — that requires knowing which competitors and source URLs to point at. Once resolved, `.env` also needs `DATABASE_URL` (Supabase, `postgresql+psycopg://...`) and `XAI_API_KEY` filled in before the pipeline can run for real.

## Repo layout

```
founders-radar/
├── backend/        # Python backend — the actual engine
├── eval/           # change-detection eval set + precision runner
├── frontend/       # Next.js report viewer
├── infra/          # Cloud Function, Scheduler config, SQL schema
└── docs/           # this folder
```
