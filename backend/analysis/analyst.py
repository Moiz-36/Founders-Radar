"""RAG + LLM synthesis: turn a detected raw change into a structured signal.

For each change, retrieves related historical snapshots of the same source via pgvector
similarity search, then asks the LLM for a structured explanation. The LLM is also the final
judge of whether a change matters at all: detection/change_detector.py only filters out pure
noise (whitespace, punctuation, filler words), so the analyst rates `significance`, and a
change rated "none" is dropped rather than reported. Output should be passed through
validator.validate_signal before being persisted.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Snapshot, Source
from backend.llm import complete_json

RETRIEVAL_TOP_K = 3
PROMPT_CONTENT_CHARS = 4000
CONTEXT_SNAPSHOT_CHARS = 1000
SIGNIFICANCE_LEVELS = ("none", "low", "medium", "high")

_RESPONSE_SHAPE = """Respond with ONLY a JSON object with these exact keys:
{
  "what_changed": "<factual, specific description>",
  "why_it_matters": "<why this matters strategically to a competing founder>",
  "suggested_response": "<optional concrete suggestion, or null if none>",
  "significance": "none" | "low" | "medium" | "high"
}"""

CHANGE_SYSTEM_PROMPT = f"""You are a market intelligence analyst. Given an old and new \
version of a competitor's source content, and some related historical context, identify what \
meaningfully changed and why a startup founder tracking this competitor should care.

You are shown the CHANGED REGIONS (old vs new wording) first, then the full content for \
context. Base "what_changed" on the changed regions. Rate "significance":
- "none": nothing a founder would care about (rewording, dates, counters, layout text)
- "low": minor but real (small copy or listing changes)
- "medium": notable (new feature, new roles, review rating moved)
- "high": strategic (pricing change, new plan or product, major launch or pivot)

{_RESPONSE_SHAPE}"""

BASELINE_SYSTEM_PROMPT = f"""You are a market intelligence analyst. This is the FIRST time \
this competitor source has ever been checked — there is nothing to compare it against yet, \
so do not describe a "change". Instead, summarize what is currently there in enough factual \
detail that a founder tracking this competitor has a useful baseline (e.g. actual pricing \
tiers and figures, specific features listed, roles being hired for, or the news item found — \
whatever is relevant to this source type). Use "significance" for how useful this baseline is \
("low" if the page has little of substance).

{_RESPONSE_SHAPE}"""


@dataclass
class AnalystOutput:
    what_changed: str
    why_it_matters: str
    suggested_response: str | None
    significance: str = "medium"


def retrieve_related_context(
    session: Session, source: Source, embedding: list[float], top_k: int = RETRIEVAL_TOP_K
) -> list[Snapshot]:
    """pgvector similarity search for prior snapshots of the same source."""
    stmt = (
        select(Snapshot)
        .where(Snapshot.source_id == source.id)
        .order_by(Snapshot.embedding.cosine_distance(embedding))
        .limit(top_k)
    )
    return list(session.execute(stmt).scalars())


def _context_block(related_context: list[Snapshot]) -> str:
    return "\n---\n".join(s.content[:CONTEXT_SNAPSHOT_CHARS] for s in related_context) or "(none)"


def _parse(parsed: dict) -> AnalystOutput:
    significance = str(parsed.get("significance") or "medium").lower()
    if significance not in SIGNIFICANCE_LEVELS:
        significance = "medium"
    suggested = parsed.get("suggested_response")
    return AnalystOutput(
        what_changed=str(parsed["what_changed"]),
        why_it_matters=str(parsed["why_it_matters"]),
        suggested_response=str(suggested) if suggested else None,
        significance=significance,
    )


def analyze_change(
    source: Source,
    old_content: str,
    new_content: str,
    related_context: list[Snapshot],
    changed_regions: list[tuple[str, str]] | None = None,
) -> AnalystOutput:
    regions_block = (
        "\n\n".join(f"OLD: {old or '(nothing)'}\nNEW: {new or '(removed)'}" for old, new in changed_regions)
        if changed_regions
        else "(not computed)"
    )
    user_message = f"""Source type: {source.source_type}
Source URL: {source.url}

CHANGED REGIONS:
{regions_block[:PROMPT_CONTENT_CHARS]}

OLD CONTENT:
{old_content[:PROMPT_CONTENT_CHARS]}

NEW CONTENT:
{new_content[:PROMPT_CONTENT_CHARS]}

RELATED HISTORICAL CONTEXT:
{_context_block(related_context)}"""
    return _parse(complete_json(CHANGE_SYSTEM_PROMPT, user_message))


def summarize_baseline(source: Source, content: str, related_context: list[Snapshot]) -> AnalystOutput:
    """Like analyze_change, but for the first time a source is ever collected — there's no
    prior version to diff against, so this describes the current content as a baseline."""
    user_message = f"""Source type: {source.source_type}
Source URL: {source.url}

CURRENT CONTENT:
{content[:PROMPT_CONTENT_CHARS]}

RELATED HISTORICAL CONTEXT:
{_context_block(related_context)}"""
    return _parse(complete_json(BASELINE_SYSTEM_PROMPT, user_message))
