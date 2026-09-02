# Analyst + Validator

## Purpose
Turn a detected raw change into a structured, explainable signal (`what_changed` / `why_it_matters` / `suggested_response`), using RAG (pgvector similarity search over prior snapshots) + an LLM — then check the LLM's claim is actually grounded in the diffed content before trusting it.

## File structure
```
backend/analysis/analyst.py       # retrieve_related_context(), analyze_change() — Groq call
backend/analysis/validator.py     # validate_signal() — embedding-similarity grounding check
```

## Build steps
1. `retrieve_related_context()` runs a pgvector cosine-distance query (`Snapshot.embedding.cosine_distance(...)`) scoped to the same source, returning the top-3 most similar prior snapshots as context.
2. `analyze_change()` builds a prompt (old content / new content / retrieved context) and calls Groq via `_client.chat.completions.create(...)` — uses the `openai` SDK pointed at `https://api.groq.com/openai/v1` since Groq's API is OpenAI-compatible (see [decisions.md](./decisions.md)). Expects a JSON object back and parses it into `AnalystOutput`.
3. `validate_signal()` embeds the analyst's `what_changed` claim and the actual new content (both via the same local embedding model from [03-change-detection.md](./03-change-detection.md)), and flags the signal if their similarity is below `GROUNDING_THRESHOLD` (0.75) — a cheap hallucination check that doesn't need a second LLM call.
4. Failed validation doesn't silently drop the signal — it's logged as a warning and the `signals.validated` column is set to `false`, so failure rate stays visible (see `backend/main.py`'s `_process_source()`).

## Status
**Verified against the live API** — `generate_headline_and_summary()` (the sibling call in `assembler.py`, same client setup) was run end-to-end with real signal data and returned a coherent, on-topic headline and executive summary. `analyze_change()` itself hasn't been run yet since it needs a real detected change to analyze, but uses the same tested client/model config.

## Gotchas
- `MODEL = "openai/gpt-oss-120b"` was chosen by actually querying `client.models.list()` against the real account — the first guess (`llama-3.3-70b-versatile`) 404'd as deprecated/unavailable. If this model also stops working, re-run `client.models.list()` rather than guessing a replacement (see `docs/decisions.md`).
- **gpt-oss-120b is a reasoning model** — it spends tokens on hidden chain-of-thought before the visible answer. A low `max_tokens` truncates it to an empty response, which then fails JSON-mode validation with an opaque `json_validate_failed` error (this actually happened — see `decisions.md`). Current settings use `max_tokens=2048` and `extra_body={"reasoning_effort": "low"}` to keep this in check; don't lower `max_tokens` without testing.
- Both `analyst.py` and `assembler.py` ([06-report-assembly.md](./06-report-assembly.md)) construct their own `OpenAI` client pointed at Groq at import time, which means importing either module requires `GROQ_API_KEY` to already be set — there's no lazy-init. Fine for now, would need refactoring if these modules are ever imported somewhere that shouldn't need the key (e.g. a test that only exercises rendering).
- `GROUNDING_THRESHOLD = 0.75` is a guess, not tuned against any eval set — there's no labeled "hallucinated vs. grounded" data yet, unlike the change-detection threshold.
