# Collectors

## Purpose
Fetch a competitor's current content for one source (pricing / feature / job posting / review / general / news / community), hash it, and only pass it downstream if the hash changed since last check. Handles robots.txt compliance, rate limiting, and retry/backoff so this stage is polite and resilient on its own.

## File structure
```
backend/collectors/base.py               # BaseCollector: hashing, normalization, robots.txt check, rate limit, retry/backoff
backend/collectors/pricing_collector.py  # requests + BeautifulSoup
backend/collectors/feature_collector.py  # requests + BeautifulSoup
backend/collectors/jobs_collector.py     # Playwright (job boards are commonly JS-rendered)
backend/collectors/review_collector.py   # Playwright — G2/Capterra/Trustpilot profile page (rating, review count)
backend/collectors/general_collector.py  # requests + BeautifulSoup — catch-all "track everything" page (usually the homepage)
backend/collectors/news_collector.py     # Hacker News Algolia search API (free, keyless)
backend/collectors/community_collector.py # HN buying-intent/complaint search ("alternative to X")
backend/collectors/__init__.py           # COLLECTOR_BY_SOURCE_TYPE registry
```

## Build steps
1. `BaseCollector.collect(last_content_hash)` is the entrypoint every collector shares: checks robots.txt, rate-limits, fetches, normalizes whitespace, hashes (SHA-256), and returns `None` if the hash is unchanged.
2. Each subclass only implements `fetch_raw()` — the actual fetch-and-extract-text logic for that source type.
3. `NewsCollector` and `CommunityCollector` are both special cases: their `url` field is actually treated as a search query (typically the competitor name), not a URL, since they hit a search API rather than scraping a fixed page.
4. Wire up real source rows in the `sources` table once competitor URLs are known — `backend/main.py`'s `_process_source()` picks the right collector via `COLLECTOR_BY_SOURCE_TYPE[source.source_type]`.
5. `CommunityCollector` searches HN Algolia (free, keyless, always on) for buying-intent phrases like "{competitor} alternative" and "switching from {competitor}", rather than plain name mentions like `NewsCollector`. It also searched Reddit via OAuth until 2026-09-11, when that was dropped — see the note in the file and `docs/decisions.md`.
6. `ReviewCollector` scrapes a competitor's G2/Capterra/Trustpilot profile page via Playwright (same reasoning as `JobsCollector` — these pages render their rating/review-count widget client-side) and hashes the whole visible page text, same convention as `PricingCollector`/`FeatureCollector` — the analyst LLM narrates what actually changed (e.g. rating or review count) rather than this collector parsing out specific numbers with site-specific CSS selectors, which would be brittle against any of the three sites' markup changes.
7. `GeneralCollector` (user request, 2026-09-14) is the plain `requests`+BeautifulSoup pattern applied to whatever URL is given — usually the competitor's homepage — for someone who wants the whole competitor tracked rather than one specific category. No category-specific parsing at all, same "hash the whole page, let the analyst LLM describe what changed" approach as pricing/feature/review. `backend/discovery/source_finder.py` picks the competitor's known website deterministically for this one (no search+LLM step needed — the homepage is already the broadest page there is).

## Status
**Verified against real sites** (2026-09-03) — all 7 sources for the ComplyDo pilot (Vanta: pricing/feature/jobs/news, Drata: pricing/feature/news) fetch real content successfully. Three real bugs were found and fixed in the process — see the 2026-09-03 entry in [decisions.md](./decisions.md) for full detail. Drata has no jobs source (its careers page is Cloudflare-bot-protected, no external ATS mirror exists — dropped rather than worked around).

`CommunityCollector`'s HN side **verified against real data** (2026-09-10): searching "Vanta" surfaced genuine buying-intent posts (e.g. "need feedback please alternative to vanta/conveyor because i hate subscriptions", a "Comp AI — open source alternative to Drata and Vanta" Show HN). It also had a Reddit side (OAuth `client_credentials` flow), dropped 2026-09-11 without ever being exercised with real credentials — not worth provisioning a Reddit app for; see `docs/decisions.md`.

`ReviewCollector` added 2026-09-11 — **not yet verified against a real G2/Capterra/Trustpilot page** (untested with live credentials/URLs in this session; these sites are known to run bot protection similar to Drata's Cloudflare wall, so the same non-200-fails-open robots.txt handling in `base.py` applies, but the page fetch itself could still be blocked in practice — eyeball a real captured snapshot before trusting it, per the gotcha below).

## Gotchas
- `JobsCollector` launches a full Chromium instance per call via Playwright — slower and heavier than the requests-based collectors. Fine for weekly runs, would need pooling for higher frequency.
- Robots.txt is checked per-host and cached in-process (`_robots_cache` in `base.py`) — a long-running process won't re-check robots.txt after the first fetch to that host.
- `NewsCollector`'s HN-only coverage may prove too thin depending on the actual pilot competitors — swap in a different news source later if so (see the note in the file itself).
- **`is_allowed_by_robots()` fetches robots.txt with our own real User-Agent, not `RobotFileParser.read()`'s default.** Some sites' bot protection (Cloudflare, on Drata) 403s the generic default urllib UA even when the real robots.txt allows us — and `RobotFileParser` fails *closed* (disallow-all) both on a 401/403 **and** whenever it's never successfully parsed at all (a bare 404 was incorrectly disallowing everything, backwards from RFC 9309). Any non-200/fetch-failure now explicitly sets `parser.allow_all = True`.
- A source whose `url` isn't itself a fetchable page (currently only `NewsCollector`, whose `url` is a search query) must override `BaseCollector._robots_check_url()` to point the robots check at the host it actually fetches from — otherwise `urlparse()` chokes on the non-URL value.
- Some competitor pages may be behind a bot-verification interstitial (Cloudflare "Just a moment...", etc.) that embeds request-unique content (e.g. a `ray id`) — if a collector doesn't fail loudly, this silently produces a different content hash on *every* fetch, which the change detector will misread as a real change on every single run. Always eyeball a new collector's actual captured text once before trusting its hash, not just check that the request succeeded.
- Reddit's unauthenticated `*.reddit.com/*.json` endpoints (the old free way to hit Reddit search) are dead as of Reddit's 2023 API lockdown — confirmed by hand 2026-09-10: `www.reddit.com/search.json` 403s, and even `old.reddit.com/search.json` returns HTTP 200 with an HTML login-wall page instead of JSON, so a naive `response.json()` would raise a confusing `JSONDecodeError` rather than a clean request failure. Don't reach for the old `.json` search URLs in a new collector — they look like they work (200 status) while silently returning HTML. `CommunityCollector` briefly worked around this with real OAuth (`client_credentials` grant, `oauth.reddit.com`), then dropped Reddit entirely 2026-09-11 rather than provision a Reddit app for it — see `docs/decisions.md`.
