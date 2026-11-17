"""End-to-end pipeline runs against the real (local) database, with the web and the LLM faked."""

import threading
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from backend import main
from backend.db.models import Report, Signal, Snapshot, Source, TargetCompany

PRICING = "https://rival.example/pricing"
NEWS = "Rival"
PAGE = " ".join(f"section {i} describes the compliance platform." for i in range(80))


def count(session, model, *where):
    return session.execute(select(func.count()).select_from(model).where(*where)).scalar_one()


def source_by_url(session, url):
    session.expire_all()
    return session.execute(select(Source).where(Source.url == url)).scalar_one()


@pytest.fixture
def company(make_company, fake_web):
    fake_web.pages[PRICING] = f"{PAGE} growth plan $199 per month"
    fake_web.pages[NEWS] = "rival raises series a — https://news.example/1"
    return make_company(sources={"Rival": [("pricing", PRICING), ("news", NEWS)]})


def test_first_run_reports_baselines(session, company, fake_llm):
    report = main.run_pipeline_for_target(company)
    assert report is not None
    signals = session.execute(select(Signal)).scalars().all()
    assert len(signals) == 2 and all(s.is_baseline and s.validated for s in signals)
    assert sorted(report.signal_ids) == sorted(s.id for s in signals)
    assert report.headline == "Test headline"
    assert report.pdf_url is None  # PDFs are on demand now
    assert report.chart_data["volume_by_competitor"] == {"Rival": 2}
    assert report.visibility == "public"  # ownerless (pilot) company
    assert {s.priority for s in signals} == {"high", "medium"}  # pricing high+high, news low+high


def test_unchanged_run_is_skipped_but_counts_as_a_check(session, company, fake_llm):
    main.run_pipeline_for_target(company)
    llm_calls = len(fake_llm.calls)
    before = source_by_url(session, PRICING).last_checked_at

    assert main.run_pipeline_for_target(company) is None
    assert count(session, Report) == 1
    assert len(fake_llm.calls) == llm_calls  # no analyst or summary calls
    assert source_by_url(session, PRICING).last_checked_at > before


def test_real_change_produces_one_new_signal(session, company, fake_web, fake_llm):
    main.run_pipeline_for_target(company)
    fake_web.pages[PRICING] = f"{PAGE} growth plan $249 per month"

    report = main.run_pipeline_for_target(company)
    assert report is not None and len(report.signal_ids) == 1
    signal = session.get(Signal, report.signal_ids[0])
    assert not signal.is_baseline and signal.validated
    assert "$249" in signal.what_changed
    assert signal.old_snapshot_id and signal.new_snapshot_id
    assert 0 < signal.similarity_score < 1
    assert signal.priority == "high"


def test_noise_only_change_stores_nothing(session, company, fake_web, fake_llm):
    main.run_pipeline_for_target(company)
    fake_web.pages[PRICING] = f"{PAGE}   Growth plan $199 per month!"  # case/spacing/punctuation

    assert main.run_pipeline_for_target(company) is None
    pricing = source_by_url(session, PRICING)
    assert count(session, Snapshot, Snapshot.source_id == pricing.id) == 1
    # The new hash is remembered, so the noisy version isn't re-checked every run.
    assert main.run_pipeline_for_target(company) is None


def test_insignificant_change_keeps_snapshot_but_no_signal(session, company, fake_web, fake_llm):
    main.run_pipeline_for_target(company)
    fake_web.pages[NEWS] = "rival raises series a — https://news.example/1\nrival updates logo — https://news.example/2"
    fake_llm.significance = "none"

    assert main.run_pipeline_for_target(company) is None
    news = source_by_url(session, NEWS)
    assert count(session, Snapshot, Snapshot.source_id == news.id) == 2
    assert count(session, Signal) == 2  # only the baselines


def test_llm_failure_does_not_lose_the_change(session, company, fake_web, fake_llm):
    """Regression for the lost-change bug: the snapshot and hash used to be committed even
    when the LLM call failed, so the next run saw no change and the signal never appeared."""
    main.run_pipeline_for_target(company)
    original_hash = source_by_url(session, PRICING).last_content_hash
    fake_web.pages[PRICING] = f"{PAGE} growth plan $249 per month"

    fake_llm.fail_with = RuntimeError("Groq 429 rate limit")
    fake_llm.fail_for_url = PRICING
    assert main.run_pipeline_for_target(company) is None  # nothing else changed
    pricing = source_by_url(session, PRICING)
    assert pricing.status == "broken"
    assert pricing.last_content_hash == original_hash
    assert count(session, Snapshot, Snapshot.source_id == pricing.id) == 1

    fake_llm.fail_with = None
    report = main.run_pipeline_for_target(company)
    assert report is not None and len(report.signal_ids) == 1
    assert "$249" in session.get(Signal, report.signal_ids[0]).what_changed
    assert source_by_url(session, PRICING).status == "active"


def test_one_broken_source_does_not_block_others(session, company, fake_web, fake_llm):
    fake_web.pages[PRICING] = PermissionError("robots.txt disallows")
    report = main.run_pipeline_for_target(company)
    assert report is not None and len(report.signal_ids) == 1
    assert source_by_url(session, PRICING).status == "broken"
    assert source_by_url(session, NEWS).status == "active"


def test_failed_report_generation_is_recovered_next_run(session, company, fake_llm):
    fake_llm.fail_summary = True
    with pytest.raises(RuntimeError):
        main.run_pipeline_for_target(company)
    assert count(session, Signal) == 2 and count(session, Report) == 0

    fake_llm.fail_summary = False
    report = main.run_pipeline_for_target(company)
    assert report is not None and len(report.signal_ids) == 2
    assert main.run_pipeline_for_target(company) is None  # signals aren't reported twice


def test_company_without_sources_and_missing_company(make_company, fake_llm):
    assert main.run_pipeline_for_target(make_company(name="Empty")) is None
    with pytest.raises(ValueError):
        main.run_pipeline_for_target("00000000-0000-0000-0000-000000000000")


# --- Scheduling ----------------------------------------------------------------------------


def set_last_checked(session, company_id, when):
    session.execute(update(Source).values(last_checked_at=when))
    session.commit()


@pytest.mark.parametrize(
    ("days_ago", "interval", "due"),
    [(None, 7, True), (0, 7, False), (6, 7, False), (7, 7, True), (8, 7, True), (1, 1, True), (0.97, 1, True), (0.9, 1, False)],
)
def test_is_report_due(session, company, days_ago, interval, due):
    session.execute(update(TargetCompany).values(report_interval_days=interval))
    if days_ago is not None:
        set_last_checked(session, company, datetime.now(timezone.utc) - timedelta(days=days_ago))
    session.commit()
    assert main._is_report_due(session, session.get(TargetCompany, company)) is due


def test_due_check_uses_latest_report_too(session, company, fake_llm):
    main.run_pipeline_for_target(company)
    set_last_checked(session, company, None)
    session.expire_all()
    assert not main._is_report_due(session, session.get(TargetCompany, company))


def test_claim_run_is_exclusive_and_recovers_stale_runs(session, company):
    results = []
    barrier = threading.Barrier(8)

    def claim():
        barrier.wait()
        results.append(main.claim_run(company))

    threads = [threading.Thread(target=claim) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(True) == 1

    session.execute(update(TargetCompany).values(run_started_at=datetime.now(timezone.utc) - timedelta(hours=1)))
    session.commit()
    assert main.claim_run(company)  # stale run reclaimed
    import uuid

    assert not main.claim_run(uuid.uuid4())


def test_execute_claimed_run_records_outcomes(session, company, fake_web, fake_llm):
    assert main.claim_run(company)
    assert main.execute_claimed_run(company)["status"] == "done"
    assert main.claim_run(company)
    assert main.execute_claimed_run(company)["status"] == "skipped"
    fake_llm.fail_summary = True
    fake_web.pages[NEWS] = "something new — https://news.example/9"
    assert main.claim_run(company)
    assert main.execute_claimed_run(company)["status"] == "failed"
    session.expire_all()
    row = session.get(TargetCompany, company)
    assert row.run_status == "failed" and row.run_finished_at is not None


def test_scheduled_pass_isolates_failures_and_orders_by_overdue(session, make_company, fake_web, fake_llm, monkeypatch):
    fake_web.pages["https://a.example"] = "alpha page"
    fake_web.pages["https://b.example"] = RuntimeError("boom")  # broken source, still reports nothing
    fake_web.pages["https://c.example"] = "gamma page"
    a = make_company(name="A", sources={"CA": [("general", "https://a.example")]})
    b = make_company(name="B", sources={"CB": [("general", "https://b.example")]})
    c = make_company(name="C", sources={"CC": [("general", "https://c.example")]})
    main.run_pipeline_for_target(a)
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    session.execute(update(Source).where(Source.url == "https://a.example").values(last_checked_at=month_ago))
    session.execute(update(Report).values(created_at=month_ago))
    session.commit()

    order = []
    real = main.run_pipeline_for_target
    monkeypatch.setattr(main, "run_pipeline_for_target", lambda cid: order.append(cid) or real(cid))
    results = {r["target_company_id"]: r["status"] for r in main.run_pipeline_for_all_active_companies()}
    assert results == {str(a): "skipped", str(b): "skipped", str(c): "done"}
    assert set(order[:2]) == {b, c} and order[2] == a  # never-checked first, then most overdue

    order.clear()
    assert main.run_pipeline_for_all_active_companies() == [{"target_company_id": str(b), "status": "skipped", "report_id": None}]


def test_scheduled_pass_respects_time_budget(make_company, fake_web, fake_llm, monkeypatch):
    fake_web.pages["https://a.example"] = "alpha"
    make_company(name="A", sources={"CA": [("general", "https://a.example")]})
    monkeypatch.setattr(main, "SCHEDULED_TIME_BUDGET_SECONDS", -1)
    assert main.run_pipeline_for_all_active_companies() == []
