# Change Detection

## Purpose
Decide whether a hash-changed piece of content is a *real* signal (pricing change, new feature, new role) or just noise — without ever silently missing a real change.

## File structure
```
backend/detection/change_detector.py    # detect_change(), meaningful_tokens(), embed(), cosine_similarity()
eval/change_detection_eval_set.json      # hand-labeled real-vs-noise examples, incl. long realistic pages
eval/run_eval.py                         # runs detect_change() against the eval set, reports precision/recall
tests/test_detection.py                  # unit tests, incl. the eval set as a regression gate
```

## How it works (two stages)
1. **Collector hash** (`backend/collectors/base.py`): if the whitespace-normalized page text is byte-identical to last time, nothing else runs.
2. **Stage 1 — deterministic diff** (`detect_change(old, new)`): a word-level diff over *meaningful* tokens only. Punctuation, case, filler words ("the", "per", …) and bare years are ignored, and `$49/month` tokenizes the same as `$49 per month`. If nothing meaningful differs, it's noise: the new hash is remembered, no snapshot is stored, no LLM call is made. Otherwise the changed regions (old vs new wording, with a few words of context) are handed to the analyst.
3. **Stage 2 — LLM judgement** (`backend/analysis/analyst.py`): the analyst explains the change and rates its `significance`; a change rated `none` is dropped (its snapshot is kept as the new baseline to diff against).

Stage 1 is tuned for recall: it may pass a meaningless wording edit to the LLM (costing one call) but must never drop a real change.

## Why not embeddings (the original design)
The first version compared whole-page embeddings and flagged a change when cosine similarity fell below 0.98. That cannot work with `all-MiniLM-L6-v2`: the model reads only the first 256 tokens of its input, so a price change further down a pricing page scored a similarity of exactly **1.0000** and was never reported. Even embedding only the changed region doesn't help — embeddings barely register numbers ("$199"→"$249" scored 0.9991, a copyright-year bump 0.9928). Measured 2026-11-17; see [decisions.md](./decisions.md).

Embeddings are still used where they're good — retrieval (pgvector RAG for the analyst, company-scoped chat). `embed()` now averages chunk embeddings so the vector covers the whole page, not just its first ~200 words.

## Status
`python -m eval.run_eval`: precision 1.000, recall 1.000 on 13 labeled examples (8 real, 4 noise, 1 borderline handed to the LLM by design), including deep-page price changes the old detector missed. Enforced by `tests/test_detection.py`. Still worth extending the eval set with real snapshot pairs as they accumulate.

## Gotchas
- Volatile numbers that aren't signals (vote counts, "posted 3 days ago") pass stage 1 and cost an LLM call each run. The HN collectors leave vote/comment counts out of their content for exactly this reason; add similar stripping to a collector if a source turns out to be noisy.
- Bare years are treated as noise globally (copyright footers). A real change that *only* changes a year ("available until 2026" → "2027") would be missed — accepted trade-off.
