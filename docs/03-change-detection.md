# Change Detection

## Purpose
Decide whether a hash-changed piece of content is a *real* signal (pricing change, new feature, etc.) or just cosmetic rewording — via embedding cosine similarity, not raw text diffing.

## File structure
```
backend/detection/change_detector.py    # embed(), cosine_similarity(), is_real_change()
eval/change_detection_eval_set.json      # hand-labeled real-vs-noise examples
eval/run_eval.py                         # runs is_real_change() against the eval set, reports precision/recall
```

## Build steps
1. `embed(text)` runs a local `sentence-transformers` model (`all-MiniLM-L6-v2`, 384-dim, normalized) — no API key, no per-call cost. Model downloads once (~90MB) on first use and is cached by `sentence-transformers`.
2. `is_real_change(old_text, new_text, threshold)` embeds both, computes cosine similarity, and flags a real change when similarity drops **below** the threshold.
3. Tune `DEFAULT_SIMILARITY_THRESHOLD` against the eval set: `./.venv/Scripts/python -m eval.run_eval --threshold 0.97` (sweep values, watch precision/recall).
4. Populate `eval/change_detection_eval_set.json` with real labeled old/new snapshot pairs once real competitor content is available — the 2 examples in there now are synthetic placeholders.

## Status
Runs correctly. Threshold recalibrated once already (0.92 → 0.98) after discovering MiniLM's similarity scores run much higher/more compressed than OpenAI's embeddings would — see [decisions.md](./decisions.md). **Still only tuned on 2 synthetic examples — not trustworthy yet.**

## Gotchas
- MiniLM is a smaller, less semantically precise model than OpenAI's `text-embedding-3-small`. If precision against a real eval set turns out poor, the fallback options are: a bigger local model (e.g. `all-mpnet-base-v2`, slower but more accurate) or paying for OpenAI/another embeddings API.
- The threshold is a single global constant — there's no per-source-type tuning yet (pricing pages vs. changelog pages may have very different "real change" similarity distributions). Worth revisiting once there's real data to look at.
