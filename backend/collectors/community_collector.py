"""Scans Hacker News and Reddit for buying-intent / complaint chatter about a competitor
("alternative to X", "switching from X", "X sucks because...") — a stronger signal than a
plain name mention (NewsCollector): it's what founders deciding what to build next actually
want to know about, per docs/10-competitive-feature-research.md's "quick win" #5.

Same convention as NewsCollector: `url` is treated as the competitor name (a search term),
not a fetchable page.

Reddit's unauthenticated search.json endpoints (both www. and old.) now serve a login wall
instead of JSON to anonymous requests (confirmed by hand, 2026-09-10 — this is Reddit's 2023
API lockdown, not a bug here), so Reddit coverage requires a free Reddit "script" app's
client_credentials OAuth token (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET in .env). Without those
set, this collector silently degrades to HN-only rather than failing the source.
"""

import os
import time

import requests

from backend.collectors.base import REQUEST_TIMEOUT, USER_AGENT, BaseCollector

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
REDDIT_OAUTH_SEARCH_URL = "https://oauth.reddit.com/search"

# Phrases that signal someone actively looking to leave/replace a competitor, not just
# mentioning its name in passing — the distinction the feature is actually for.
BUYING_INTENT_QUERIES = [
    "{name} alternative",
    "switching from {name}",
]

# Module-level so the token (valid ~1hr) is reused across queries/sources within a run
# instead of re-authenticating on every single search.
_reddit_token: dict[str, float | str] = {}


def _get_reddit_token() -> str | None:
    client_id = os.environ.get("REDDIT_CLIENT_ID")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    if _reddit_token.get("token") and float(_reddit_token.get("expires_at", 0)) > time.time():
        return str(_reddit_token["token"])

    response = requests.post(
        REDDIT_TOKEN_URL,
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    _reddit_token["token"] = payload["access_token"]
    # Refresh a minute early rather than risk a mid-run 401 on an about-to-expire token.
    _reddit_token["expires_at"] = time.time() + payload.get("expires_in", 3600) - 60
    return str(_reddit_token["token"])


class CommunityCollector(BaseCollector):
    source_type = "community"

    def _robots_check_url(self) -> str:
        # Same simplification NewsCollector makes: `url` is a search query, not a page, so
        # robots.txt is checked against the search API host actually being hit.
        return HN_SEARCH_URL

    def fetch_raw(self) -> str:
        lines: list[str] = []
        lines.extend(self._fetch_hn())
        lines.extend(self._fetch_reddit())
        return "\n".join(lines)

    def _queries(self) -> list[str]:
        return [q.format(name=self.url) for q in BUYING_INTENT_QUERIES]

    def _fetch_hn(self) -> list[str]:
        lines = []
        for query in self._queries():
            response = self._get(url=f"{HN_SEARCH_URL}?query={query}&tags=(story,comment)&hitsPerPage=10")
            for hit in response.json().get("hits", []):
                text = (hit.get("title") or hit.get("comment_text") or "").strip()
                if not text:
                    continue
                link = hit.get("url") or hit.get("story_url") or ""
                lines.append(f"[HN] {text} — {link} (points: {hit.get('points', 0)})")
        return lines

    def _fetch_reddit(self) -> list[str]:
        try:
            token = _get_reddit_token()
        except requests.RequestException:
            token = None
        if not token:
            return []

        lines = []
        for query in self._queries():
            try:
                response = requests.get(
                    REDDIT_OAUTH_SEARCH_URL,
                    params={"q": query, "sort": "new", "limit": 10, "type": "link"},
                    headers={"User-Agent": USER_AGENT, "Authorization": f"Bearer {token}"},
                    timeout=REQUEST_TIMEOUT,
                )
                response.raise_for_status()
            except requests.RequestException:
                # A transient Reddit hiccup shouldn't fail the whole source — HN coverage
                # alone still carries it (see main.py's per-source failure isolation).
                continue
            for child in response.json().get("data", {}).get("children", []):
                post = child.get("data", {})
                title = (post.get("title") or "").strip()
                if not title:
                    continue
                lines.append(f"[Reddit r/{post.get('subreddit', '')}] {title} (score: {post.get('score', 0)})")
        return lines
