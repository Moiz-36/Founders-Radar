"""Assembles a week's scored signals into a Report record (section 4.5)."""

import json
import os
from dataclasses import dataclass
from datetime import date

from openai import OpenAI
from sqlalchemy.orm import Session

from backend.db.models import Competitor, Report, Signal, Source, TargetCompany

# xAI's API is OpenAI-compatible — see backend/analysis/analyst.py.
MODEL = "grok-4"

_client = OpenAI(api_key=os.environ["XAI_API_KEY"], base_url="https://api.x.ai/v1")

SUMMARY_SYSTEM_PROMPT = """You are a market intelligence analyst writing the \
executive summary for a weekly competitor report. Given a list of this week's \
signals (what changed, why it matters, priority), write a headline (one short \
sentence) and a 3-4 sentence executive summary that a busy founder can read in \
15 seconds. Respond with ONLY a JSON object: {"headline": "...", "executive_summary": "..."}"""


@dataclass
class SignalCard:
    source_type: str
    competitor_name: str
    what_changed: str
    why_it_matters: str
    suggested_response: str | None
    priority: str
    source_url: str


def build_signal_cards(session: Session, signals: list[Signal]) -> list[SignalCard]:
    cards = []
    for signal in signals:
        source: Source = signal.source
        competitor: Competitor = source.competitor
        cards.append(
            SignalCard(
                source_type=source.source_type,
                competitor_name=competitor.name,
                what_changed=signal.what_changed or "",
                why_it_matters=signal.why_it_matters or "",
                suggested_response=signal.suggested_response,
                priority=signal.priority or "low",
                source_url=source.url,
            )
        )
    # Highest priority first for the founder's scan order.
    priority_rank = {"high": 0, "medium": 1, "low": 2}
    cards.sort(key=lambda c: priority_rank.get(c.priority, 3))
    return cards


def generate_headline_and_summary(cards: list[SignalCard]) -> tuple[str, str]:
    signals_block = "\n".join(
        f"- [{c.priority.upper()}] {c.competitor_name} ({c.source_type}): {c.what_changed}"
        for c in cards
    )
    response = _client.chat.completions.create(
        model=MODEL,
        max_tokens=512,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": signals_block or "(no signals this week)"},
        ],
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed["headline"], parsed["executive_summary"]


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
    cards = build_signal_cards(session, signals)
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
    )
    session.add(report)
    session.flush()
    return report
