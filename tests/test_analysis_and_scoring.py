import pytest

from backend.analysis import analyst
from backend.analysis.analyst import AnalystOutput, _parse, analyze_change, summarize_baseline
from backend.analysis.validator import validate_signal
from backend.scoring.scorer import PRIORITY_RUBRIC, score_signal

PAGE = (
    "pricing plans for growing teams. starter plan $49 per month includes 5 users and email support. "
    "growth plan $1,249 per month includes 25 users, sso and priority support. enterprise contact sales."
)


def out(claim: str) -> AnalystOutput:
    return AnalystOutput(what_changed=claim, why_it_matters="x", suggested_response=None)


@pytest.mark.parametrize(
    "claim",
    [
        "The Growth plan price increased from $199 to $1,249 per month.",
        "Starter costs $49 per month and includes 5 users with email support.",
        "Growth plan now includes SSO and priority support.",
        "Pricing page lists starter, growth and enterprise plans.",
    ],
)
def test_validator_accepts_grounded_claims(claim):
    assert validate_signal(out(claim), PAGE, old_content="growth plan $199 per month")


@pytest.mark.parametrize(
    "claim",
    [
        "They launched a free tier for students with unlimited AI features.",
        "The company was acquired by Microsoft and is shutting down its API.",
        "Starter plan price rose to $59 per month.",  # invented number
        "Growth plan includes 30 users.",  # wrong number
    ],
)
def test_validator_rejects_ungrounded_claims(claim):
    assert not validate_signal(out(claim), PAGE)


def test_validator_handles_empty_and_numberless_inputs():
    assert validate_signal(out(""), PAGE)  # nothing claimed, nothing invented
    assert not validate_signal(out("Major platform overhaul announced"), "")


@pytest.mark.parametrize(
    ("source_type", "significance", "expected"),
    [
        ("pricing", None, "high"),
        ("pricing", "high", "high"),  # capped at high
        ("pricing", "low", "medium"),
        ("news", "high", "medium"),
        ("news", "low", "low"),  # floored at low
        ("news", "none", "low"),
        ("community", "medium", "medium"),
        ("feature", "high", "high"),
        ("job_posting", None, "low"),
        ("unknown-type", "high", "medium"),
        ("pricing", "bogus", "high"),
    ],
)
def test_score_signal(source_type, significance, expected):
    assert score_signal(source_type, significance) == expected


def test_every_source_type_has_a_rubric_entry():
    from backend.collectors import COLLECTOR_BY_SOURCE_TYPE

    assert set(COLLECTOR_BY_SOURCE_TYPE) == set(PRIORITY_RUBRIC)


def test_parse_normalizes_llm_output():
    parsed = _parse({"what_changed": "a", "why_it_matters": "b", "significance": "CRITICAL", "suggested_response": ""})
    assert parsed.significance == "medium"
    assert parsed.suggested_response is None
    assert _parse({"what_changed": 1, "why_it_matters": 2, "significance": "None"}).significance == "none"
    with pytest.raises(KeyError):
        _parse({"why_it_matters": "missing what_changed"})


class _Source:
    source_type = "pricing"
    url = "https://example.com/pricing"


def test_analyst_prompts_include_changed_regions_and_truncate(monkeypatch):
    captured = {}

    def fake(system, user, max_tokens=2048):
        captured["system"], captured["user"] = system, user
        return {"what_changed": "x", "why_it_matters": "y", "significance": "high"}

    monkeypatch.setattr(analyst, "complete_json", fake)
    analyze_change(_Source(), "old " * 5000, "new " * 5000, [], [("price $49", "price $59")])
    assert "CHANGED REGIONS:\nOLD: price $49\nNEW: price $59" in captured["user"]
    assert len(captured["user"]) < 15_000

    summarize_baseline(_Source(), "content " * 5000, [])
    assert "FIRST time" in captured["system"]
    assert len(captured["user"]) < 6_000
