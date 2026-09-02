"""Assigns a High/Medium/Low priority to each signal.

Rubric is a simple, explainable base score by source type, adjustable via
`PRIORITY_RUBRIC` below rather than buried in branching logic — swap in a
smarter model later without touching call sites.
"""

# Base priority per source type. Edit this table to retune scoring.
PRIORITY_RUBRIC: dict[str, str] = {
    "pricing": "high",
    "feature": "medium",
    "job_posting": "low",
    "news": "low",
}

DEFAULT_PRIORITY = "low"


def score_signal(source_type: str) -> str:
    """Returns 'high' | 'medium' | 'low'."""
    return PRIORITY_RUBRIC.get(source_type, DEFAULT_PRIORITY)
