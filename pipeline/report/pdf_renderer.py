"""Renders the assembled report (HTML/CSS template) to a PDF.

Uses Playwright's Chromium (already a dependency for JS-rendered job pages)
instead of WeasyPrint — WeasyPrint requires the GTK/Pango/cairo native
libraries, which aren't installed by default on Windows and are painful to
set up there. Reusing Playwright avoids that dependency entirely. See
docs/decisions.md.
"""

import tempfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

from pipeline.db.models import Report, TargetCompany
from pipeline.report.assembler import SignalCard

TEMPLATE_DIR = Path(__file__).parent / "templates"

_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))


def render_pdf(
    report: Report,
    target_company: TargetCompany,
    cards: list[SignalCard],
    chart_paths: dict[str, Path],
    output_path: Path,
) -> Path:
    # Absolute file:// URIs so <img> tags resolve regardless of how the HTML is loaded.
    chart_uris = {key: Path(path).resolve().as_uri() for key, path in chart_paths.items()}

    template = _env.get_template("report.html.jinja")
    html = template.render(
        headline=report.headline,
        executive_summary=report.executive_summary,
        target_company_name=target_company.name,
        week_start=report.week_start.isoformat(),
        week_end=report.week_end.isoformat(),
        cards=cards,
        chart_paths=chart_uris,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Written to disk and loaded via goto() rather than set_content() — Chromium
    # doesn't reliably resolve local file:// <img> sources against a page with
    # no real navigation, so set_content() renders charts as broken images.
    with tempfile.NamedTemporaryFile(
        "w", suffix=".html", delete=False, dir=output_path.parent, encoding="utf-8"
    ) as tmp_file:
        tmp_file.write(html)
        tmp_html_path = Path(tmp_file.name)

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.goto(tmp_html_path.resolve().as_uri(), wait_until="networkidle")
            page.pdf(path=str(output_path), format="A4", print_background=True)
            browser.close()
    finally:
        tmp_html_path.unlink(missing_ok=True)

    return output_path
