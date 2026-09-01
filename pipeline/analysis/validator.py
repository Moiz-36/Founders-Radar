"""Hallucination check: verify the analyst's claims are grounded in the diffed content.

Rather than silently dropping outputs that fail this check, we log/flag them so
the failure rate is visible and demoable (see section 4.3 of context.md).
"""

import logging

from pipeline.analysis.analyst import AnalystOutput
from pipeline.detection.change_detector import cosine_similarity, embed

logger = logging.getLogger("founders_radar.validator")

# Minimum similarity between the "what_changed" claim and the actual new
# content for the claim to be considered grounded, not hallucinated.
GROUNDING_THRESHOLD = 0.75


def validate_signal(output: AnalystOutput, new_content: str) -> bool:
    """Returns True if `what_changed` is grounded in `new_content`."""
    claim_embedding = embed(output.what_changed)
    content_embedding = embed(new_content[:4000])
    similarity = cosine_similarity(claim_embedding, content_embedding)

    is_valid = similarity >= GROUNDING_THRESHOLD

    if not is_valid:
        logger.warning(
            "Validator flagged ungrounded claim (similarity=%.3f, threshold=%.3f): %s",
            similarity,
            GROUNDING_THRESHOLD,
            output.what_changed,
        )

    return is_valid
