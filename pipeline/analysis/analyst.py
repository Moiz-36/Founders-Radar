"""RAG + LLM synthesis: turn a detected raw change into a structured signal.

For each detected change, retrieves related historical snapshots for the same
source via pgvector similarity search, then prompts Claude to produce
structured output. Output should be passed through validator.validate_signal
before being persisted.
"""

import json
from dataclasses import dataclass

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from pipeline.db.models import Snapshot, Source

MODEL = "claude-sonnet-5"
RETRIEVAL_TOP_K = 3

_client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are a market intelligence analyst. Given an old and new \
version of a competitor's source content, and some related historical context, \
identify what meaningfully changed and why a startup founder tracking this \
competitor should care.

Respond with ONLY a JSON object with these exact keys:
{
  "what_changed": "<factual, specific description of the change>",
  "why_it_matters": "<why this matters strategically to a competing founder>",
  "suggested_response": "<optional concrete suggestion, or null if none>"
}"""


@dataclass
class AnalystOutput:
    what_changed: str
    why_it_matters: str
    suggested_response: str | None


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


def analyze_change(
    source: Source,
    old_content: str,
    new_content: str,
    related_context: list[Snapshot],
) -> AnalystOutput:
    context_block = "\n---\n".join(s.content[:1000] for s in related_context) or "(none)"

    user_message = f"""Source type: {source.source_type}
Source URL: {source.url}

OLD CONTENT:
{old_content[:4000]}

NEW CONTENT:
{new_content[:4000]}

RELATED HISTORICAL CONTEXT:
{context_block}"""

    response = _client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    parsed = json.loads(response.content[0].text)
    return AnalystOutput(
        what_changed=parsed["what_changed"],
        why_it_matters=parsed["why_it_matters"],
        suggested_response=parsed.get("suggested_response"),
    )
