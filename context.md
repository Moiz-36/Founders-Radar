# CLAUDE.md — Founder's Radar Project Context

> **Superseded 2026-09-04 by the v2 pivot** — this is the original v1 planning brief, kept as-is for the historical record (the "Non-Goals" section below, in particular, no longer holds — auth/multi-tenancy/payments went from explicitly out-of-scope to built). For the current plan and status, see `docs/09-v2-plan.md` (plan/page map) and `docs/decisions.md` (dated build log, most recent entry 2026-09-10). The pipeline architecture described below (collectors → change detector → analyst → scorer → assembler) is still accurate — v2 builds a multi-tenant product on top of it, not a replacement.

This file is the full context for building **Founder's Radar**, a market-intelligence pipeline that watches a startup's competitors and produces a weekly report. Read this fully before writing code. Ask clarifying questions if anything below is ambiguous rather than guessing.

---

## 1. Project Overview

**What it is**: A pipeline that tracks a defined set of competitors for one target company, detects meaningful changes (pricing, features, hiring, press), synthesizes them into a written analysis, and outputs a designed report (PDF and/or webpage) with charts.

**Why it exists**: This is a portfolio/outreach project — the finished report will be sent directly to a startup founder (pilot target: **ComplyDo**, a compliance-automation startup) as a personalized, unsolicited demonstration of the builder's skills. It is not being built as a SaaS product to sell (similar tools already exist commercially — Competely, Cassidy AI, Signum.AI — this project deliberately does not try to compete with them; it's a small, personalized, single-company version built to demonstrate technical + product judgment).

**Public repo**: This project will be published on GitHub as a portfolio piece, so code quality, README clarity, and commit hygiene matter — write it as if a technical founder will read the source, not just the output.

---

## 2. Goals & Non-Goals

**Goals**
- A working end-to-end pipeline: scrape → detect change → analyze → score → assemble report
- One real, populated report for ComplyDo's actual market (2-3 real competitors)
- A clean, designed final report (not a raw data dump) — this is the artifact a founder will actually see
- Clean, well-documented, portfolio-quality code and README

**Non-goals (do not build these unless explicitly asked later)**
- No user accounts, auth, or multi-tenant support — this is single-company, single-run for now
- No AI-generated video/narration — dropped from scope
- No mobile app
- No payment/subscription logic
- No attempt to track more than ~3 competitors or more than ~4 source types for v1

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend / pipeline | **FastAPI** (Python) | Reused from a prior project (WanderSafe) — familiar stack |
| Database | **PostgreSQL + pgvector**, hosted on **Supabase** | Stores raw signals, embeddings, report history |
| ORM | **SQLAlchemy** | Consistent with prior project conventions |
| Scraping | `requests` + `BeautifulSoup` for static pages; `Playwright` for JS-heavy pages | Rate-limited, polite scraping — respect robots.txt |
| Embeddings | OpenAI or equivalent embeddings API | Used for both RAG retrieval and semantic change detection |
| LLM synthesis | Claude or GPT API | Used for the analyst step (turning raw signals into "what changed / why it matters") |
| Charts | `matplotlib` (server-side, rendered to PNG/SVG) or a JS chart lib rendered at build time | Embedded directly into the report |
| PDF generation | HTML/CSS template → PDF via **WeasyPrint** (or similar) | Design the report visually with normal web styling first |
| Report frontend (if webpage delivery is used) | **Next.js**, deployed on **Vercel** | Reads finished report data from Supabase and renders it — no scraping or heavy compute happens here |
| Scheduling / background jobs | **Google Cloud Functions + Cloud Scheduler** | Reused from a prior project (World Cup prediction) — do NOT try to run scraping or scheduled jobs on Vercel (function timeout limits make this unreliable) |
| Language | Python for backend/pipeline, TypeScript for frontend | |

**Architecture principle**: Keep the heavy pipeline (scraping, detection, analysis, report generation) entirely separate from the frontend. Vercel only ever serves/reads the *finished* report from the database — it never runs scraping or generation logic itself.

---

## 4. Pipeline Architecture

```
[Collector Agents] → [Change Detector] → [Analyst] → [Scorer] → [Report Assembler] → [PDF/Web Renderer]
```

### 4.1 Collector Agents
One collector per source type:
- Competitor pricing page scraper
- Competitor feature/changelog/blog scraper
- Competitor job postings scraper (a job board or careers page)
- One news/mentions source (Product Hunt / Hacker News / general news search API)

Each collector:
- Fetches current content
- Hashes it (e.g. SHA-256 of normalized text)
- Compares against the last stored hash for that source — only passes content downstream if the hash changed
- Respects rate limits and robots.txt; includes backoff/retry logic

### 4.2 Change Detector
- Naive text diffing is too noisy (cosmetic rewording ≠ real change) — do NOT just diff raw text.
- Instead: embed the old and new content, compute cosine similarity, and flag as a "real" change only if similarity falls below a defined threshold.
- Build a small labeled eval set (20-30 hand-labeled examples of "real signal" vs "noise") to tune and report a precision number for this step. Keep this eval set in the repo (`/eval/`) — it's a legitimate engineering artifact worth showing.

### 4.3 Analyst (RAG + LLM)
- For each detected change, retrieve relevant context via pgvector similarity search
- Prompt the LLM to produce structured output: `{source, what_changed, why_it_matters, suggested_response (optional)}`
- **Validator step**: before accepting the analyst's output, check it against the source content (e.g. does the "what changed" claim actually appear in the diffed content) to reduce hallucination. Log/flag anything that fails this check rather than silently dropping it.

### 4.4 Scorer
- Assign each signal a priority: High / Medium / Low
- Simple, explainable rubric to start (e.g. pricing changes > new feature launches > hiring signals > press mentions) — keep this tunable, not hardcoded deep in logic

### 4.5 Report Assembler
- Takes the week's structured, scored signals
- Populates:
  - Header (company + date range + one-line headline)
  - Executive summary (3-4 sentences)
  - Signal cards (source / what changed / why it matters / suggested response / priority tag)
  - Chart data: signal volume by competitor, category breakdown, activity timeline
  - Appendix of raw source links

### 4.6 Renderer
- Renders the assembled report as: (a) a styled PDF via HTML/CSS → WeasyPrint, and/or (b) data written to Supabase for the Next.js frontend to render as a webpage
- Design the report to look like a finished analyst artifact — not a developer's raw output. Clean typography, real hierarchy, charts embedded (not just described in text).

---

## 5. Database Schema (Supabase / Postgres)

```sql
-- Companies being tracked (the pilot target, e.g. ComplyDo)
CREATE TABLE target_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Competitors tracked per target company
CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_company_id UUID REFERENCES target_companies(id),
    name TEXT NOT NULL,
    website TEXT
);

-- Sources being monitored per competitor
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES competitors(id),
    source_type TEXT CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news')),
    url TEXT NOT NULL,
    last_content_hash TEXT,
    last_checked_at TIMESTAMPTZ
);

-- Raw snapshots of scraped content (for diffing/history)
CREATE TABLE snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id),
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    embedding VECTOR(1536),  -- adjust dimension to match embedding model used
    fetched_at TIMESTAMPTZ DEFAULT now()
);

-- Detected + analyzed signals
CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id),
    old_snapshot_id UUID REFERENCES snapshots(id),
    new_snapshot_id UUID REFERENCES snapshots(id),
    similarity_score FLOAT,
    what_changed TEXT,
    why_it_matters TEXT,
    suggested_response TEXT,
    priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
    validated BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Assembled weekly reports
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_company_id UUID REFERENCES target_companies(id),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    headline TEXT,
    executive_summary TEXT,
    signal_ids UUID[],
    chart_data JSONB,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Repo Structure

```
founders-radar/
├── README.md                    # portfolio-facing — explain the project, the "why", screenshots of a real report
├── CLAUDE.md                    # this file
├── pipeline/                    # Python backend — the actual engine
│   ├── collectors/
│   │   ├── pricing_collector.py
│   │   ├── feature_collector.py
│   │   ├── jobs_collector.py
│   │   └── news_collector.py
│   ├── detection/
│   │   └── change_detector.py
│   ├── analysis/
│   │   ├── analyst.py           # RAG + LLM synthesis
│   │   └── validator.py         # hallucination-check step
│   ├── scoring/
│   │   └── scorer.py
│   ├── report/
│   │   ├── assembler.py
│   │   ├── charts.py
│   │   └── pdf_renderer.py
│   ├── db/
│   │   ├── models.py            # SQLAlchemy models matching schema above
│   │   └── session.py
│   ├── main.py                  # FastAPI app entrypoint / pipeline orchestration
│   └── requirements.txt
├── eval/
│   ├── change_detection_eval_set.json   # labeled real-signal vs noise examples
│   └── run_eval.py
├── frontend/                    # Next.js app — deployed on Vercel
│   ├── app/
│   │   └── report/[id]/page.tsx # renders a finished report from Supabase
│   ├── components/
│   └── package.json
└── infra/
    ├── cloud_function/           # scheduled pipeline trigger (GCP)
    └── scheduler_config.yaml
```

---

## 7. Build Phases (matches the 2-week plan already agreed)

**Phase 1 — Scope + report design (days 1-2)**
- Finalize ComplyDo + 2-3 real competitors and exact source URLs
- Design report layout (can be a static HTML/CSS mockup before any pipeline logic exists)

**Phase 2 — Data pipeline (days 3-5)**
- Build collectors, hashing/dedup, change detection with embedding similarity
- Populate the eval set, get an initial precision number

**Phase 3 — Analysis pipeline (days 6-8)**
- RAG retrieval + analyst step + validator step
- Scoring logic

**Phase 4 — Report assembly (days 9-11)**
- Chart generation
- HTML/CSS report template wired to real pipeline output
- PDF rendering

**Phase 5 — Run + polish (days 12-14)**
- Full end-to-end run on ComplyDo's real market
- Review output as if you were the founder receiving it; cut noise
- Polish visual design, write the README, prep the GitHub repo for public viewing

---

## 8. Environment Variables (expected)

```
DATABASE_URL=            # Supabase Postgres connection string
SUPABASE_URL=
SUPABASE_ANON_KEY=
OPENAI_API_KEY=          # or equivalent, for embeddings + LLM calls
ANTHROPIC_API_KEY=       # if using Claude for the analyst step
GCP_PROJECT_ID=          # for Cloud Functions/Scheduler
```

---

## 9. Coding Conventions

- Python: type hints throughout, docstrings on all pipeline functions (this code will be read by others as a portfolio piece)
- Keep each pipeline stage (collect / detect / analyze / score / assemble / render) as an independently callable, independently testable function — do not couple stages tightly, so each can be demoed or debugged in isolation
- Log every pipeline run's key decisions (what was flagged as a change, what the similarity score was, what got filtered as noise) — this makes the "how do you avoid false positives" story concrete and demoable, not just claimed
- Commit in logical, readable chunks (one phase/feature per commit or small group of commits) — this repo will be public and may be reviewed by a technical founder

---

## 10. Open Decisions (flag these back to the user, don't assume)

- Exact competitor list + source URLs for the ComplyDo pilot — not yet finalized
- Final choice of embeddings/LLM provider (OpenAI vs Anthropic vs other) — not yet finalized
- Whether the final delivery is PDF-only, webpage-only, or both — leaning both, but confirm before building both to avoid wasted work
