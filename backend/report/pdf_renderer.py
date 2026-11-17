"""Renders a report to PDF, on demand.

The PDF used to be rendered and uploaded to Supabase Storage on every pipeline run, but
nothing in the app ever linked to it, its signed URL expired after 30 days, and it was the
heaviest step of a run (a second Chromium launch). Now it's built only when someone clicks
"Download PDF" (GET /reports/{id}/pdf, reached through the frontend's access-checked
/api/reports/[id]/pdf route), from the same data the web report shows. See docs/decisions.md.

Uses Playwright's Chromium (already a dependency for JS-rendered pages) instead of
WeasyPrint, which needs GTK/Pango/cairo native libraries that are painful on Windows.
"""

import tempfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Report, Signal
from backend.report.assembler import build_signal_cards
from backend.report.charts import render_report_charts

TEMPLATE_DIR = Path(__file__).parent / "templates"

# Autoescape on: headlines and signal text come from an LLM reading scraped third-party pages,
# so they must never be interpreted as HTML. (The diff is pre-escaped and marked |safe.)
_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(["html", "jinja"]))


def render_report_html(report: Report, cards, chart_uris: dict[str, str]) -> str:
    return _env.get_template("report.html.jinja").render(
        headline=report.headline,
        executive_summary=report.executive_summary,
        target_company_name=report.target_company.name,
        week_start=report.week_start.isoformat(),
        week_end=report.week_end.isoformat(),
        cards=cards,
        chart_paths=chart_uris,
    )


def render_report_pdf(session: Session, report: Report) -> bytes:
    signals = (
        session.execute(select(Signal).where(Signal.id.in_(report.signal_ids))).scalars().all()
        if report.signal_ids
        else []
    )
    cards = build_signal_cards(list(signals))

    with tempfile.TemporaryDirectory() as tmp:
        work_dir = Path(tmp)
        chart_paths = render_report_charts(report.chart_data, work_dir)
        # Absolute file:// URIs so <img> tags resolve regardless of how the HTML is loaded.
        chart_uris = {key: path.resolve().as_uri() for key, path in chart_paths.items()}

        # Written to disk and loaded via goto() rather than set_content() — Chromium doesn't
        # reliably resolve local file:// <img> sources on a page with no real navigation.
        html_path = work_dir / "report.html"
        html_path.write_text(render_report_html(report, cards, chart_uris), encoding="utf-8")
        pdf_path = work_dir / "report.pdf"

        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                page = browser.new_page()
                page.goto(html_path.resolve().as_uri(), wait_until="networkidle")
                page.pdf(path=str(pdf_path), format="A4", print_background=True)
            finally:
                browser.close()

        return pdf_path.read_bytes()
