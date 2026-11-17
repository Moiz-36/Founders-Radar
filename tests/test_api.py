"""The FastAPI app over HTTP (in-process), plus the scheduled service's entrypoint."""

import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from backend import main
from backend.db.models import ChatMessage, Report, TargetCompany

client = TestClient(main.app)
MISSING = "00000000-0000-0000-0000-000000000000"


@pytest.fixture
def company(make_company, fake_web):
    fake_web.pages["https://rival.example/pricing"] = "growth plan $199 per month for teams"
    return make_company(owner_id=None, sources={"Rival": [("pricing", "https://rival.example/pricing")]})


def wait_for_run(session, company_id, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session.expire_all()
        status = session.get(TargetCompany, company_id).run_status
        if status != "running":
            return status
        time.sleep(0.2)
    raise AssertionError("run did not finish")


def test_health_and_shared_secret(monkeypatch):
    assert client.get("/health").json() == {"status": "ok"}
    monkeypatch.setattr(main, "PIPELINE_SHARED_SECRET", "s3cret")
    assert client.post(f"/run/{MISSING}").status_code == 401
    assert client.post(f"/run/{MISSING}", headers={"x-pipeline-secret": "wrong"}).status_code == 401
    assert client.post(f"/run/{MISSING}", headers={"x-pipeline-secret": "s3cret"}).status_code == 404
    assert client.get("/health").status_code == 200  # health stays open for Cloud Run probes


@pytest.mark.parametrize("bad_id", ["not-a-uuid", "1", "'; DROP TABLE reports; --", MISSING])
def test_bad_or_missing_ids_are_404(bad_id):
    assert client.post(f"/run/{bad_id}").status_code == 404
    assert client.get(f"/reports/{bad_id}/pdf").status_code == 404
    assert client.post(f"/chat/report/{bad_id}", json={"question": "hi"}).status_code == 404
    assert client.post(f"/chat/company/{bad_id}", json={"question": "hi"}).status_code == 404


def test_run_starts_in_background_and_rejects_double_start(session, company, fake_llm):
    first = client.post(f"/run/{company}")
    assert first.status_code == 202 and first.json() == {"status": "running"}
    second = client.post(f"/run/{company}")
    if session.get(TargetCompany, company).run_status == "running":
        assert second.status_code == 409
    assert wait_for_run(session, company) == "done"
    assert session.execute(select(Report)).scalars().first() is not None


def test_stale_running_status_does_not_block_forever(session, company, fake_llm):
    session.execute(update(TargetCompany).values(
        run_status="running", run_started_at=datetime.now(timezone.utc) - timedelta(hours=2)))
    session.commit()
    assert client.post(f"/run/{company}").status_code == 202
    assert wait_for_run(session, company) == "done"


@pytest.mark.parametrize(
    "body",
    [{}, {"company_name": ""}, {"company_name": "   "}, {"company_name": "x" * 201},
     {"company_name": "ok", "description": "d" * 2001}, {"company_name": 5}],
)
def test_discover_competitors_validates_input(body):
    assert client.post("/discover/competitors", json=body).status_code == 422


def test_discover_endpoints_return_candidates(monkeypatch):
    from backend.discovery import CompetitorCandidate, SourceCandidate

    monkeypatch.setattr(main, "find_competitors", lambda n, w, d: [CompetitorCandidate("Rival", "https://r", "high")])
    monkeypatch.setattr(main, "find_sources", lambda n, w: [SourceCandidate("news", n)])
    assert client.post("/discover/competitors", json={"company_name": " Acme "}).json() == {
        "competitors": [{"name": "Rival", "website": "https://r", "confidence": "high"}]}
    assert client.post("/discover/sources", json={"competitor_name": "Rival"}).json() == {
        "sources": [{"source_type": "news", "url": "Rival"}]}
    assert client.post("/discover/sources", json={"competitor_name": " "}).status_code == 422


@pytest.fixture
def report_id(session, company, fake_llm):
    return main.run_pipeline_for_target(company).id


@pytest.fixture
def fake_chat(monkeypatch):
    from backend.chat import qa

    prompts = []

    def stream(messages, max_tokens):
        prompts.append(messages)
        yield "Answer "
        yield "text."

    monkeypatch.setattr(qa, "stream_text", stream)
    return prompts


def test_report_chat_streams_persists_and_uses_history(session, report_id, fake_chat):
    response = client.post(f"/chat/report/{report_id}", json={"question": "What changed?"})
    assert response.status_code == 200 and response.text == "Answer text."
    rows = session.execute(select(ChatMessage).order_by(ChatMessage.created_at)).scalars().all()
    assert [(r.role, r.content) for r in rows] == [("user", "What changed?"), ("assistant", "Answer text.")]
    assert "$199" in fake_chat[0][0]["content"]  # the report's signals are in the system prompt

    client.post(f"/chat/report/{report_id}", json={"question": "And?"})
    assert [m["content"] for m in fake_chat[1][1:]] == ["What changed?", "Answer text.", "And?"]


def test_chat_rejects_bad_questions(report_id, fake_chat):
    assert client.post(f"/chat/report/{report_id}", json={"question": ""}).status_code == 422
    assert client.post(f"/chat/report/{report_id}", json={"question": "q" * 2001}).status_code == 422
    assert client.post(f"/chat/report/{report_id}", json={}).status_code == 422


def test_chat_rate_limit(session, report_id, fake_chat):
    for _ in range(main.CHAT_RATE_LIMIT_PER_HOUR):
        session.add(ChatMessage(scope="report", subject_id=report_id, role="user", content="q"))
    session.commit()
    response = client.post(f"/chat/report/{report_id}", json={"question": "one more"})
    assert response.status_code == 429


def test_chat_llm_failure_gives_a_message_and_saves_nothing(session, report_id, monkeypatch):
    from backend.chat import qa

    def broken(messages, max_tokens):
        raise RuntimeError("groq down")
        yield  # pragma: no cover

    monkeypatch.setattr(qa, "stream_text", broken)
    response = client.post(f"/chat/report/{report_id}", json={"question": "hi"})
    assert "something went wrong" in response.text
    roles = session.execute(select(ChatMessage.role)).scalars().all()
    assert roles == ["user"]


def test_company_chat_uses_semantic_search(session, company, report_id, fake_chat):
    response = client.post(f"/chat/company/{company}", json={"question": "What does growth cost?"})
    assert response.status_code == 200
    system = fake_chat[0][0]["content"]
    assert "Rival (competitor)" in system and "growth plan $199" in system


def test_company_chat_with_no_competitors(make_company, fake_chat):
    empty = make_company(name="Empty")
    assert client.post(f"/chat/company/{empty}", json={"question": "anything?"}).status_code == 200
    assert "(none tracked yet)" in fake_chat[0][0]["content"]


def test_pdf_endpoint(report_id, monkeypatch):
    monkeypatch.setattr(main, "render_report_pdf", lambda session, report: b"%PDF-1.4 fake")
    response = client.get(f"/reports/{report_id}/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_real_pdf_render(session, report_id):
    """Renders through real headless Chromium if Playwright's browser is installed locally."""
    pytest.importorskip("playwright")
    from backend.report.pdf_renderer import render_report_pdf

    try:
        pdf = render_report_pdf(session, session.get(Report, report_id))
    except Exception as exc:  # browser binary not installed on this machine
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright Chromium not installed")
        raise
    assert pdf.startswith(b"%PDF") and len(pdf) > 1000


# --- Scheduled service entrypoint ----------------------------------------------------------


class _Req:
    def __init__(self, body):
        self.body = body

    def get_json(self, silent=False):
        return self.body


def test_scheduled_entrypoint(session, company, fake_llm, monkeypatch):
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "infra" / "cloud_function" / "main.py"
    spec = importlib.util.spec_from_file_location("cloud_function_main", path)
    entry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(entry)
    monkeypatch.delenv("TARGET_COMPANY_ID", raising=False)

    assert entry.run_weekly_pipeline(_Req({"target_company_id": "nope"}))[1] == 400
    assert entry.run_weekly_pipeline(_Req({"target_company_id": str(uuid.uuid4())}))[1] == 409
    body, status = entry.run_weekly_pipeline(_Req({"target_company_id": str(company)}))
    assert status == 200 and body["status"] == "done"
    body, status = entry.run_weekly_pipeline(_Req({}))
    assert status == 200 and body == {"results": []}  # just checked, so nothing is due
    body, status = entry.run_weekly_pipeline(None)
    assert status == 200
