"""Shared collector logic: fetch, normalize, hash, and dedup against the last stored snapshot."""

import hashlib
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from urllib.parse import urlencode, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

USER_AGENT = "FoundersRadarBot/0.1 (+https://github.com/; contact: founders-radar)"
REQUEST_TIMEOUT = 15
PLAYWRIGHT_TIMEOUT_MS = 30_000
MIN_DELAY_SECONDS = 2.0
# robots.txt is cached per host, but the API service is long-running — re-fetch after a day
# so a site that changes its rules is eventually respected.
ROBOTS_CACHE_TTL_SECONDS = 24 * 60 * 60
HN_SEARCH_BY_DATE_URL = "https://hn.algolia.com/api/v1/search_by_date"

_robots_cache: dict[str, tuple[float, RobotFileParser]] = {}


def is_allowed_by_robots(url: str) -> bool:
    """Check robots.txt for the given URL's host, caching parsers per host.

    Fetches robots.txt ourselves with our real User-Agent instead of letting
    `RobotFileParser.read()` use urllib's default UA — some sites' bot
    protection (e.g. Drata, via Cloudflare) 403s the generic "Python-urllib"
    UA, and RobotFileParser fails *closed* (disallow-all) on a 401/403, which
    would incorrectly block a site whose robots.txt actually allows us.
    """
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    cached = _robots_cache.get(origin)
    if cached is None or time.monotonic() - cached[0] > ROBOTS_CACHE_TTL_SECONDS:
        parser = RobotFileParser()
        parser.set_url(f"{origin}/robots.txt")
        try:
            response = requests.get(
                f"{origin}/robots.txt", headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT
            )
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            else:
                # No robots.txt (404) or it's blocked (4xx/5xx) — RFC 9309 says treat a
                # missing/unreachable robots.txt as no restrictions. NOTE: an unparsed
                # RobotFileParser defaults to disallow-all, so this must be set explicitly.
                parser.allow_all = True
        except requests.RequestException:
            parser.allow_all = True  # unreachable — fail open (see note above)
        cached = (time.monotonic(), parser)
        _robots_cache[origin] = cached

    return cached[1].can_fetch(USER_AGENT, url)


def html_to_text(html: str) -> str:
    """Visible page text, without scripts, styles, navigation and footer boilerplate."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True)


def render_with_playwright(url: str, timeout_ms: int = PLAYWRIGHT_TIMEOUT_MS) -> str:
    """Fully rendered HTML of a JS-heavy page. Imported lazily: Playwright is heavy and only
    the JS-rendering collectors and PDF rendering need it."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(url, timeout=timeout_ms, wait_until="networkidle")
            return page.content()
        finally:
            browser.close()


@dataclass
class CollectedContent:
    url: str
    normalized_content: str
    content_hash: str


class BaseCollector(ABC):
    """One instance per source. Subclasses implement `fetch_raw`."""

    source_type: str

    def __init__(self, url: str, min_delay_seconds: float = MIN_DELAY_SECONDS) -> None:
        self.url = url
        self.min_delay_seconds = min_delay_seconds
        self._last_request_at: float | None = None

    @abstractmethod
    def fetch_raw(self) -> str:
        """Fetch and return the raw text content for this source."""

    def _robots_check_url(self) -> str:
        """URL to check against robots.txt before fetching. Override when `self.url` isn't
        itself a fetchable page (the HN collectors' `url` is a search term, not a URL)."""
        return self.url

    def collect(self, last_content_hash: str | None) -> CollectedContent | None:
        """Fetch content and return it only if the normalized hash differs from `last_content_hash`."""
        robots_url = self._robots_check_url()
        if not is_allowed_by_robots(robots_url):
            raise PermissionError(f"robots.txt disallows fetching {robots_url}")

        self._respect_rate_limit()
        normalized = self._normalize(self.fetch_raw())
        if not normalized:
            # An empty page is almost always a failed render or a bot wall, not real content —
            # storing it would produce a bogus "everything was removed" change next time.
            raise ValueError(f"No text content fetched from {self.url}")
        content_hash = self._hash(normalized)

        if last_content_hash is not None and content_hash == last_content_hash:
            return None

        return CollectedContent(url=self.url, normalized_content=normalized, content_hash=content_hash)

    def _respect_rate_limit(self) -> None:
        if self._last_request_at is not None:
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < self.min_delay_seconds:
                time.sleep(self.min_delay_seconds - elapsed)
        self._last_request_at = time.monotonic()

    @staticmethod
    def _normalize(text: str) -> str:
        """Collapse whitespace so cosmetic formatting changes don't register as content changes."""
        return re.sub(r"\s+", " ", text).strip().lower()

    @staticmethod
    def _hash(normalized_text: str) -> str:
        return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()

    def _get(self, url: str | None = None, max_retries: int = 3) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                response = requests.get(
                    url or self.url,
                    headers={"User-Agent": USER_AGENT},
                    timeout=REQUEST_TIMEOUT,
                )
                response.raise_for_status()
                return response
            except requests.RequestException as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    time.sleep(2**attempt)  # exponential backoff: 1s, 2s
        raise last_error  # type: ignore[misc]


class StaticPageCollector(BaseCollector):
    """Whole-page text of a server-rendered page via a plain GET."""

    def fetch_raw(self) -> str:
        return html_to_text(self._get().text)


class RenderedPageCollector(BaseCollector):
    """Whole-page text of a JS-rendered page (job boards, review widgets) via Playwright."""

    def fetch_raw(self) -> str:
        return html_to_text(render_with_playwright(self.url))


class HackerNewsCollector(BaseCollector):
    """Searches Hacker News (Algolia API). `url` is the search term (the competitor's name),
    not a fetchable page.

    Uses search_by_date (newest first) and leaves vote/comment counts out of the content:
    those change constantly, so with them in, every run looked like a "change" even when no
    new story or comment had appeared. Now the content only changes when new items do.
    """

    tags = "story"
    hits_per_query = 20

    def _robots_check_url(self) -> str:
        return HN_SEARCH_BY_DATE_URL

    def queries(self) -> list[str]:
        return [self.url]

    def fetch_raw(self) -> str:
        lines: list[str] = []
        seen: set[str] = set()
        for query in self.queries():
            params = urlencode({"query": query, "tags": self.tags, "hitsPerPage": self.hits_per_query})
            response = self._get(url=f"{HN_SEARCH_BY_DATE_URL}?{params}")
            for hit in response.json().get("hits", []):
                object_id = str(hit.get("objectID", ""))
                text = (hit.get("title") or hit.get("comment_text") or "").strip()
                if not text or object_id in seen:
                    continue
                seen.add(object_id)
                link = hit.get("url") or hit.get("story_url") or ""
                lines.append(f"{html_to_text(text)} — {link}".rstrip(" —"))
        return "\n".join(lines)
