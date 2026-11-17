"""Assembles a reporting period's scored signals into a Report record."""

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from backend.db.models import Competitor, Report, Signal, Source, TargetCompany
from backend.llm import complete_json
from backend.report.diff_util import render_diff_html

SUMMARY_SYSTEM_PROMPT = """You are a market intelligence analyst writing the \
executive summary for a periodic competitor report (the reporting period varies \
per company — don't assume it's a week). Given a list of signals from this \
reporting period (what changed, why it matters, priority), write a headline (one \
short sentence) and a 3-4 sentence executive summary that a busy founder can read \
in 15 seconds. Entries marked [BASELINE] are the first-ever check of that source — \
describe those as an initial finding establishing what's currently true, not as a \
"change". Entries marked [CHANGE] are real detected changes since the last check — \
describe those as changes. If every entry is [BASELINE], frame the whole summary as \
an initial competitive snapshot, not a "nothing happened" report.
Respond with ONLY a JSON object: {"headline": "...", "executive_summary": "..."}"""


@dataclass
class SignalCard:
    source_type: str
    competitor_name: str
    what_changed: str
    why_it_matters: str
    suggested_response: str | None
    priority: str
    source_url: str
    is_baseline: bool
    diff_html: str | None
    diff_truncated: bool


def build_signal_cards(signals: list[Signal]) -> list[SignalCard]:
    cards = []
    for signal in signals:
        source: Source = signal.source
        competitor: Competitor = source.competitor

        # Baseline signals have no old_snapshot (nothing to diff against yet); ordinary
        # signals always have both by construction (see backend/main.py), but guard anyway
        # since either FK is nullable at the schema level.
        diff_html: str | None = None
        diff_truncated = False
        if not signal.is_baseline and signal.old_snapshot is not None and signal.new_snapshot is not None:
            diff_html, diff_truncated = render_diff_html(signal.old_snapshot.content, signal.new_snapshot.content)

        cards.append(
            SignalCard(
                source_type=source.source_type,
                competitor_name=competitor.name,
                what_changed=signal.what_changed or "",
                why_it_matters=signal.why_it_matters or "",
                suggested_response=signal.suggested_response,
                priority=signal.priority or "low",
                source_url=source.url,
                is_baseline=signal.is_baseline,
                diff_html=diff_html,
                diff_truncated=diff_truncated,
            )
        )
    # Highest priority first for the founder's scan order.
    priority_rank = {"high": 0, "medium": 1, "low": 2}
    cards.sort(key=lambda c: priority_rank.get(c.priority, 3))
    return cards


def generate_headline_and_summary(cards: list[SignalCard]) -> tuple[str, str]:
    signals_block = "\n".join(
        f"- [{'BASELINE' if c.is_baseline else 'CHANGE'}] [{c.priority.upper()}] "
        f"{c.competitor_name} ({c.source_type}): {c.what_changed}"
        for c in cards
    )
    parsed = complete_json(SUMMARY_SYSTEM_PROMPT, signals_block or "(no signals this period)", max_tokens=1024)
    return str(parsed["headline"]), str(parsed["executive_summary"])


def build_chart_data(cards: list[SignalCard]) -> dict:
    volume_by_competitor: dict[str, int] = {}
    category_breakdown: dict[str, int] = {}

    for card in cards:
        volume_by_competitor[card.competitor_name] = volume_by_competitor.get(card.competitor_name, 0) + 1
        category_breakdown[card.source_type] = category_breakdown.get(card.source_type, 0) + 1

    return {
        "volume_by_competitor": volume_by_competitor,
        "category_breakdown": category_breakdown,
    }


def assemble_report(
    session: Session,
    target_company: TargetCompany,
    week_start: date,
    week_end: date,
    signals: list[Signal],
) -> Report:
    cards = build_signal_cards(signals)
    headline, executive_summary = generate_headline_and_summary(cards)
    chart_data = build_chart_data(cards)

    report = Report(
        target_company_id=target_company.id,
        week_start=week_start,
        week_end=week_end,
        headline=headline,
        executive_summary=executive_summary,
        signal_ids=[s.id for s in signals],
        chart_data=chart_data,
        # Ownerless target companies (the ComplyDo pilot) stay public portfolio demos;
        # every real tenant's report defaults to private (see infra/sql/schema.sql).
        visibility="public" if target_company.owner_id is None else "private",
    )
    session.add(report)
    session.flush()
    return report
