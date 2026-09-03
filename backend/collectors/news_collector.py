"""Fetches recent mentions of a competitor via the Hacker News Algolia search API.

Chosen over Product Hunt / a paid news API for v1 because it's free, keyless,
and has no rate-limit headaches — swap in a different provider later if HN
coverage proves too thin for the pilot competitors.
"""

from backend.collectors.base import BaseCollector

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"


class NewsCollector(BaseCollector):
    """`url` here is treated as the search query (typically the competitor name)."""

    source_type = "news"

    def _robots_check_url(self) -> str:
        # self.url is a search query (e.g. a competitor name), not a fetchable page —
        # check robots.txt for the API host we actually hit instead.
        return HN_SEARCH_URL

    def fetch_raw(self) -> str:
        response = self._get(
            url=f"{HN_SEARCH_URL}?query={self.url}&tags=story&hitsPerPage=20"
        )
        hits = response.json().get("hits", [])

        lines = [
            f"{hit.get('title', '')} — {hit.get('url', '')} "
            f"(points: {hit.get('points', 0)}, comments: {hit.get('num_comments', 0)})"
            for hit in hits
        ]
        return "\n".join(lines)
