# Collectors

## Purpose
Fetch a competitor's current content for one source (pricing / feature / job posting / news), hash it, and only pass it downstream if the hash changed since last check. Handles robots.txt compliance, rate limiting, and retry/backoff so this stage is polite and resilient on its own.

## File structure
```
backend/collectors/base.py               # BaseCollector: hashing, normalization, robots.txt check, rate limit, retry/backoff
backend/collectors/pricing_collector.py  # requests + BeautifulSoup
backend/collectors/feature_collector.py  # requests + BeautifulSoup
backend/collectors/jobs_collector.py     # Playwright (job boards are commonly JS-rendered)
backend/collectors/news_collector.py     # Hacker News Algolia search API (free, keyless)
backend/collectors/__init__.py           # COLLECTOR_BY_SOURCE_TYPE registry
```

## Build steps
1. `BaseCollector.collect(last_content_hash)` is the entrypoint every collector shares: checks robots.txt, rate-limits, fetches, normalizes whitespace, hashes (SHA-256), and returns `None` if the hash is unchanged.
2. Each subclass only implements `fetch_raw()` — the actual fetch-and-extract-text logic for that source type.
3. `NewsCollector` is a special case: its `url` field is actually treated as a search query (typically the competitor name), not a URL, since it hits a search API rather than scraping a fixed page.
4. Wire up real source rows in the `sources` table once competitor URLs are known — `backend/main.py`'s `_process_source()` picks the right collector via `COLLECTOR_BY_SOURCE_TYPE[source.source_type]`.

## Status
Code written, compiles, never run against a real URL. **This is the next real test** — before anything else in the pipeline can be exercised end-to-end with real data, we need to confirm each collector actually extracts usable text from a real target site.

## Gotchas
- `JobsCollector` launches a full Chromium instance per call via Playwright — slower and heavier than the requests-based collectors. Fine for weekly runs, would need pooling for higher frequency.
- Robots.txt is checked per-host and cached in-process (`_robots_cache` in `base.py`) — a long-running process won't re-check robots.txt after the first fetch to that host.
- `NewsCollector`'s HN-only coverage may prove too thin depending on the actual pilot competitors — swap in a different news source later if so (see the note in the file itself).
