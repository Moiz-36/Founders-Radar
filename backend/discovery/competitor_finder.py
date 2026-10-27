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

import json
import os
from dataclasses import dataclass
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from openai import OpenAI

from backend.collectors.base import USER_AGENT
from backend.discovery.search import SearchResult, web_search

# Groq's API is OpenAI-compatible — see backend/analysis/analyst.py.
MODEL = "openai/gpt-oss-120b"
HOMEPAGE_CHAR_LIMIT = 4000
# Free hosts like Render can take ~50s to wake a sleeping app.
HOMEPAGE_TIMEOUT_MS = 60_000

_client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")

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
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.goto(website, timeout=HOMEPAGE_TIMEOUT_MS, wait_until="networkidle")
            html = page.content()
            browser.close()
        return _page_text(html)
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

    response = _client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
        messages=[{"role": "system", "content": PROFILE_PROMPT}, {"role": "user", "content": info}],
    )
    profile = json.loads(response.choices[0].message.content)
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

    queries = [q for q in profile.get("search_queries", []) if q][:2]
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

    response = _client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context}\n\nSearch results:\n{results_block}"},
        ],
    )

    parsed = json.loads(response.choices[0].message.content)
    return [
        CompetitorCandidate(
            name=c["name"],
            website=c.get("website"),
            confidence=c.get("confidence", "low"),
        )
        for c in parsed.get("competitors", [])
        if _domain(c.get("website")) != own_domain or not own_domain
    ]
