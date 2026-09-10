"""Thin wrapper around the Tavily Search API — the web-search backbone for auto-discovery,
since Groq's LLM has no browsing of its own. Free tier: 1,000 requests/month, no credit card
required (switched from Brave Search, which requires a card even on its free tier).
"""

import os
import time
from dataclasses import dataclass

import requests

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
REQUEST_TIMEOUT = 15
MIN_DELAY_SECONDS = 0.5

_last_request_at: float | None = None


@dataclass
class SearchResult:
    title: str
    url: str
    description: str


def _respect_rate_limit() -> None:
    global _last_request_at
    if _last_request_at is not None:
        elapsed = time.monotonic() - _last_request_at
        if elapsed < MIN_DELAY_SECONDS:
            time.sleep(MIN_DELAY_SECONDS - elapsed)
    _last_request_at = time.monotonic()


def web_search(query: str, count: int = 5, include_domains: list[str] | None = None) -> list[SearchResult]:
    """Returns up to `count` web results for `query`. Raises on a missing API key or an
    HTTP error — callers (find_competitors/find_sources) decide how to degrade, same
    philosophy as backend/collectors: don't silently swallow failures.

    `include_domains` restricts results to those domains (Tavily's "filter" mode) — used
    by source_finder.py for pricing/feature pages, which should live on the competitor's own
    site. Generic open-web queries otherwise get dominated by third-party review/aggregator
    sites (e.g. searching "Coda pricing" surfaces vendr.com and blog roundups long before
    coda.io/pricing) — confirmed by hand while building this, not a hypothetical."""
    api_key = os.environ["TAVILY_API_KEY"]

    body: dict = {"query": query, "max_results": count}
    if include_domains:
        body["include_domains"] = include_domains
        body["include_domains_mode"] = "filter"

    _respect_rate_limit()
    response = requests.post(
        TAVILY_SEARCH_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    results = response.json().get("results", [])

    return [
        SearchResult(
            title=r.get("title", ""),
            url=r.get("url", ""),
            description=r.get("content", ""),
        )
        for r in results
    ]
