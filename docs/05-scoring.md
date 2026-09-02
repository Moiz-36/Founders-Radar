# Scoring

## Purpose
Assign each signal a High/Medium/Low priority so the report can sort the founder's attention toward what matters most.

## File structure
```
pipeline/scoring/scorer.py    # PRIORITY_RUBRIC dict + score_signal()
```

## Build steps
1. `PRIORITY_RUBRIC` is a plain dict mapping `source_type -> priority` (pricing=high, feature=medium, job_posting=low, news=low), kept as a single editable table rather than buried in branching logic.
2. `score_signal(source_type)` looks it up, falling back to `DEFAULT_PRIORITY` ("low") for anything unrecognized.

## Status
Done — pure logic, no external dependencies, nothing to test beyond unit-level correctness.

## Gotchas
- Current rubric only looks at `source_type`, ignoring the actual content of the change (e.g. a 5% price change vs. a 200% price change both score "high"). Fine for v1's "explainable and tunable, not smart" goal per `context.md` — revisit only if the report's priority ordering looks obviously wrong once real signals come through.
