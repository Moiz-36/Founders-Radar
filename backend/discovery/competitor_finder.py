"""Auto-discovers a company's real competitors via web search + LLM synthesis.

Output is always presented to the user for review/edit before anything is saved (see
docs/09-v2-plan.md's human-in-the-loop decision) — this module only proposes candidates,
it never writes to the database itself.

Searching by name alone ("X competitors alternatives") only works for companies the web
already writes about. A new or little-known company (e.g. an app on a *.onrender.com URL)
gets results about unrelated companies with similar names, and the LLM guesses. So we first
work out what the company actually does — from the user's description and/or its own
homepage — and search by that product category instead.
"""

from dataclasses import dataclass
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from backend.collectors.base import USER_AGENT, render_with_playwright
from backend.discovery.search import SearchResult, web_search
from backend.llm import complete_json

HOMEPAGE_CHAR_LIMIT = 4000
# Free hosts like Render can take ~50s to wake a sleeping app.
HOMEPAGE_TIMEOUT_MS = 60_000
MAX_COMPETITORS = 5

PROFILE_PROMPT = """You are a market research analyst. From the information given about a \
company, work out what it sells and to whom.

Respond with ONLY a JSON object with this exact shape:
{
  "description": "one sentence: what the product does and who it is for",
  "category": "a short product category a buyer would search for, e.g. 'travel safety app'",
  "search_queries": ["2 web search queries that would surface direct competitors"]
}
If the information is too thin to tell, use empty strings and an empty list."""

SYSTEM_PROMPT = """You are a market research analyst. Identify a company's real, direct \
competitors — other companies selling a similar product to a similar customer, not review \
sites, "best of" listicle sites, the company's own pages, or generic industry news.

Use the company description as the source of truth for what the company does. Search \
results may be about a DIFFERENT company with a similar name — ignore anything that \
doesn't match the description. You may use your own knowledge of the market for that \
product category if the search results are thin.

Return 3 to 5 competitors, ranked by how directly they compete. For each, give your best \
guess at their homepage URL (a real company website, not a search result page).

Respond with ONLY a JSON object with this exact shape:
{
  "competitors": [
    {"name": "...", "website": "https://...", "confidence": "high" | "medium" | "low"}
  ]
}"""


@dataclass
class CompetitorCandidate:
    name: str
    website: str | None
    confidence: str


def _page_text(html: str) -> str:
    """Title + meta description + visible text — the meta description is often the single
    best one-line summary of what a company does, so it's kept even though collectors drop it."""
    soup = BeautifulSoup(html, "html.parser")
    meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    title = soup.title.get_text(strip=True) if soup.title else ""
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    parts = [title, meta.get("content", "") if meta else "", soup.get_text(separator=" ", strip=True)]
    return " ".join(p for p in parts if p)[:HOMEPAGE_CHAR_LIMIT]


def _fetch_homepage_text(website: str) -> str:
    """Best-effort homepage text. Tries a plain GET first, then Playwright for JS-only apps
    (React/Vite sites ship an empty <div id="root"> until the JS runs). Returns "" on any
    failure — discovery still works from the name and description alone."""
    try:
        response = requests.get(website, headers={"User-Agent": USER_AGENT}, timeout=30)
        text = _page_text(response.text)
        if len(text) > 200:
            return text
    except requests.RequestException:
        pass

    try:
        return _page_text(render_with_playwright(website, timeout_ms=HOMEPAGE_TIMEOUT_MS))
    except Exception:
        return ""


def _profile_company(company_name: str, website: str | None, description: str | None) -> dict:
    homepage = _fetch_homepage_text(website) if website else ""
    if not homepage and not description:
        return {"description": "", "category": "", "search_queries": []}

    info = f"Company: {company_name}\n"
    if website:
        info += f"Website: {website}\n"
    if description:
        info += f"Founder's description: {description}\n"
    if homepage:
        info += f"Homepage text:\n{homepage}\n"

    try:
        profile = complete_json(PROFILE_PROMPT, info, max_tokens=1024)
    except Exception:
        # Profiling only sharpens the search queries — fall back to name-only discovery
        # rather than failing the whole request.
        profile = {}
    if description and not profile.get("description"):
        profile["description"] = description
    return profile


def _domain(url: str | None) -> str:
    if not url:
        return ""
    return urlparse(url if "://" in url else f"https://{url}").netloc.lower().removeprefix("www.")


def find_competitors(
    company_name: str, website: str | None = None, description: str | None = None
) -> list[CompetitorCandidate]:
    profile = _profile_company(company_name, website, description)
    known_description = profile.get("description") or description or ""
    category = profile.get("category") or ""

    search_queries = profile.get("search_queries")
    queries = [q for q in search_queries if isinstance(q, str) and q][:2] if isinstance(search_queries, list) else []
    if category:
        queries.append(f"best {category} alternatives")
    queries.append(f"{company_name} competitors alternatives")

    own_domain = _domain(website)
    results: list[SearchResult] = []
    seen_urls: set[str] = set()
    for query in queries:
        for r in web_search(query, count=6):
            if r.url in seen_urls or (own_domain and _domain(r.url) == own_domain):
                continue
            seen_urls.add(r.url)
            results.append(r)

    results_block = "\n".join(f"- {r.title} ({r.url}): {r.description}" for r in results) or "(no results)"
    context = f"Company: {company_name}" + (f" ({website})" if website else "")
    if known_description:
        context += f"\nWhat it does: {known_description}"
    if category:
        context += f"\nProduct category: {category}"

    parsed = complete_json(SYSTEM_PROMPT, f"{context}\n\nSearch results:\n{results_block}", max_tokens=1024)

    candidates: list[CompetitorCandidate] = []
    seen_names: set[str] = set()
    for c in parsed.get("competitors", []):
        name = str(c.get("name") or "").strip() if isinstance(c, dict) else ""
        # Drop blanks, duplicates, and the company itself (the LLM sometimes lists it).
        if not name or name.lower() in seen_names or name.lower() == company_name.strip().lower():
            continue
        if own_domain and _domain(c.get("website")) == own_domain:
            continue
        seen_names.add(name.lower())
        confidence = c.get("confidence")
        candidates.append(
            CompetitorCandidate(
                name=name,
                website=c.get("website") or None,
                confidence=confidence if confidence in ("high", "medium", "low") else "low",
            )
        )
    return candidates[:MAX_COMPETITORS]
