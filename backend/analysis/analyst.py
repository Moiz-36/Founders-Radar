"""RAG + LLM synthesis: turn a detected raw change into a structured signal.

For each detected change, retrieves related historical snapshots for the same
source via pgvector similarity search, then prompts an LLM to produce
structured output. Output should be passed through validator.validate_signal
before being persisted.
"""

import json
import os
from dataclasses import dataclass

from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Snapshot, Source

# Groq's API is OpenAI-compatible, so we reuse the `openai` SDK pointed at
# their endpoint instead of pulling in a separate Groq client library.
# Not to be confused with xAI's "Grok" — different company, different API.
#
# gpt-oss-120b is a reasoning model: it spends tokens on hidden chain-of-thought
# before emitting the final answer, so max_tokens needs real headroom (a low
# budget truncates it to an empty response). reasoning_effort="low" keeps that
# overhead small for this task, which doesn't need deep reasoning.
MODEL = "openai/gpt-oss-120b"
RETRIEVAL_TOP_K = 3

_client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")

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

BASELINE_SYSTEM_PROMPT = """You are a market intelligence analyst. This is the FIRST time \
this competitor source has ever been checked — there is nothing to compare it against yet, \
so do not describe a "change". Instead, summarize what is currently there in enough factual \
detail that a founder tracking this competitor has a useful baseline (e.g. actual pricing \
tiers and figures, specific features listed, roles being hired for, or the news item found — \
whatever is relevant to this source type).

Respond with ONLY a JSON object with these exact keys:
{
  "what_changed": "<factual, specific summary of what is currently there>",
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

    response = _client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )

    parsed = json.loads(response.choices[0].message.content)
    return AnalystOutput(
        what_changed=parsed["what_changed"],
        why_it_matters=parsed["why_it_matters"],
        suggested_response=parsed.get("suggested_response"),
    )


def summarize_baseline(
    source: Source,
    content: str,
    related_context: list[Snapshot],
) -> AnalystOutput:
    """Like analyze_change, but for the first time a source is ever collected — there's no
    prior version to diff against, so this describes the current content as a baseline finding
    instead of a change. Reuses AnalystOutput/validate_signal/score_signal downstream (see
    is_baseline on Signal) rather than a parallel pipeline for what is otherwise the same shape
    of output."""
    context_block = "\n---\n".join(s.content[:1000] for s in related_context) or "(none)"

    user_message = f"""Source type: {source.source_type}
Source URL: {source.url}

CURRENT CONTENT:
{content[:4000]}

RELATED HISTORICAL CONTEXT:
{context_block}"""

    response = _client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
        messages=[
            {"role": "system", "content": BASELINE_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )

    parsed = json.loads(response.choices[0].message.content)
    return AnalystOutput(
        what_changed=parsed["what_changed"],
        why_it_matters=parsed["why_it_matters"],
        suggested_response=parsed.get("suggested_response"),
    )
