# Build Overview

How Founder's Radar gets built, broken into one doc per feature/component. Each doc covers: what it does, its file structure, the steps to build/run it, and current status. See [`decisions.md`](./decisions.md) for the "why" behind every non-obvious choice made along the way.

## Build order

| # | Doc | What it covers | Status |
|---|-----|-----------------|--------|
| 1 | [01-database.md](./01-database.md) | Supabase/Postgres schema, pgvector | Schema written, not yet applied |
| 2 | [02-collectors.md](./02-collectors.md) | Scraping pricing/feature/jobs/news sources | Code written, untested against real URLs |
| 3 | [03-change-detection.md](./03-change-detection.md) | Embedding similarity, local model | Code written, model not yet downloaded/tested |
| 4 | [04-analyst-validator.md](./04-analyst-validator.md) | Grok-powered analysis + hallucination check | Code written, needs XAI_API_KEY to test |
| 5 | [05-scoring.md](./05-scoring.md) | Priority rubric | Done — pure logic, no external deps |
| 6 | [06-report-assembly.md](./06-report-assembly.md) | Charts, PDF rendering | Code written, WeasyPrint install unverified on Windows |
| 7 | [07-frontend.md](./07-frontend.md) | Next.js report viewer | Scaffolded, not run |
| 8 | [08-infra-scheduling.md](./08-infra-scheduling.md) | Cloud Function + Scheduler | Scaffolded, not deployed |

## Current blocker

Local pip install of `pipeline/requirements.txt` failed on `psycopg2-binary` — no prebuilt wheel for Python 3.14 yet, so pip tried (and failed) to compile it from source. Being fixed now (see [01-database.md](./01-database.md)).

## Repo layout

```
founders-radar/
├── pipeline/       # Python backend — the actual engine
├── eval/           # change-detection eval set + precision runner
├── frontend/       # Next.js report viewer
├── infra/          # Cloud Function, Scheduler config, SQL schema
└── docs/           # this folder
```
