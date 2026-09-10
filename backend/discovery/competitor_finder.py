"""Auto-discovers a company's real competitors via web search + LLM synthesis.

Output is always presented to the user for review/edit before anything is saved (see
docs/09-v2-plan.md's human-in-the-loop decision) — this module only proposes candidates,
it never writes to the database itself.
"""

import json
import os
from dataclasses import dataclass

from openai import OpenAI

from backend.discovery.search import web_search

# Groq's API is OpenAI-compatible — see backend/analysis/analyst.py.
MODEL = "openai/gpt-oss-120b"

_client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")

SYSTEM_PROMPT = """You are a market research analyst. Given web search results about a \
company's competitive landscape, identify its real, direct competitors — other companies \
selling a similar product to a similar customer, not review sites, "best of" listicle \
sites, the company's own pages, or generic industry news.

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


def find_competitors(company_name: str, website: str | None = None) -> list[CompetitorCandidate]:
    query = f"{company_name} competitors alternatives"
    results = web_search(query, count=8)

    results_block = "\n".join(f"- {r.title} ({r.url}): {r.description}" for r in results) or "(no results)"
    context_line = f"Company: {company_name}" + (f" ({website})" if website else "")

    response = _client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_line}\n\nSearch results:\n{results_block}"},
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
    ]
