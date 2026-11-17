"""Funding rounds and valuations for (mostly private) competitors, from web search + LLM.

There's no free structured source for private-company funding (Crunchbase/PitchBook are
paid), so this does what a founder would do by hand: search the web for the company's
funding news (Tavily) and have the LLM extract the rounds it finds. The same call also
reports whether the company is publicly traded, and its ticker — which feeds stocks.py.

Guard rails, since this is extraction from news snippets:
- every round must cite one of the search results' URLs, or it's discarded;
- amounts must be positive numbers in USD; anything unparseable is dropped, not guessed;
- the extracted data is shown to the founder with its source link, never as fact without one.
"""

from dataclasses import dataclass
from datetime import date

from backend.discovery.search import web_search
from backend.llm import complete_json
from backend.market.stocks import normalize_ticker

SEARCH_RESULTS = 8
MAX_ROUNDS = 15

SYSTEM_PROMPT = """You are a financial research analyst. From the web search results given, \
extract the funding history of ONE specific company. Ignore results about other companies \
with similar names.

Rules:
- Only include a funding round if a search result states it. Never use outside knowledge for \
rounds, amounts or valuations.
- For each round, "source_url" must be the URL of the search result that states it.
- Amounts and valuations are plain numbers in US dollars (e.g. 25000000 for $25M). Convert \
other currencies only if the result gives the USD figure; otherwise use null.
- "announced_on" is an ISO date (YYYY-MM-DD); use the first day of the month (or year) if only \
the month (or year) is known; null if unknown.
- "valuation_usd" is the post-money valuation if stated, else null.
- "ticker": if the company is publicly traded, its main stock ticker symbol (you may use your \
own knowledge for this one field); otherwise null.

Respond with ONLY a JSON object:
{
  "ticker": "ABC" | null,
  "rounds": [
    {"round": "Series B", "announced_on": "2024-03-01", "amount_usd": 50000000,
     "valuation_usd": 400000000, "investors": "Lead investor names", "source_url": "https://..."}
  ]
}"""


@dataclass
class FundingRound:
    round: str
    announced_on: date | None
    amount_usd: float | None
    valuation_usd: float | None
    investors: str | None
    source_url: str


@dataclass
class FundingProfile:
    ticker: str | None
    rounds: list[FundingRound]


def _positive_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.replace(",", "").replace("$", "").strip()
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _iso_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None
    return parsed if 1990 <= parsed.year <= date.today().year + 1 else None


def find_funding(company_name: str, website: str | None = None) -> FundingProfile:
    query = f"{company_name} funding round raised valuation"
    results = web_search(query, count=SEARCH_RESULTS)
    allowed_urls = {r.url for r in results if r.url}

    context = f"Company: {company_name}" + (f" ({website})" if website else "")
    results_block = "\n".join(f"- {r.title} ({r.url}): {r.description}" for r in results) or "(no results)"
    parsed = complete_json(SYSTEM_PROMPT, f"{context}\n\nSearch results:\n{results_block}", max_tokens=2048)

    rounds: list[FundingRound] = []
    seen: set[tuple[str, date | None]] = set()
    for item in parsed.get("rounds") or []:
        if not isinstance(item, dict):
            continue
        source_url = item.get("source_url")
        name = str(item.get("round") or "").strip()[:60]
        if source_url not in allowed_urls or not name:
            continue  # uncited or unnamed rounds are dropped, not guessed
        announced_on = _iso_date(item.get("announced_on"))
        key = (name.lower(), announced_on)
        if key in seen:
            continue
        seen.add(key)
        investors = str(item.get("investors") or "").strip()[:300] or None
        rounds.append(
            FundingRound(
                round=name,
                announced_on=announced_on,
                amount_usd=_positive_number(item.get("amount_usd")),
                valuation_usd=_positive_number(item.get("valuation_usd")),
                investors=investors,
                source_url=source_url,
            )
        )

    rounds.sort(key=lambda r: r.announced_on or date.min)
    return FundingProfile(ticker=normalize_ticker(parsed.get("ticker")), rounds=rounds[:MAX_ROUNDS])
