# Decisions Log

Every non-obvious choice made while building this, in order, with the reasoning. Update this file whenever a decision changes — don't delete old entries, mark them superseded instead.

---

### 2026-09-01 — Database: Supabase (Postgres + pgvector)
Already decided in `context.md`. User has an existing Supabase project to use directly (no local Postgres needed).

### 2026-09-01 — LLM synthesis: Grok (xAI) instead of Claude/Anthropic
**Why:** User is a student building this for free/low-cost; already has an xAI API key. Anthropic was the original plan in `context.md` but wasn't cheaper/free for this use case.
**Effect:** `backend/analysis/analyst.py` and `backend/report/assembler.py` use the `openai` Python SDK pointed at `https://api.x.ai/v1` (xAI's API is OpenAI-compatible) instead of the `anthropic` SDK. Model constant: `grok-4` — check console.x.ai for the current model name if this errors as unavailable.
**Superseded** by the next entry — switched to Groq instead.

### 2026-09-02 — LLM synthesis: Groq instead of Grok/xAI
**Why:** User decided to switch providers ("i am changing to groq"). Note this is a genuinely different company/API from xAI's "Grok" despite the near-identical name — easy to mix up.
**Effect:** `backend/analysis/analyst.py` and `backend/report/assembler.py` now point the `openai` SDK at `https://api.groq.com/openai/v1` (also OpenAI-compatible) with `GROQ_API_KEY`, not `XAI_API_KEY`. `.env`/`.env.example` updated accordingly.
**Model chosen:** `openai/gpt-oss-120b` — queried `client.models.list()` against the real account to see what's actually available (the first guess, `llama-3.3-70b-versatile`, 404'd — deprecated/unavailable). gpt-oss-120b is a large open-weight reasoning model, chosen for quality on structured-output tasks.
**Gotcha found by testing, not guessing:** gpt-oss-120b is a *reasoning* model — it spends tokens on hidden chain-of-thought before the final answer, so a low `max_tokens` (tried 50) silently truncates it to an empty response, which then fails JSON-mode validation with an opaque `json_validate_failed` error. Fixed by raising `max_tokens` (2048 in analyst.py, 1024 in assembler.py) and setting `extra_body={"reasoning_effort": "low"}` to keep the hidden-reasoning overhead small for this task.
**Verified:** ran a real end-to-end call through `generate_headline_and_summary()` with real signal data — got back a coherent headline and 4-sentence exec summary from the live API, not a mock.

### 2026-09-01 — Embeddings: local sentence-transformers instead of OpenAI
**Why:** Student wants zero ongoing API cost. OpenAI embeddings are cheap but not free and require a billed account; a local open-source embedding model has no per-call cost and no key to manage.
**Effect:** `backend/detection/change_detector.py` uses `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim) run locally instead of OpenAI's `text-embedding-3-small` (1536-dim). This changed the `embedding` column dimension in `backend/db/models.py` and `infra/sql/schema.sql` from `VECTOR(1536)` to `VECTOR(384)`. Tradeoff: MiniLM is a smaller, less accurate model than OpenAI's — the eval set in `/eval` is what tells us if it's good enough for this use case; revisit if precision is poor.
**Superseded:** the `OPENAI_API_KEY` env var and OpenAI embeddings call from the original scaffold — no OpenAI account needed at all now.

### 2026-09-02 — Local dev Python: 3.12, not the system default 3.14
**Why:** Python 3.14 is too new — several dependencies (`pydantic-core`, `greenlet`) are Rust/C extensions with no prebuilt wheels for 3.14 yet, and building them from source failed (`pyo3` doesn't support 3.14 yet either). Python 3.12 was already installed on the machine and has full wheel coverage for every dependency here.
**Effect:** the project venv (`backend/.venv`) is created with `py -3.12 -m venv .venv`, not the bare `python` on PATH. Anyone setting this up locally needs Python 3.12 available (check with `py -0`).

### 2026-09-02 — Postgres driver: psycopg (v3) instead of psycopg2-binary
**Why:** `psycopg2-binary` had no wheel at all for the Python version being tested (3.14) and pip fell back to compiling from source, which failed without `pg_config`/PostgreSQL headers installed. `psycopg` v3 is the actively maintained successor with much better wheel coverage across Python versions.
**Effect:** `backend/requirements.txt` uses `psycopg[binary]==3.2.10`. SQLAlchemy's `postgresql://` URL scheme defaults to psycopg2 when it's absent — since only psycopg3 is installed here, `DATABASE_URL` must use the `postgresql+psycopg://` scheme (Supabase gives you `postgresql://`; just add `+psycopg`).
**Resolved:** installs cleanly under Python 3.12; verified with `pip install -r backend/requirements.txt`.

### 2026-09-02 — PDF rendering: Playwright instead of WeasyPrint
**Why:** WeasyPrint requires the GTK/Pango/cairo native libraries, which aren't installed by default on Windows and are painful to set up (this is a well-known WeasyPrint-on-Windows pain point, confirmed by an actual `OSError: cannot load library 'libgobject-2.0-0'` when tested). Playwright's Chromium is already a dependency (used by the jobs collector for JS-rendered career pages), so reusing it for PDF export avoids adding a second, fragile native dependency.
**Effect:** `backend/report/pdf_renderer.py` renders the Jinja2 HTML template to a temp `.html` file, navigates Chromium to it with `page.goto()` (`page.set_content()` was tried first but doesn't reliably resolve local `file://` image sources — charts rendered as broken image icons), then calls `page.pdf()`. `weasyprint` removed from `backend/requirements.txt`.
**Verified:** ran a full smoke test with fake signal data — charts render correctly and the PDF layout, colors, and priority badges all look right (see `docs/06-report-assembly.md`).

### 2026-09-02 — Change-detection threshold recalibrated for local embeddings: 0.98, not 0.92
**Why:** The original 0.92 threshold was written for OpenAI's `text-embedding-3-small`. Local MiniLM (`all-MiniLM-L6-v2`) produces much more compressed cosine similarities — a *real*, meaningful content change (price + feature change) still scored 0.965 similarity, which the 0.92 threshold classified as noise (a false negative). Swept thresholds 0.92 → 0.98 against the 2-example placeholder eval set; 0.97+ correctly separates the one real-change example (0.965) from the one noise example (0.991).
**Effect:** `DEFAULT_SIMILARITY_THRESHOLD` in `backend/detection/change_detector.py` is now `0.98`.
**Caveat — not actually tuned yet:** this is calibrated on only 2 synthetic placeholder examples, not real data. Treat it as a starting point, not a trustworthy number. Must be re-tuned once real labeled snapshot pairs from actual competitor pages are added to `/eval/change_detection_eval_set.json`.

### 2026-09-02 — Renamed `pipeline/` to `backend/`
**Why:** User asked for clearer naming that matches `frontend/` — "pipeline" described what the code does, but didn't read as the counterpart to the frontend directory the way "backend" does.
**Effect:** directory renamed via `git mv`, and every import (`from pipeline.` → `from backend.`), path reference, and doc mention updated across `eval/`, `infra/`, `README.md`, and `docs/*.md`. Verified nothing broke: recompiled all files, re-ran the eval harness and the report-rendering smoke test after the rename — both still pass.
