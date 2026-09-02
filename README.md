# Founder's Radar

A market-intelligence pipeline that tracks a startup's competitors — pricing, features, hiring, press — and turns detected changes into a designed weekly report.

## Why this exists

This is a personalized, unsolicited demo built for a real startup founder (pilot target: **ComplyDo**, a compliance-automation company), not a SaaS product. Tools like this already exist commercially (Competely, Cassidy AI, Signum.AI); this project is a small, single-company version meant to demonstrate technical and product judgment, not to compete with them.

## How it works

```
Collectors → Change Detector → Analyst (RAG + LLM) → Scorer → Report Assembler → PDF/Web Renderer
```

1. **Collectors** scrape each competitor's pricing page, feature/changelog page, job board, and recent press mentions, hashing content to detect any change at all.
2. **Change detector** embeds old vs. new content and flags a *real* change only when cosine similarity drops below a tuned threshold — plain text diffing is too noisy (a reworded sentence isn't a signal). Tuned and precision-tested against a hand-labeled eval set in [`/eval`](./eval).
3. **Analyst** retrieves related historical context via pgvector similarity search and prompts an LLM to explain what changed and why it matters to a competing founder.
4. **Validator** checks the analyst's claim against the actual diffed content before it's trusted, to catch hallucination — flagged failures are logged, not silently dropped.
5. **Scorer** assigns High/Medium/Low priority via a small, explicit rubric (`pipeline/scoring/scorer.py`) rather than logic buried deep in the pipeline.
6. **Report assembler + renderer** turns the week's scored signals into a designed PDF (and/or webpage) — headline, executive summary, signal cards, charts, source appendix.

## Stack

FastAPI · PostgreSQL + pgvector (Supabase) · SQLAlchemy · BeautifulSoup / Playwright · local sentence-transformers embeddings (free, no API key) · Grok/xAI (analyst) · matplotlib · WeasyPrint · Next.js (Vercel)

The pipeline (scraping/detection/analysis/rendering) is fully decoupled from the frontend — Vercel only ever reads a *finished* report from Supabase; it never runs scraping or generation.

## Repo layout

```
pipeline/       # Python backend — collectors, detection, analysis, scoring, report assembly/rendering
eval/           # labeled change-detection eval set + precision runner
frontend/       # Next.js app that renders a finished report from Supabase
infra/          # Cloud Function + Cloud Scheduler config, SQL schema
```

## Running it locally

```bash
# Pipeline (requires Python 3.12 — 3.14 is too new, several deps have no wheels for it yet)
py -3.12 -m venv .venv
./.venv/Scripts/pip install -r pipeline/requirements.txt
./.venv/Scripts/python -m playwright install chromium
cp .env.example .env   # fill in DATABASE_URL (postgresql+psycopg://...) and XAI_API_KEY
./.venv/Scripts/uvicorn pipeline.main:app --reload

# Database (once, against your Supabase project)
psql "$DATABASE_URL" -f infra/sql/schema.sql

# Eval
./.venv/Scripts/python -m eval.run_eval

# Frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

No OpenAI account needed — embeddings run locally via `sentence-transformers` at zero cost.

## Status

Pipeline is scaffolded end-to-end and dependencies install cleanly. Report generation (charts + PDF) has been smoke-tested with fake signal data and works. Not yet run against real scraped data. Open items before the first real report can be generated:
- Finalize the ComplyDo competitor list and exact source URLs
- Populate `/eval` with real labeled examples and report an actual precision number (the current 0.98 similarity threshold is only calibrated on 2 synthetic placeholder examples — see `docs/decisions.md`)
- Confirm final delivery format (PDF, webpage, or both)

See [`docs/00-overview.md`](./docs/00-overview.md) for the full build plan and [`docs/decisions.md`](./docs/decisions.md) for every non-obvious choice made along the way.
