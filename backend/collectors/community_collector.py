"""Scans Hacker News for buying-intent / complaint chatter about a competitor
("alternative to X", "switching from X", "X sucks because...") — a stronger signal than a
plain name mention (NewsCollector): it's what founders deciding what to build next actually
want to know about, per docs/10-competitive-feature-research.md's "quick win" #5.

Same convention as NewsCollector: `url` is treated as the competitor name (a search term),
not a fetchable page.

Reddit was dropped as a source: its unauthenticated search.json endpoints (both www. and
old.) now serve a login wall instead of JSON to anonymous requests (confirmed by hand,
2026-09-10 — Reddit's 2023 API lockdown, not a bug here), and OAuth access requires a
Reddit "script" app that wasn't worth provisioning for one collector — see docs/decisions.md's
2026-09-11 entry.
"""

from backend.collectors.base import BaseCollector

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"

# Phrases that signal someone actively looking to leave/replace a competitor, not just
# mentioning its name in passing — the distinction the feature is actually for.
BUYING_INTENT_QUERIES = [
    "{name} alternative",
    "switching from {name}",
]


class CommunityCollector(BaseCollector):
    source_type = "community"

    def _robots_check_url(self) -> str:
        # Same simplification NewsCollector makes: `url` is a search query, not a page, so
        # robots.txt is checked against the search API host actually being hit.
        return HN_SEARCH_URL

    def fetch_raw(self) -> str:
        lines: list[str] = []
        for query in self._queries():
            response = self._get(url=f"{HN_SEARCH_URL}?query={query}&tags=(story,comment)&hitsPerPage=10")
            for hit in response.json().get("hits", []):
                text = (hit.get("title") or hit.get("comment_text") or "").strip()
                if not text:
                    continue
                link = hit.get("url") or hit.get("story_url") or ""
                lines.append(f"[HN] {text} — {link} (points: {hit.get('points', 0)})")
        return "\n".join(lines)

    def _queries(self) -> list[str]:
        return [q.format(name=self.url) for q in BUYING_INTENT_QUERIES]
