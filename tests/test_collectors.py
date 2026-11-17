from urllib.parse import parse_qs, urlparse

import pytest
import requests

from backend.collectors import COLLECTOR_BY_SOURCE_TYPE, CommunityCollector, NewsCollector, PricingCollector
from backend.collectors import base
from backend.collectors.base import BaseCollector, html_to_text


class _Resp:
    def __init__(self, status=200, text="", data=None):
        self.status_code, self.text, self._data = status, text, data

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")


class _Static(BaseCollector):
    source_type = "test"

    def __init__(self, text):
        super().__init__("https://example.com/page")
        self.text = text

    def fetch_raw(self):
        return self.text


@pytest.fixture(autouse=True)
def allow_robots(monkeypatch):
    monkeypatch.setattr(base, "is_allowed_by_robots", lambda url: True)


def test_collect_normalizes_and_hashes():
    first = _Static("  Hello\n\n World  ").collect(None)
    assert first.normalized_content == "hello world"
    assert len(first.content_hash) == 64
    assert _Static("hello world").collect(first.content_hash) is None  # same content -> no change
    assert _Static("hello there").collect(first.content_hash) is not None


def test_collect_rejects_empty_pages():
    with pytest.raises(ValueError):
        _Static("   \n ").collect(None)


def test_collect_respects_robots(monkeypatch):
    monkeypatch.setattr(base, "is_allowed_by_robots", lambda url: False)
    with pytest.raises(PermissionError):
        _Static("content").collect(None)


def test_robots_parsing_and_fail_open(monkeypatch):
    base._robots_cache.clear()
    responses = {
        "https://blocked.example/robots.txt": _Resp(200, "User-agent: *\nDisallow: /private"),
        "https://missing.example/robots.txt": _Resp(404),
        "https://forbidden.example/robots.txt": _Resp(403),
    }

    def fake_get(url, **kwargs):
        if url == "https://down.example/robots.txt":
            raise requests.ConnectionError("down")
        return responses[url]

    monkeypatch.undo()  # restore the real is_allowed_by_robots replaced by the autouse fixture
    monkeypatch.setattr(base.requests, "get", fake_get)
    assert base.is_allowed_by_robots("https://blocked.example/public")
    assert not base.is_allowed_by_robots("https://blocked.example/private/x")
    assert base.is_allowed_by_robots("https://missing.example/anything")
    assert base.is_allowed_by_robots("https://forbidden.example/anything")
    assert base.is_allowed_by_robots("https://down.example/anything")


def test_robots_cache_expires(monkeypatch):
    monkeypatch.undo()
    base._robots_cache.clear()
    calls = []

    def fake_get(url, **kwargs):
        calls.append(url)
        return _Resp(404)

    monkeypatch.setattr(base.requests, "get", fake_get)
    clock = [1000.0]
    monkeypatch.setattr(base.time, "monotonic", lambda: clock[0])
    base.is_allowed_by_robots("https://cache.example/a")
    base.is_allowed_by_robots("https://cache.example/b")
    assert len(calls) == 1
    clock[0] += base.ROBOTS_CACHE_TTL_SECONDS + 1
    base.is_allowed_by_robots("https://cache.example/c")
    assert len(calls) == 2


def test_get_retries_then_raises(monkeypatch):
    attempts = []

    def fake_get(url, **kwargs):
        attempts.append(url)
        return _Resp(503)

    monkeypatch.setattr(base.requests, "get", fake_get)
    monkeypatch.setattr(base.time, "sleep", lambda s: None)
    with pytest.raises(requests.HTTPError):
        PricingCollector("https://example.com/pricing")._get()
    assert len(attempts) == 3


def test_static_collector_strips_boilerplate(monkeypatch):
    html = (
        "<html><head><style>.x{}</style><script>track()</script></head><body>"
        "<nav>Home About</nav><h1>Pricing</h1><p>Pro $49</p><footer>© 2026</footer></body></html>"
    )
    monkeypatch.setattr(base.requests, "get", lambda url, **kw: _Resp(200, html))
    assert PricingCollector("https://example.com/pricing").fetch_raw() == "Pricing Pro $49"


def test_html_to_text_handles_garbage():
    assert html_to_text("") == ""
    assert html_to_text("<div><p>unclosed") == "unclosed"
    assert html_to_text("plain text") == "plain text"


def test_hn_queries_are_url_encoded_and_counts_excluded(monkeypatch):
    urls = []

    def fake_get(url, **kwargs):
        urls.append(url)
        return _Resp(200, data={"hits": [
            {"objectID": "1", "title": "AT&T launches thing", "url": "https://x.example/1", "points": 99},
            {"objectID": "1", "title": "AT&T launches thing", "url": "https://x.example/1", "points": 99},
            {"objectID": "2", "comment_text": "<p>switching from <i>Q&A #1</i></p>", "story_url": "https://x.example/2"},
            {"objectID": "3", "title": ""},
        ]})

    monkeypatch.setattr(base.requests, "get", fake_get)
    text = CommunityCollector("Q&A #1 Corp").fetch_raw()

    queries = [parse_qs(urlparse(u).query)["query"][0] for u in urls]
    assert queries == ["Q&A #1 Corp alternative", "switching from Q&A #1 Corp"]
    assert all(urlparse(u).path.endswith("/search_by_date") for u in urls)
    assert "points" not in text and "99" not in text
    assert text.count("AT&T launches thing") == 1  # de-duplicated by objectID
    assert "switching from Q&A #1" in text and "<p>" not in text


def test_news_collector_single_query(monkeypatch):
    urls = []
    monkeypatch.setattr(base.requests, "get", lambda url, **kw: urls.append(url) or _Resp(200, data={"hits": []}))
    assert NewsCollector("Vanta").fetch_raw() == ""
    assert len(urls) == 1 and parse_qs(urlparse(urls[0]).query)["tags"] == ["story"]


def test_hn_collectors_check_robots_for_the_api_host():
    assert urlparse(NewsCollector("x")._robots_check_url()).netloc == "hn.algolia.com"


def test_registry_covers_schema_source_types():
    assert set(COLLECTOR_BY_SOURCE_TYPE) == {
        "pricing", "feature", "job_posting", "news", "community", "review", "general"
    }
    for source_type, cls in COLLECTOR_BY_SOURCE_TYPE.items():
        assert cls.source_type == source_type
