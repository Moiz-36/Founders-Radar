# CLAUDE.md — Founder's Radar Project Context

This is the current, living context for **Founder's Radar** — read this before making changes, and treat `docs/decisions.md` (dated build log) and `docs/09-v2-plan.md` (plan/page map) as the deeper record behind any non-obvious choice mentioned here. This file used to be the frozen v1 planning brief; it's been rewritten to describe what's actually built and live today, not what was originally planned.

---

## 1. What this is, right now

Founder's Radar is a **live, multi-tenant** market-intelligence product: any signed-in user tracks their own set of companies, and for each one, their own set of competitors and sources (pricing, feature, job postings, reviews, news, community chatter, or a general catch-all page). A scheduled pipeline scrapes those sources, detects real changes, has an LLM explain what changed and why it matters, scores priority, and assembles the result into a report (web + PDF) with a chat assistant you can ask follow-up questions.

It's a solo-built portfolio project, not a company — no funding, no team. It started as a single-company demo pipeline (see `docs/decisions.md`'s earliest entries for that history) and was rebuilt into the current product; see `docs/09-v2-plan.md` for that pivot's plan.

**Public repo**: published on GitHub, so code quality, README clarity, and commit hygiene matter — write it as if a technical reader will read the source, not just use the app.

---

## 2. Goals & non-goals

**In scope and built**: multi-tenant auth (email/password + Google/GitHub OAuth via Supabase Auth), per-owner Row Level Security, AI-assisted discovery (LLM + web search proposes competitors/sources, human reviews before anything saves — never fully autonomous), the full collect → detect → analyze → score → assemble → render pipeline, a founder Q&A chat assistant (report-scoped and company-scoped), custom dashboard widgets, report sharing (private/public/email-invited), and a public marketing site.

**Still out of scope** (don't build unless explicitly asked):
- Payment/subscription logic — no billing exists
- A native mobile app
- Fully autonomous discovery with no human review step

---

## 3. Tech stack (as actually deployed, not as originally planned)

| Layer | Choice |
|---|---|
| Backend / pipeline | **FastAPI** (Python) |
| Database | **PostgreSQL + pgvector**, hosted on **Supabase**, with Row Level Security enforcing per-owner access |
| ORM | **SQLAlchemy** |
| Scraping | `requests` + `BeautifulSoup` for static pages; `Playwright` for JS-heavy pages (also used for PDF rendering) |
| Embeddings | **local `sentence-transformers`** — free, no API key, used for both RAG retrieval and semantic change detection |
| LLM synthesis | **Groq** (OpenAI-compatible API) — analyst, discovery, chat, executive summaries |
| Web search (discovery) | **Tavily** |
| Charts | `matplotlib`, rendered server-side to PNG for the PDF; hand-built SVG/Tailwind charts on the web report |
| Frontend | **Next.js**, deployed on **Vercel** |
| Auth | **Supabase Auth** (email/password, Google, GitHub) |
| Backend hosting | **Google Cloud Run** — two separate services: one public (`founders-radar-api`, serves the frontend's real-time discover/chat/run-now calls) and one private (`founders-radar-pipeline`, only invokable by Cloud Scheduler, runs the daily scheduled multi-company pipeline pass) |
| Scheduling | **Google Cloud Scheduler** → the private Cloud Run service, once daily; each company's own `report_interval_days` decides whether it's actually due that day |

**Architecture principle**: the pipeline (scraping/detection/analysis/rendering) is fully decoupled from the frontend. The frontend reads/writes Supabase directly for everything except pipeline-triggering actions (discover/run/chat), which go through the public API service — protected by a shared-secret header (`PIPELINE_SHARED_SECRET`) since that service is public, not `--no-allow-unauthenticated` like the scheduled one.

---

## 4. Pipeline architecture

```
Discovery (LLM + web search) → Collectors → Change Detector → Analyst (RAG + LLM) → Scorer → Report Assembler → PDF/Web Renderer
```

1. **Discovery** (`backend/discovery/`) — per tracked company, proposes competitors and their source URLs; human reviews/edits before anything saves.
2. **Collectors** (`backend/collectors/`) — one per source type (pricing, feature, job_posting, news, community, review, general), each hashes fetched content and only passes it downstream if the hash changed.
3. **Change detector** (`backend/detection/`) — embeds old vs. new content, flags a real change only when cosine similarity drops below a tuned threshold. Precision-tested against a hand-labeled eval set in `/eval`.
4. **Analyst** (`backend/analysis/analyst.py`) — retrieves related historical context via pgvector similarity search, prompts the LLM for `{what_changed, why_it_matters, suggested_response}`.
5. **Validator** (`backend/analysis/validator.py`) — checks the analyst's claim against the actual diffed content before trusting it; flagged failures are logged, not silently dropped.
6. **Scorer** (`backend/scoring/scorer.py`) — assigns High/Medium/Low priority via a small, explicit rubric.
7. **Report assembler + renderer** (`backend/report/`) — turns the period's scored signals into a designed PDF and web report; owner controls visibility (private/invited/public) once live.
8. **Chat** (`backend/chat/qa.py`) — a Q&A assistant scoped to one report's signals, or (via pgvector search) a whole company's history.

For the actual current database schema, read `infra/sql/schema.sql` directly rather than trusting a copy here — it's the single source of truth and changes often enough that a duplicate would drift.

---

## 5. Repo structure

```
founders-radar/
├── README.md              # portfolio-facing
├── context.md             # this file
├── backend/                # Python pipeline + FastAPI app
│   ├── collectors/
│   ├── detection/
│   ├── discovery/
│   ├── analysis/           # analyst.py, validator.py
│   ├── scoring/
│   ├── chat/                # qa.py — founder Q&A assistant
│   ├── report/              # assembler.py, charts.py, pdf_renderer.py, diff_util.py, storage.py
│   ├── db/                  # models.py, session.py, seed.py
│   └── main.py               # FastAPI app entrypoint / pipeline orchestration
├── eval/                    # labeled change-detection eval set + precision runner
├── frontend/                 # Next.js app — auth, dashboard, company management, custom
│                              # widget dashboard, report viewer/sharing, marketing site
├── infra/
│   ├── api/                  # Dockerfile + cloudbuild.yaml for the public Cloud Run API service
│   ├── cloud_function/       # Dockerfile + entrypoint for the private scheduled Cloud Run service
│   ├── scheduler_config.yaml
│   └── sql/schema.sql        # authoritative current database schema
└── docs/                      # 09-v2-plan.md (plan), decisions.md (dated build log), others per-stage
```

---

## 6. Environment variables (current)

```
DATABASE_URL=             # Supabase Postgres connection string (postgresql+psycopg:// scheme)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # backend-only, uploads PDFs to Storage, bypasses RLS
GROQ_API_KEY=              # analyst, discovery, chat, exec-summary synthesis
TAVILY_API_KEY=            # discovery web search
GCP_PROJECT_ID=
PIPELINE_SHARED_SECRET=    # required once the API service is public — see backend/main.py
```

No OpenAI or Anthropic key needed anywhere — embeddings run locally, LLM calls go through Groq.

---

## 7. Coding conventions

- Python: type hints throughout, docstrings on pipeline functions.
- Keep each pipeline stage (collect / detect / analyze / score / assemble / render) independently callable and testable — don't couple stages tightly.
- Log every pipeline run's key decisions (what was flagged as a change, what the similarity score was, what got filtered as noise).
- Commit in logical, readable chunks — this repo is public.
- When something non-obvious gets decided or a real bug gets found and fixed, write it up in `docs/decisions.md` rather than only in a commit message — that file is what lets a fresh read of the project (human or AI) understand *why*, not just *what*.
