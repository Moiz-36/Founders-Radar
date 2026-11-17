"""Auto-discovers the pricing/feature/jobs/review source URLs for one competitor.

Same human-in-the-loop philosophy as competitor_finder.py — these are candidates for the
user to review/edit/remove, never written to the database directly. A type with no
confident match is just omitted (matches how backend/db/seed.py's real ComplyDo data
sometimes has no job_posting source at all, e.g. Drata's Cloudflare-blocked careers page —
that's a real, expected outcome, not a bug to work around here).
"""

from dataclasses import dataclass
from urllib.parse import urlparse

from backend.discovery.search import web_search
from backend.llm import complete_json

# One search query per scraped source type. "news" and "community" are intentionally
# excluded — their `url` is a search term (the competitor's name), not a page to search for.
SEARCH_QUERIES = {
    "pricing": "{name} pricing",
    "feature": "{name} changelog OR blog OR \"what's new\" OR release notes",
    "job_posting": "{name} careers OR jobs",
    "review": "{name} reviews G2 OR Capterra OR Trustpilot",
}

# pricing/feature pages should live on the competitor's own domain — an open web search for
# e.g. "Coda pricing" gets dominated by third-party review/aggregator sites (vendr.com,
# roundup blogs) that rank above coda.io/pricing itself (confirmed by hand testing this).
# job_posting is deliberately NOT restricted: it legitimately often lives on an external ATS
# domain (Greenhouse, Lever, Ashby). review is NOT restricted either — a review source is by
# definition a third-party site (G2/Capterra/Trustpilot).
RESTRICT_TO_OWN_DOMAIN = {"pricing", "feature"}

SYSTEM_PROMPT = """You are a market research analyst finding specific pages on a \
competitor's website. For each source type below, you're given web search results — pick \
the single best URL that actually matches that type, or null if none of the results are a \
good match (e.g. a job board search result that's actually blocked or unrelated). A job \
posting source may legitimately be on an external site (Greenhouse, Lever, Ashby, etc.) \
instead of the company's own domain — that's normal and still a good match. A review source \
should be the competitor's actual profile page on a review site (G2, Capterra, or \
Trustpilot), not a blog post or roundup article that merely mentions reviews.

Respond with ONLY a JSON object with this exact shape:
{
  "pricing": "https://..." | null,
  "feature": "https://..." | null,
  "job_posting": "https://..." | null,
  "review": "https://..." | null
}"""


@dataclass
class SourceCandidate:
    source_type: str
    url: str


def _domain_of(website: str) -> str | None:
    netloc = urlparse(website if "://" in website else f"https://{website}").netloc
    return netloc.removeprefix("www.") or None


def _is_http_url(value: object) -> bool:
    """The LLM occasionally returns "null" as a string, a bare domain, or prose."""
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def find_sources(competitor_name: str, website: str | None = None) -> list[SourceCandidate]:
    context_line = f"Competitor: {competitor_name}" + (f" ({website})" if website else "")
    domain = _domain_of(website) if website else None

    results_blocks = []
    for source_type, query_template in SEARCH_QUERIES.items():
        query = query_template.format(name=competitor_name)
        include_domains = [domain] if domain and source_type in RESTRICT_TO_OWN_DOMAIN else None
        results = web_search(query, count=5, include_domains=include_domains)
        results_text = "\n".join(f"  - {r.title} ({r.url}): {r.description}" for r in results) or "  (no results)"
        results_blocks.append(f"{source_type.upper()} search results:\n{results_text}")

    parsed = complete_json(SYSTEM_PROMPT, f"{context_line}\n\n" + "\n\n".join(results_blocks), max_tokens=1024)
    candidates = [
        SourceCandidate(source_type=source_type, url=parsed[source_type])
        for source_type in SEARCH_QUERIES
        if _is_http_url(parsed.get(source_type))
    ]
    # News and community are deterministic, not search+LLM-derived — see SEARCH_QUERIES above.
    candidates.append(SourceCandidate(source_type="news", url=competitor_name))
    candidates.append(SourceCandidate(source_type="community", url=competitor_name))
    # "general" (the catch-all source) is also deterministic: the competitor's own homepage is
    # already the broadest possible page. Omitted when no website is known.
    if website:
        candidates.append(SourceCandidate(source_type="general", url=website))
    return candidates
