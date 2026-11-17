"""Hallucination check: is the analyst's `what_changed` claim grounded in the source content?

History: this used to embed the claim and the first 4,000 characters of the page and require
cosine similarity >= 0.75. A one-sentence claim and a whole page are never that similar —
measured 2026-11-17, even accurate claims scored 0.09-0.26 — so nearly every signal was
flagged unvalidated, and the flag carried no information. See docs/decisions.md.

The check is now lexical and deterministic, which is also what "grounded" actually means here:
1. Every number in the claim (prices, counts, percentages) must appear in the old or new
   content. Invented figures are the most damaging kind of hallucination in a pricing report.
2. Most of the claim's key words must appear in the content (prefix-matched, so "price"
   matches "pricing").

Failures are logged and flagged on the signal, not silently dropped.
"""

import logging
import re

from backend.analysis.analyst import AnalystOutput
from backend.detection.change_detector import meaningful_tokens

logger = logging.getLogger("founders_radar.validator")

MIN_KEYWORD_OVERLAP = 0.5
PREFIX_LEN = 5
MIN_KEYWORD_LEN = 4

_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in _NUMBER.findall(text)}


def _keyword_prefixes(text: str) -> set[str]:
    prefixes = set()
    for word in text.split():
        for token in meaningful_tokens(word):
            if len(token) >= MIN_KEYWORD_LEN and not _NUMBER.search(token):
                prefixes.add(token[:PREFIX_LEN])
    return prefixes


def validate_signal(output: AnalystOutput, new_content: str, old_content: str | None = None) -> bool:
    """True if `what_changed` is grounded in the content (old + new)."""
    content = f"{old_content or ''} {new_content}".lower()
    claim = output.what_changed.lower()

    missing_numbers = _numbers(claim) - _numbers(content)

    claim_keywords = _keyword_prefixes(claim)
    content_keywords = _keyword_prefixes(content)
    overlap = len(claim_keywords & content_keywords) / len(claim_keywords) if claim_keywords else 1.0

    is_valid = not missing_numbers and overlap >= MIN_KEYWORD_OVERLAP
    if not is_valid:
        logger.warning(
            "Validator flagged ungrounded claim (keyword overlap=%.2f, numbers not in content=%s): %s",
            overlap, sorted(missing_numbers), output.what_changed,
        )
    return is_valid
