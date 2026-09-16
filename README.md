# Founder's Radar

A market-intelligence platform that tracks a company's competitors — pricing, features, hiring, press, review-site ratings, and community buying-intent chatter — and turns detected changes into a designed report, on a schedule, per company.

## Why this exists

This started as a small, single-company pipeline built as a personalized, unsolicited demo — a way to show real technical and product judgment on a real problem, not a from-scratch attempt to out-build the commercial competitive-intelligence tools that already exist in this space.

After that first version worked end-to-end against real data, it was rebuilt into a real multi-tenant product: any signed-in user can track their own set of companies, with AI-assisted (human-reviewed) competitor/source discovery instead of hand-curated data. See `docs/09-v2-plan.md` for the pivot's plan and `docs/decisions.md` for the full build log. It's still a solo-built portfolio project, not a company — code quality, README clarity, and commit hygiene matter for the same reason as before.

## How it works

```
Discovery (LLM + web search) → Collectors → Change Detector → Analyst (RAG + LLM) → Scorer → Report Assembler → PDF/Web Renderer
```

1. **Discovery** (per tracked company): an LLM + Tavily web search propose competitors and their pricing/feature/jobs/review/news/community source URLs; the user reviews and edits before anything is saved — never fully autonomous.
2. **Collectors** fetch each competitor's pricing page, feature/changelog page, job board, review-site profile (G2/Capterra/Trustpilot), recent press mentions, and community buying-intent chatter (HN — "alternative to X", "switching from X"), hashing content to detect any change at all.
3. **Change detector** embeds old vs. new content and flags a *real* change only when cosine similarity drops below a tuned threshold — plain text diffing is too noisy (a reworded sentence isn't a signal). Tuned and precision-tested against a hand-labeled eval set in [`/eval`](./eval).
4. **Analyst** retrieves related historical context via pgvector similarity search and prompts an LLM to explain what changed and why it matters to a competing founder.
5. **Validator** checks the analyst's claim against the actual diffed content before it's trusted, to catch hallucination — flagged failures are logged, not silently dropped.
6. **Scorer** assigns High/Medium/Low priority via a small, explicit rubric (`backend/scoring/scorer.py`) rather than logic buried deep in the pipeline.
7. **Report assembler + renderer** turns the period's scored signals into a designed PDF and web report — headline, executive summary, signal cards (each with a raw old-vs-new diff alongside the LLM summary), charts, source appendix. The report's owner controls who can see it (private, invited by email, or public) once it's live.

Runs per company on that company's own configurable interval (Cloud Scheduler → Cloud Run), not one shared weekly cron.

## Stack

FastAPI · PostgreSQL + pgvector (Supabase, with Row Level Security enforcing per-owner access) · SQLAlchemy · BeautifulSoup / Playwright · local sentence-transformers embeddings (free, no API key) · Groq (analyst + discovery) · Tavily (discovery web search) · matplotlib · Playwright/Chromium (PDF rendering) · Next.js + Supabase Auth (email/password, Google, GitHub) · Google Cloud Run + Cloud Scheduler

The pipeline (discovery/scraping/detection/analysis/rendering) is fully decoupled from the frontend, which reads/writes Supabase directly (via RLS-scoped queries, or the backend's `/discover`/`/run` endpoints for pipeline-triggering actions) — it never runs scraping or generation itself.

## Repo layout

```
backend/        # Python backend — discovery, collectors, detection, analysis, scoring, report assembly/rendering
eval/           # labeled change-detection eval set + precision runner
frontend/       # Next.js app — auth, dashboard, company management, custom widget dashboard, report viewer/sharing
infra/          # Cloud Run + Cloud Scheduler config, Dockerfile, SQL schema
```

## Running it locally

```bash
# Backend (requires Python 3.12 — 3.14 is too new, several deps have no wheels for it yet)
py -3.12 -m venv .venv
./.venv/Scripts/pip install -r backend/requirements.txt
./.venv/Scripts/python -m playwright install chromium
cp .env.example .env   # fill in DATABASE_URL, GROQ_API_KEY, TAVILY_API_KEY, SUPABASE_*
./.venv/Scripts/uvicorn backend.main:app --reload

# Database — schema.sql is cumulative/append-only, safe to run once against a fresh
# Supabase project; against an already-provisioned one, apply only the new block(s).
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

Live in production on GCP (Cloud Run + Cloud Scheduler, per-company schedule). Both the original pipeline and the v2 multi-tenant product have been verified against real data and real accounts, not synthetic fixtures — see `docs/decisions.md` for the full dated trail, including every real bug found along the way (scraping edge cases, a Cloudflare-protected page, and a Supabase RLS gap that made reports/signals world-readable until it was caught and fixed).

Open items:
- Populate `/eval` with more real labeled examples — the change-detection similarity threshold is still calibrated on a small hand-labeled set (see `docs/decisions.md`).
- Email notifications on new reports (Phase 3 of the v2 plan) — provider not yet chosen.
- No git remote is configured on the dev machine yet — the full history exists only as local commits until this is pushed somewhere.

See [`docs/09-v2-plan.md`](./docs/09-v2-plan.md) for the current plan/status and [`docs/decisions.md`](./docs/decisions.md) for every non-obvious choice made along the way. [`docs/00-overview.md`](./docs/00-overview.md) still describes the original v1 pipeline build plan, which v2 builds on top of rather than replaces.
