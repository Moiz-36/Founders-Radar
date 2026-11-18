"""Daily stock price history for publicly traded competitors.

Source: Yahoo Finance's chart endpoint — free and keyless, but unofficial and undocumented.
It's isolated in this one module so it can be swapped for a keyed provider (Alpha Vantage,
Finnhub, Twelve Data) without touching anything else. (Stooq, the other common keyless
option, now serves a JavaScript bot check instead of CSV — tried 2026-11-17.)

Prices change at most daily, so results are cached in-process for a few hours: a busy
company page doesn't refetch on every view.
"""

import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone

import requests

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
# Yahoo rejects requests without a browser-like User-Agent.
USER_AGENT = "Mozilla/5.0 (compatible; FoundersRadar/0.1)"
REQUEST_TIMEOUT = 15
CACHE_TTL_SECONDS = 6 * 60 * 60
HISTORY_RANGE = "1y"

# Letters/digits plus the separators exchanges use: BRK-B, RY.TO, ^GSPC.
TICKER_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9.\-^=]{0,14}$")


@dataclass
class PricePoint:
    date: date
    close: float


@dataclass
class PriceHistory:
    ticker: str
    currency: str | None
    points: list[PricePoint]


_cache: dict[str, tuple[float, PriceHistory]] = {}


def normalize_ticker(raw: str | None) -> str | None:
    """Upper-cased, trimmed ticker, or None if it isn't a plausible symbol."""
    if not raw:
        return None
    ticker = raw.strip().upper().removeprefix("$")
    return ticker if TICKER_PATTERN.match(ticker) else None


def _parse(ticker: str, payload: dict) -> PriceHistory:
    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        error = (payload.get("chart") or {}).get("error") or {}
        raise ValueError(f"No price data for {ticker}: {error.get('description', 'unknown symbol')}")
    data = result[0]
    timestamps = data.get("timestamp") or []
    closes = ((data.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []

    by_day: dict[date, float] = {}
    for ts, close in zip(timestamps, closes, strict=False):
        if close is None:  # Yahoo emits nulls for halted/holiday rows
            continue
        by_day[datetime.fromtimestamp(ts, timezone.utc).date()] = round(float(close), 4)
    points = [PricePoint(day, close) for day, close in sorted(by_day.items())]
    if not points:
        raise ValueError(f"No price data for {ticker}")
    return PriceHistory(ticker=ticker, currency=(data.get("meta") or {}).get("currency"), points=points)


def fetch_price_history(ticker: str) -> PriceHistory:
    """About a year of daily closes. Raises ValueError for an unknown/invalid symbol and
    requests exceptions for network trouble — callers report those per ticker."""
    symbol = normalize_ticker(ticker)
    if symbol is None:
        raise ValueError(f"Not a valid ticker symbol: {ticker!r}")

    cached = _cache.get(symbol)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    response = requests.get(
        YAHOO_CHART_URL.format(ticker=symbol),
        params={"range": HISTORY_RANGE, "interval": "1d"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    if response.status_code == 404:
        raise ValueError(f"Unknown ticker symbol: {symbol}")
    response.raise_for_status()
    history = _parse(symbol, response.json())
    _cache[symbol] = (time.monotonic(), history)
    return history
