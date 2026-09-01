"""Renders the assembled report (HTML/CSS template) to a PDF via WeasyPrint."""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

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
    template = _env.get_template("report.html.jinja")
    html = template.render(
        headline=report.headline,
        executive_summary=report.executive_summary,
        target_company_name=target_company.name,
        week_start=report.week_start.isoformat(),
        week_end=report.week_end.isoformat(),
        cards=cards,
        chart_paths={k: str(v) for k, v in chart_paths.items()},
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf(str(output_path))
    return output_path
