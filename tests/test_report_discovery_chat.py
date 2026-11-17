import types
from datetime import date

import pytest

from backend.chat import qa
from backend.discovery import competitor_finder, search, source_finder
from backend.discovery.search import SearchResult
from backend.report.charts import render_report_charts
from backend.report.diff_util import MAX_CHARS, render_diff_html
from backend.report.pdf_renderer import render_report_html


# --- Report rendering ----------------------------------------------------------------------


def test_diff_escapes_html_and_marks_changes():
    html, truncated = render_diff_html("price <b>$49</b>", "price <script>alert(1)</script>")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "<del>" in html and "<ins>" in html
    assert not truncated
    assert render_diff_html("a" * (MAX_CHARS + 1), "b")[1]


def test_charts_skip_empty_data_and_cycle_colors(tmp_path):
    assert render_report_charts(None, tmp_path) == {}
    assert render_report_charts({"volume_by_competitor": {}, "category_breakdown": {}}, tmp_path) == {}
    many = {f"type{i}": i + 1 for i in range(9)}  # more categories than palette colors
    paths = render_report_charts({"volume_by_competitor": {"A": 2}, "category_breakdown": many}, tmp_path)
    assert set(paths) == {"volume_by_competitor", "category_breakdown"}
    assert all(p.stat().st_size > 0 for p in paths.values())


def test_pdf_template_escapes_llm_text():
    """LLM output comes from scraped third-party pages — it must never be rendered as HTML."""
    report = types.SimpleNamespace(
        headline="<img src=x onerror=alert(1)>",
        executive_summary="<script>steal()</script>",
        target_company=types.SimpleNamespace(name="Acme & Co"),
        week_start=date(2026, 1, 1),
        week_end=date(2026, 1, 8),
    )
    card = types.SimpleNamespace(
        source_type="pricing", competitor_name="<b>Evil</b>", what_changed="<iframe>", why_it_matters="x",
        suggested_response=None, priority="high", source_url="https://x", is_baseline=False,
        diff_html="<ins>ok</ins>", diff_truncated=False,
    )
    html = render_report_html(report, [card], {})
    assert "<script>steal" not in html and "&lt;script&gt;" in html
    assert "<img src=x" not in html and "<iframe>" not in html and "<b>Evil</b>" not in html
    assert "<ins>ok</ins>" in html  # the pre-escaped diff is still rendered as markup
    assert "Acme &amp; Co" in html


# --- Discovery -----------------------------------------------------------------------------


@pytest.fixture
def no_homepage(monkeypatch):
    monkeypatch.setattr(competitor_finder, "_fetch_homepage_text", lambda website: "")


def test_find_competitors_cleans_llm_output(monkeypatch, no_homepage):
    monkeypatch.setattr(competitor_finder, "web_search", lambda q, count=5, include_domains=None: [
        SearchResult("Acme itself", "https://acme.io/about", "own page"),
        SearchResult("Rival", "https://rival.com", "a rival"),
        SearchResult("Rival dup", "https://rival.com", "duplicate url"),
    ])
    prompts = []

    def fake_llm(system, user, max_tokens=2048):
        prompts.append(user)
        if "work out what it sells" in system:
            return {"description": "compliance automation", "category": "soc2 software", "search_queries": ["q1", 5, ""]}
        return {"competitors": [
            {"name": "Acme", "website": "https://acme.io"},  # the company itself
            {"name": "Rival", "website": "https://rival.com", "confidence": "high"},
            {"name": "rival", "website": "https://rival2.com"},  # duplicate name
            {"name": "", "website": "https://blank.com"},
            "not a dict",
            {"name": "Other", "website": "https://www.acme.io/x"},  # own domain
            {"name": "B", "confidence": "certain"},
            {"name": "C"}, {"name": "D"}, {"name": "E"}, {"name": "F"},
        ]}

    monkeypatch.setattr(competitor_finder, "complete_json", fake_llm)
    result = competitor_finder.find_competitors("Acme", "https://acme.io", "we automate soc2")
    names = [c.name for c in result]
    assert names == ["Rival", "B", "C", "D", "E"]  # capped at 5
    assert result[0].confidence == "high" and result[1].confidence == "low"
    assert "acme.io/about" not in prompts[-1]  # own-domain search results filtered out
    assert prompts[-1].count("https://rival.com") == 1


def test_find_competitors_survives_profile_failure(monkeypatch):
    monkeypatch.setattr(competitor_finder, "_fetch_homepage_text", lambda website: "Homepage text " * 30)
    monkeypatch.setattr(competitor_finder, "web_search", lambda q, count=5, include_domains=None: [])
    calls = []

    def fake_llm(system, user, max_tokens=2048):
        calls.append(system)
        if "work out what it sells" in system:
            raise ValueError("bad json")
        return {"competitors": [{"name": "Rival", "website": "https://rival.com"}]}

    monkeypatch.setattr(competitor_finder, "complete_json", fake_llm)
    assert [c.name for c in competitor_finder.find_competitors("Acme", "https://acme.io")] == ["Rival"]


def test_find_sources_rejects_non_urls(monkeypatch):
    seen = []
    monkeypatch.setattr(source_finder, "web_search",
                        lambda q, count=5, include_domains=None: seen.append((q, include_domains)) or [])
    monkeypatch.setattr(source_finder, "complete_json", lambda s, u, max_tokens=2048: {
        "pricing": "https://rival.com/pricing", "feature": "null", "job_posting": "rival.com/jobs", "review": None,
    })
    result = {(c.source_type, c.url) for c in source_finder.find_sources("Rival", "https://www.rival.com")}
    assert result == {
        ("pricing", "https://rival.com/pricing"), ("news", "Rival"), ("community", "Rival"),
        ("general", "https://www.rival.com"),
    }
    restricted = {q.split()[-1]: d for q, d in seen}
    assert restricted["pricing"] == ["rival.com"]
    assert dict(seen)["Rival careers OR jobs"] is None


def test_web_search_requires_key_and_sends_domain_filter(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY")
    with pytest.raises(KeyError):
        search.web_search("x")
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    sent = {}

    class _R:
        def raise_for_status(self):
            pass

        def json(self):
            return {"results": [{"title": "T", "url": "https://u", "content": "C"}, {}]}

    monkeypatch.setattr(search.requests, "post", lambda url, headers, json, timeout: sent.update(json) or _R())
    results = search.web_search("q", count=3, include_domains=["a.com"])
    assert sent == {"query": "q", "max_results": 3, "include_domains": ["a.com"], "include_domains_mode": "filter"}
    assert results[0] == SearchResult("T", "https://u", "C") and results[1] == SearchResult("", "", "")


# --- Chat prompts --------------------------------------------------------------------------


def _signal(i: int, content: str) -> qa.SignalContext:
    return qa.SignalContext(f"Comp{i}", "news", "https://x", "low", False, "changed", "matters", None, content, content)


def test_report_prompt_is_capped():
    prompt = qa.build_report_system_prompt("H", "2026-01-01", "2026-01-08", None, [_signal(i, "z" * 5000) for i in range(50)])
    assert len(prompt) < qa.MAX_SIGNALS_BLOCK_CHARS + 3000
    assert "truncated" in prompt
    assert "(no signals this week)" in qa.build_report_system_prompt(None, "a", "b", None, [])


def test_company_prompt_and_history_trimming():
    prompt = qa.build_company_system_prompt(
        "Acme", [qa.CompetitorSummary("Me", None, True), qa.CompetitorSummary("Rival", "https://r", False)], [], []
    )
    assert "Me (your own company)" in prompt and "Rival (competitor) — https://r" in prompt
    history = [qa.ChatMessage("user", str(i)) for i in range(20)]
    assert [m.content for m in qa._trim_history(history)] == [str(i) for i in range(14, 20)]


def test_stream_answer_sends_trimmed_history(monkeypatch):
    captured = {}
    monkeypatch.setattr(qa, "stream_text", lambda messages, max_tokens: captured.update(m=messages) or iter(["a", "b"]))
    history = [qa.ChatMessage("user", "old")] * 10
    assert "".join(qa.stream_answer("SYS", history, "Q?")) == "ab"
    assert captured["m"][0] == {"role": "system", "content": "SYS"}
    assert captured["m"][-1] == {"role": "user", "content": "Q?"}
    assert len(captured["m"]) == 1 + qa.HISTORY_TURNS_KEPT * 2 + 1
