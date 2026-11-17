"""Market data: stock price parsing/caching, funding extraction guard rails, the two API
endpoints, and funding_rounds RLS."""

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend import main
from backend.db.models import Competitor, FundingRoundRow
from backend.discovery.search import SearchResult
from backend.market import funding, stocks
from backend.market.stocks import PriceHistory, PricePoint
from tests.conftest import as_user

client = TestClient(main.app)

# --- stocks.py -----------------------------------------------------------------------------

DAY = 86_400
T0 = 1_763_337_600  # 2025-11-17 00:00 UTC


def yahoo_payload(closes, currency="USD"):
    return {"chart": {"result": [{
        "meta": {"currency": currency},
        "timestamp": [T0 + i * DAY for i in range(len(closes))],
        "indicators": {"quote": [{"close": closes}]},
    }], "error": None}}


class _Resp:
    def __init__(self, status=200, data=None):
        self.status_code, self._data = status, data

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.fixture(autouse=True)
def clear_stock_cache():
    stocks._cache.clear()
    yield
    stocks._cache.clear()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("msft", "MSFT"), (" $okta ", "OKTA"), ("brk-b", "BRK-B"), ("ry.to", "RY.TO"), ("^gspc", None),
     ("", None), (None, None), ("drop table;", None), ("A" * 16, None), ("ab cd", None)],
)
def test_normalize_ticker(raw, expected):
    assert stocks.normalize_ticker(raw) == expected


def test_parse_skips_nulls_and_sorts():
    history = stocks._parse("X", yahoo_payload([10.0, None, 12.123456, 11.0], currency="EUR"))
    assert history.currency == "EUR"
    assert [p.close for p in history.points] == [10.0, 12.1235, 11.0]
    assert history.points[0].date == date(2025, 11, 17)


@pytest.mark.parametrize(
    "payload",
    [{"chart": {"result": None, "error": {"description": "No data found"}}}, {}, yahoo_payload([None, None])],
)
def test_parse_rejects_empty_data(payload):
    with pytest.raises(ValueError):
        stocks._parse("X", payload)


def test_fetch_caches_and_maps_404(monkeypatch):
    calls = []
    monkeypatch.setattr(stocks.requests, "get",
                        lambda url, **kw: calls.append(url) or _Resp(200, yahoo_payload([1.0, 2.0])))
    assert len(stocks.fetch_price_history("msft").points) == 2
    stocks.fetch_price_history("MSFT")
    assert len(calls) == 1  # cached
    monkeypatch.setattr(stocks.requests, "get", lambda url, **kw: _Resp(404))
    with pytest.raises(ValueError, match="Unknown ticker"):
        stocks.fetch_price_history("ZZZZ")
    with pytest.raises(ValueError, match="Not a valid"):
        stocks.fetch_price_history("bad ticker")


# --- funding.py ----------------------------------------------------------------------------

RESULTS = [SearchResult("Acme raises B", "https://news.example/b", "..."),
           SearchResult("Acme seed", "https://news.example/seed", "...")]


def run_find_funding(monkeypatch, llm_output):
    monkeypatch.setattr(funding, "web_search", lambda q, count=5, include_domains=None: RESULTS)
    monkeypatch.setattr(funding, "complete_json", lambda s, u, max_tokens=2048: llm_output)
    return funding.find_funding("Acme", "https://acme.io")


def test_find_funding_keeps_only_cited_well_formed_rounds(monkeypatch):
    profile = run_find_funding(monkeypatch, {"ticker": " acme ", "rounds": [
        {"round": "Series B", "announced_on": "2024-03-15", "amount_usd": "50,000,000",
         "valuation_usd": 400000000, "investors": "Big VC", "source_url": "https://news.example/b"},
        {"round": "Seed", "announced_on": "2021", "amount_usd": 2e6, "source_url": "https://news.example/seed"},
        {"round": "Series C", "amount_usd": 1e8, "source_url": "https://invented.example/c"},  # uncited
        {"round": "", "amount_usd": 1e6, "source_url": "https://news.example/b"},  # unnamed
        {"round": "Series B", "announced_on": "2024-03-15", "source_url": "https://news.example/b"},  # duplicate
        {"round": "Bridge", "amount_usd": -5, "valuation_usd": "lots", "announced_on": "1850-01-01",
         "source_url": "https://news.example/b"},
        "garbage",
    ]})
    assert profile.ticker == "ACME"
    # Undated rounds first (in the order given), then by date.
    assert [r.round for r in profile.rounds] == ["Seed", "Bridge", "Series B"]
    seed, bridge, series_b = profile.rounds
    assert bridge.amount_usd is None and bridge.valuation_usd is None and bridge.announced_on is None
    assert seed.announced_on is None  # "2021" isn't an ISO date — dropped, not guessed
    assert series_b.amount_usd == 50_000_000 and series_b.valuation_usd == 400_000_000
    assert series_b.announced_on == date(2024, 3, 15)


def test_find_funding_handles_empty_and_odd_output(monkeypatch):
    assert run_find_funding(monkeypatch, {}).rounds == []
    profile = run_find_funding(monkeypatch, {"ticker": "not a ticker!", "rounds": None})
    assert profile.ticker is None and profile.rounds == []


# --- API -----------------------------------------------------------------------------------


@pytest.fixture
def company(session, make_company):
    company_id = make_company(name="Acme")
    for name, ticker in (("Public Co", "PUB"), ("Broken Co", "BRKN"), ("Private Co", None)):
        session.add(Competitor(target_company_id=company_id, name=name, website=None, stock_ticker=ticker))
    session.commit()
    return company_id


def competitor(session, name):
    session.expire_all()
    return session.execute(select(Competitor).where(Competitor.name == name)).scalar_one()


def test_stocks_endpoint_reports_failures_per_ticker(company, monkeypatch):
    def fake(ticker):
        if ticker == "BRKN":
            raise ValueError("Unknown ticker symbol: BRKN")
        return PriceHistory(ticker, "USD", [PricePoint(date(2026, 1, 1), 10.0), PricePoint(date(2026, 1, 2), 11.0)])

    monkeypatch.setattr(main, "fetch_price_history", fake)
    body = client.get(f"/market/{company}/stocks").json()
    assert [s["ticker"] for s in body["series"]] == ["PUB"]
    assert body["series"][0]["points"] == [{"date": "2026-01-01", "close": 10.0}, {"date": "2026-01-02", "close": 11.0}]
    assert body["errors"][0]["ticker"] == "BRKN" and "Unknown" in body["errors"][0]["error"]


def test_stocks_endpoint_edge_cases(make_company):
    assert client.get(f"/market/{make_company(name='No tickers')}/stocks").json() == {"series": [], "errors": []}
    assert client.get(f"/market/{uuid.uuid4()}/stocks").status_code == 404
    assert client.get("/market/not-a-uuid/stocks").status_code == 404


def test_funding_refresh_replaces_rounds_and_fills_ticker(session, company, monkeypatch):
    private = competitor(session, "Private Co")
    rounds = [funding.FundingRound("Seed", date(2022, 1, 1), 1e6, None, None, "https://x/1")]
    monkeypatch.setattr(main, "find_funding", lambda name, website: funding.FundingProfile("PRIV", rounds))

    assert client.post(f"/market/competitors/{private.id}/funding").json() == {"rounds": 1, "ticker": "PRIV"}
    rounds = [funding.FundingRound("Series A", date(2023, 1, 1), 5e6, 2e7, "VC", "https://x/2"),
              funding.FundingRound("Series B", None, None, None, None, "https://x/3")]
    client.post(f"/market/competitors/{private.id}/funding")
    stored = session.execute(select(FundingRoundRow.round).order_by(FundingRoundRow.round)).scalars().all()
    assert stored == ["Series A", "Series B"]  # replaced, not appended
    assert competitor(session, "Private Co").funding_checked_at is not None


def test_funding_refresh_never_overwrites_a_user_ticker(session, company, monkeypatch):
    public = competitor(session, "Public Co")
    monkeypatch.setattr(main, "find_funding", lambda name, website: funding.FundingProfile("OTHER", []))
    assert client.post(f"/market/competitors/{public.id}/funding").json()["ticker"] == "PUB"


def test_funding_refresh_failure_keeps_old_rounds(session, company, monkeypatch):
    private = competitor(session, "Private Co")
    session.add(FundingRoundRow(competitor_id=private.id, round="Seed", source_url="https://x"))
    session.commit()

    def boom(name, website):
        raise RuntimeError("tavily quota exhausted")

    monkeypatch.setattr(main, "find_funding", boom)
    assert client.post(f"/market/competitors/{private.id}/funding").status_code == 502
    assert session.execute(select(FundingRoundRow.round)).scalars().all() == ["Seed"]
    assert client.post(f"/market/competitors/{uuid.uuid4()}/funding").status_code == 404


# --- RLS -----------------------------------------------------------------------------------


def test_funding_rounds_rls(db_conn, make_user):
    owner, stranger = make_user(), make_user()
    company_id, competitor_id = uuid.uuid4(), uuid.uuid4()
    db_conn.execute("INSERT INTO target_companies (id, name, owner_id) VALUES (%s, 'A', %s)", (company_id, owner))
    db_conn.execute("INSERT INTO competitors (id, target_company_id, name) VALUES (%s, %s, 'C')", (competitor_id, company_id))
    db_conn.execute("INSERT INTO funding_rounds (competitor_id, round, source_url) VALUES (%s, 'Seed', 'u')", (competitor_id,))

    def count():
        return db_conn.execute("SELECT count(*) FROM funding_rounds").fetchone()[0]

    with as_user(db_conn, owner):
        assert count() == 1
        db_conn.execute("UPDATE competitors SET stock_ticker = 'ABC' WHERE id = %s", (competitor_id,))
    with as_user(db_conn, stranger):
        assert count() == 0
    with as_user(db_conn, None, role="anon"):
        assert count() == 0
    db_conn.execute("DELETE FROM competitors WHERE id = %s", (competitor_id,))
    assert count() == 0  # cascades
