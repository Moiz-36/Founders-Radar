"""The one place the Groq client is configured.

Groq's API is OpenAI-compatible, so the `openai` SDK is pointed at Groq's endpoint instead of
pulling in a separate client library. (Groq, not xAI's "Grok" — different company and API.)

gpt-oss-120b is a reasoning model: it spends tokens on hidden chain-of-thought before the
visible answer, and those count against max_tokens, so budgets need real headroom (a low one
truncates the answer to nothing). reasoning_effort="low" keeps that overhead small.

The client is created lazily so importing any pipeline module doesn't require GROQ_API_KEY —
tests and tools that never call the LLM can import freely.
"""

import json
import os
from collections.abc import Iterator

from openai import OpenAI

MODEL = "openai/gpt-oss-120b"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url=GROQ_BASE_URL)
    return _client


def complete_json(system_prompt: str, user_message: str, max_tokens: int = 2048) -> dict:
    """One JSON-mode completion, parsed. Raises on an empty or non-JSON answer rather than
    returning something partial — callers decide how to degrade."""
    response = get_client().chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("LLM returned an empty response (reasoning may have used the whole token budget)")
    return json.loads(content)


def stream_text(messages: list[dict], max_tokens: int) -> Iterator[str]:
    """Streams a plain-text completion as token deltas."""
    stream = get_client().chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        extra_body={"reasoning_effort": "low"},
        messages=messages,
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
