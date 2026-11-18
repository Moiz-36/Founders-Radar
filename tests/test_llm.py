"""backend/llm.py: waiting out Groq's per-minute rate limit instead of failing on the first 429."""

import httpx
import pytest
from openai import RateLimitError

from backend import llm


def rate_limit_error(message: str, retry_after: str | None = None) -> RateLimitError:
    headers = {"retry-after": retry_after} if retry_after else {}
    response = httpx.Response(429, headers=headers, request=httpx.Request("POST", "https://api.groq.com"))
    return RateLimitError(message, response=response, body=None)


def test_wait_comes_from_header_or_message_and_is_capped():
    assert llm._rate_limit_wait(rate_limit_error("x", retry_after="12")) == 13
    assert llm._rate_limit_wait(rate_limit_error("Please try again in 40.62s. Need more")) == pytest.approx(41.62)
    assert llm._rate_limit_wait(rate_limit_error("try again in 2m3s")) == llm.MAX_RATE_LIMIT_WAIT_SECONDS
    assert llm._rate_limit_wait(rate_limit_error("no hint")) == 20.0


def test_complete_json_retries_rate_limits_then_succeeds(monkeypatch):
    calls, sleeps = [], []
    monkeypatch.setattr(llm.time, "sleep", sleeps.append)

    def flaky(system_prompt, user_message, max_tokens):
        calls.append(1)
        if len(calls) < 3:
            raise rate_limit_error("try again in 5s")
        return {"ok": True}

    monkeypatch.setattr(llm, "_complete_json_once", flaky)
    assert llm.complete_json("s", "u") == {"ok": True}
    assert sleeps == [6.0, 6.0]


def test_complete_json_gives_up_after_the_retry_budget(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)

    def always_limited(system_prompt, user_message, max_tokens):
        raise rate_limit_error("try again in 1s")

    monkeypatch.setattr(llm, "_complete_json_once", always_limited)
    with pytest.raises(RateLimitError):
        llm.complete_json("s", "u")
