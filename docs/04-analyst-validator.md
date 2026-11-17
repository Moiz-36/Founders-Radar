# Analyst + Validator

## Purpose
Turn a candidate change into a structured, explainable signal (`what_changed` / `why_it_matters` / `suggested_response` / `significance`), using RAG (pgvector similarity search over prior snapshots) + an LLM — then check the claim is actually grounded in the content before trusting it.

## File structure
```
backend/llm.py                    # the one Groq client (lazy), complete_json(), stream_text()
backend/analysis/analyst.py       # retrieve_related_context(), analyze_change(), summarize_baseline()
backend/analysis/validator.py     # validate_signal() — deterministic grounding check
backend/scoring/scorer.py         # score_signal(source_type, significance)
```

## How it works
1. `retrieve_related_context()` runs a pgvector cosine-distance query scoped to the same source, returning the top-3 most similar prior snapshots as context.
2. `analyze_change()` prompts the LLM with the **changed regions** from [change detection](./03-change-detection.md) first, then the full old/new content and the retrieved context. The LLM also rates `significance` (`none`/`low`/`medium`/`high`); `none` means "not worth reporting" and the signal is dropped. `summarize_baseline()` is the first-ever-check variant (nothing to diff against).
3. `validate_signal()` checks grounding deterministically: every number in the claim must appear in the old or new content (invented figures are the most damaging hallucination in a pricing report), and at least half the claim's key words must appear there too (prefix-matched, so "price" matches "pricing").
4. `score_signal()` starts from a per-source-type base priority (pricing high, news low, …) and moves it one level up or down by the analyst's significance — so a pricing typo fix isn't "high" and an acquisition story isn't "low".
5. Failed validation doesn't drop the signal — it's logged and `signals.validated` is set to `false`, so the failure rate stays visible.

## Status
Covered by `tests/test_analysis_and_scoring.py` and the end-to-end runs in `tests/test_pipeline.py`. The previous embedding-based validator (claim vs page similarity ≥ 0.75) never worked: a one-sentence claim and a whole page are never that similar — accurate claims measured 0.09–0.26 — so virtually every signal was flagged unvalidated. See [decisions.md](./decisions.md), 2026-11-17.

## Gotchas
- `MODEL = "openai/gpt-oss-120b"` (in `backend/llm.py`) was chosen by querying `client.models.list()` against the real account. If it stops working, re-run that rather than guessing a replacement.
- **gpt-oss-120b is a reasoning model** — hidden reasoning tokens count against `max_tokens`. A low budget truncates the answer to nothing (`complete_json` raises a clear error when that happens). Don't lower budgets without testing.
- The validator checks grounding, not correctness: a claim that rearranges real words and numbers into a wrong statement can still pass.
