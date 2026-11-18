"""Actual plan prices from a competitor's pricing page, for side-by-side comparison.

The pipeline already stores each pricing page's text as a snapshot (that's how pricing
*changes* are detected). This reads the latest snapshot and has the LLM list the plans on it.

Guard rails, since this is extraction from scraped page text:
- a price must appear on the page as a number; anything else is stored as "not listed"
  (e.g. "Contact sales"), never estimated;
- the currency is only recorded when the page makes it clear — a wrong currency is worse
  than none;
- the monthly figure used for comparison is computed here from price + billing period, not
  taken from the LLM.
"""

from dataclasses import dataclass

from backend.llm import complete_json

# Pricing pages are a few thousand characters; this bounds the prompt to well inside the LLM
# provider's per-minute token limit even for an unusually long page.
MAX_PAGE_CHARS = 9000
MAX_PLANS = 12
BILLING_PERIODS = {"month", "year", "one_time"}
KNOWN_CURRENCIES = {"USD", "EUR", "GBP", "CAD", "AUD", "INR", "CHF", "JPY", "SEK", "NOK", "DKK", "PLN", "BRL"}

SYSTEM_PROMPT = """You are a pricing analyst. Below is the text of ONE company's pricing \
page (scraped and lowercased). List the plans it offers.

Rules:
- One entry per plan, in the order the page lists them. Include free and custom/enterprise plans.
- "price": the number shown for the plan, as a plain number (24, 349, 0). If the page shows no \
number for it (e.g. "contact sales", "custom"), use null. Never estimate.
- If the page shows both monthly and yearly prices, use the price billed MONTHLY and set \
"billing_period" to "month". Otherwise "billing_period" is "month", "year", "one_time", or \
null if unclear.
- "currency": ISO code (USD, EUR, GBP, ...) ONLY if the page makes it unambiguous ($ = USD \
unless another dollar is named, € = EUR, £ = GBP, or the code is written out). Otherwise null.
- "unit": what the price is per, if stated, as one lowercase word ("seat", "user", "session", \
"agent"); null for a flat price.

Respond with ONLY a JSON object:
{"plans": [{"plan": "Pro", "price": 24, "currency": "EUR", "billing_period": "month", "unit": "seat"}]}"""


@dataclass
class PricePlan:
    plan: str
    price: float | None
    currency: str | None
    billing_period: str | None
    monthly_price: float | None
    unit: str | None


def _price(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _monthly(price: float | None, period: str | None) -> float | None:
    if price is None:
        return None
    if period == "year":
        return round(price / 12, 2)
    if period == "month":
        return price
    return None  # one-time or unknown period: not comparable month to month


def extract_price_plans(competitor_name: str, page_text: str) -> list[PricePlan]:
    parsed = complete_json(
        SYSTEM_PROMPT,
        f"Company: {competitor_name}\n\nPricing page text:\n{page_text[:MAX_PAGE_CHARS]}",
        max_tokens=2048,
    )
    plans: list[PricePlan] = []
    seen: set[str] = set()
    for item in parsed.get("plans") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("plan") or "").strip()[:60]
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        price = _price(item.get("price"))
        period = item.get("billing_period") if item.get("billing_period") in BILLING_PERIODS else None
        currency = str(item.get("currency") or "").strip().upper() or None
        unit = str(item.get("unit") or "").strip().lower()[:20] or None
        plans.append(
            PricePlan(
                plan=name,
                price=price,
                currency=currency if currency in KNOWN_CURRENCIES else None,
                billing_period=period,
                monthly_price=_monthly(price, period),
                unit=unit,
            )
        )
    return plans[:MAX_PLANS]
