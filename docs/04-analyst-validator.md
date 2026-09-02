# Analyst + Validator

## Purpose
Turn a detected raw change into a structured, explainable signal (`what_changed` / `why_it_matters` / `suggested_response`), using RAG (pgvector similarity search over prior snapshots) + an LLM — then check the LLM's claim is actually grounded in the diffed content before trusting it.

## File structure
```
backend/analysis/analyst.py       # retrieve_related_context(), analyze_change() — Grok call
backend/analysis/validator.py     # validate_signal() — embedding-similarity grounding check
```

## Build steps
1. `retrieve_related_context()` runs a pgvector cosine-distance query (`Snapshot.embedding.cosine_distance(...)`) scoped to the same source, returning the top-3 most similar prior snapshots as context.
2. `analyze_change()` builds a prompt (old content / new content / retrieved context) and calls Grok via `_client.chat.completions.create(...)` — uses the `openai` SDK pointed at `https://api.x.ai/v1` since xAI's API is OpenAI-compatible (see [decisions.md](./decisions.md)). Expects a JSON object back and parses it into `AnalystOutput`.
3. `validate_signal()` embeds the analyst's `what_changed` claim and the actual new content (both via the same local embedding model from [03-change-detection.md](./03-change-detection.md)), and flags the signal if their similarity is below `GROUNDING_THRESHOLD` (0.75) — a cheap hallucination check that doesn't need a second LLM call.
4. Failed validation doesn't silently drop the signal — it's logged as a warning and the `signals.validated` column is set to `false`, so failure rate stays visible (see `backend/main.py`'s `_process_source()`).

## Status
Code written, not yet tested against a real Grok call — needs `XAI_API_KEY` in `.env` and a real detected change to run against.

## Gotchas
- `MODEL = "grok-4"` is a best-guess model name — check [console.x.ai](https://console.x.ai) for the current available model name if this errors as "model not found."
- Both `analyst.py` and `assembler.py` ([06-report-assembly.md](./06-report-assembly.md)) construct their own `OpenAI` client pointed at xAI at import time, which means importing either module requires `XAI_API_KEY` to already be set — there's no lazy-init. Fine for now, would need refactoring if these modules are ever imported somewhere that shouldn't need the key (e.g. a test that only exercises rendering).
- `GROUNDING_THRESHOLD = 0.75` is a guess, not tuned against any eval set — there's no labeled "hallucinated vs. grounded" data yet, unlike the change-detection threshold.
