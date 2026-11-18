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
import logging
import os
import re
import time
from collections.abc import Iterator

from openai import OpenAI, RateLimitError

logger = logging.getLogger(__name__)

MODEL = "openai/gpt-oss-120b"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Groq's free tier caps tokens per minute (8,000 for this model), so a burst of calls — e.g.
# source discovery for several competitors — gets 429s that say how long to wait ("try again
# in 40.6s"). The SDK's own retries back off for about a second, far too short for a
# per-minute window, so complete_json waits as long as Groq asks, a few times, before failing.
RATE_LIMIT_RETRIES = 3
MAX_RATE_LIMIT_WAIT_SECONDS = 65.0
_RETRY_AFTER_PATTERN = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s", re.IGNORECASE)

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url=GROQ_BASE_URL)
    return _client


def _rate_limit_wait(error: RateLimitError) -> float:
    """Seconds Groq asked us to wait, from the retry-after header or the error message."""
    header = error.response.headers.get("retry-after") if error.response is not None else None
    try:
        if header:
            return min(float(header) + 1, MAX_RATE_LIMIT_WAIT_SECONDS)
    except ValueError:
        pass
    match = _RETRY_AFTER_PATTERN.search(str(error))
    if match:
        seconds = int(match.group(1) or 0) * 60 + float(match.group(2))
        return min(seconds + 1, MAX_RATE_LIMIT_WAIT_SECONDS)
    return 20.0


def complete_json(system_prompt: str, user_message: str, max_tokens: int = 2048) -> dict:
    """One JSON-mode completion, parsed. Raises on an empty or non-JSON answer rather than
    returning something partial — callers decide how to degrade. Waits out Groq's per-minute
    rate limit (see RATE_LIMIT_RETRIES) instead of failing on the first 429."""
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            return _complete_json_once(system_prompt, user_message, max_tokens)
        except RateLimitError as error:
            if attempt == RATE_LIMIT_RETRIES:
                raise
            wait = _rate_limit_wait(error)
            logger.warning("Groq rate limit hit, retrying in %.0fs (attempt %d)", wait, attempt + 1)
            time.sleep(wait)
    raise AssertionError("unreachable")


def _complete_json_once(system_prompt: str, user_message: str, max_tokens: int) -> dict:
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
