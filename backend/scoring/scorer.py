"""Assigns a High/Medium/Low priority to each signal.

Two explainable inputs, both editable here rather than buried in branching logic:
1. A base priority per source type (`PRIORITY_RUBRIC`) — a pricing change usually matters
   more than a news mention.
2. The analyst's own `significance` rating of this specific change, which moves the base up
   or down one level. Without it, every pricing signal was "high" (even a typo fix) and every
   news signal "low" (even an acquisition).
"""

PRIORITY_RUBRIC: dict[str, str] = {
    "pricing": "high",
    "feature": "medium",
    "review": "medium",
    "general": "medium",
    "community": "medium",  # buying-intent chatter ("alternative to X") — stronger than a plain mention
    "job_posting": "low",
    "news": "low",
}

DEFAULT_PRIORITY = "low"
LEVELS = ("low", "medium", "high")
SIGNIFICANCE_ADJUSTMENT = {"high": 1, "medium": 0, "low": -1, "none": -1}


def score_signal(source_type: str, significance: str | None = None) -> str:
    """Returns 'high' | 'medium' | 'low'."""
    base = LEVELS.index(PRIORITY_RUBRIC.get(source_type, DEFAULT_PRIORITY))
    adjusted = base + SIGNIFICANCE_ADJUSTMENT.get(significance or "medium", 0)
    return LEVELS[max(0, min(len(LEVELS) - 1, adjusted))]
