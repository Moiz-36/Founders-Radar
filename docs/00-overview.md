# Build Overview

How Founder's Radar gets built, broken into one doc per feature/component. Each doc covers: what it does, its file structure, the steps to build/run it, and current status. See [`decisions.md`](./decisions.md) for the "why" behind every non-obvious choice made along the way.

## Build order

| # | Doc | What it covers | Status |
|---|-----|-----------------|--------|
| 1 | [01-database.md](./01-database.md) | Supabase/Postgres schema, pgvector | Schema written, not yet applied to the real Supabase project |
| 2 | [02-collectors.md](./02-collectors.md) | Scraping pricing/feature/jobs/news sources | **Verified against real sites** — all 7 ComplyDo-pilot sources fetch real content; 3 real bugs found & fixed (robots.txt UA, news-collector robots check, Cloudflare-protected page) |
| 3 | [03-change-detection.md](./03-change-detection.md) | Embedding similarity, local model | Working — local model verified, threshold calibrated on synthetic data only |
| 4 | [04-analyst-validator.md](./04-analyst-validator.md) | Groq-powered analysis + hallucination check | **Verified** — real end-to-end call tested against the live API |
| 5 | [05-scoring.md](./05-scoring.md) | Priority rubric | Done — pure logic, no external deps |
| 6 | [06-report-assembly.md](./06-report-assembly.md) | Charts, PDF rendering | **Verified end-to-end** with a smoke test (fake signal data) — charts and PDF both render correctly |
| 7 | [07-frontend.md](./07-frontend.md) | Next.js report viewer | Scaffolded, not run |
| 8 | [08-infra-scheduling.md](./08-infra-scheduling.md) | Cloud Function + Scheduler | Scaffolded, not deployed |

## Current blocker

Schema applied, `.env` filled in, ComplyDo + Vanta + Drata seeded, all 7 collectors verified against real sites, and a **full real pipeline run completed end-to-end** for the first time (7 baseline snapshots stored, real Groq-generated summary, real PDF rendered) — see [decisions.md](./decisions.md), 2026-09-03 entries. What's left:
1. A **second** real run is needed to actually see a signal detected — the first run only established baseline snapshots (nothing to diff against yet). Either wait for real content to change, or hand-edit a stored snapshot to simulate a change, to exercise detect→analyze→score end-to-end.
2. Re-tune the change-detection similarity threshold (currently 0.98, calibrated on 2 synthetic examples) once real snapshot pairs exist.
3. Decide a real scheduling cadence and wire up `infra/` (currently scaffolded, not deployed) so this runs weekly on its own instead of by hand.

## Repo layout

```
founders-radar/
├── backend/        # Python backend — the actual engine
├── eval/           # change-detection eval set + precision runner
├── frontend/       # Next.js report viewer
├── infra/          # Cloud Function, Scheduler config, SQL schema
└── docs/           # this folder
```
