"""Shared collector logic: fetch, normalize, hash, and dedup against the last stored snapshot."""

import hashlib
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests

USER_AGENT = "FoundersRadarBot/0.1 (+https://github.com/; contact: founders-radar)"
REQUEST_TIMEOUT = 15
MIN_DELAY_SECONDS = 2.0

_robots_cache: dict[str, RobotFileParser] = {}


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

    if origin not in _robots_cache:
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
            # robots.txt unreachable — fail open (see note above)
            parser.allow_all = True
        _robots_cache[origin] = parser

    return _robots_cache[origin].can_fetch(USER_AGENT, url)


@dataclass
class CollectedContent:
    url: str
    raw_content: str
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
        itself a fetchable page (e.g. NewsCollector's `url` is a search query, not a URL)."""
        return self.url

    def collect(self, last_content_hash: str | None) -> CollectedContent | None:
        """Fetch content and return it only if the normalized hash differs from `last_content_hash`."""
        robots_url = self._robots_check_url()
        if not is_allowed_by_robots(robots_url):
            raise PermissionError(f"robots.txt disallows fetching {robots_url}")

        self._respect_rate_limit()
        raw = self.fetch_raw()
        normalized = self._normalize(raw)
        content_hash = self._hash(normalized)

        if last_content_hash is not None and content_hash == last_content_hash:
            return None

        return CollectedContent(
            url=self.url,
            raw_content=raw,
            normalized_content=normalized,
            content_hash=content_hash,
        )

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
                    time.sleep(2**attempt)  # exponential backoff: 1s, 2s, 4s
        raise last_error  # type: ignore[misc]
