"""Founder Q&A chatbot (docs/09-v2-plan.md's chat feature — see docs/decisions.md for the
phased plan). Two scopes share one Groq call (`answer_question`) and message shape:

- Report-scoped (Phase 1): answers using only one report's own signals as context.
- Company-scoped (Phase 2): answers using pgvector semantic search over ALL of a company's
  snapshots (cross-report, cross-competitor) plus a recent-signals list for orientation —
  for questions a single report's fixed signal list can't answer, e.g. "has Drata changed
  pricing this quarter?"

Reuses the same Groq client pattern as backend/analysis/analyst.py (OpenAI SDK pointed at
Groq's OpenAI-compatible endpoint) rather than a second client setup.
"""

import os
from collections.abc import Iterator
from dataclasses import dataclass

from openai import OpenAI

_client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")

MODEL = "openai/gpt-oss-120b"
MAX_CONTENT_CHARS = 800  # per snapshot side — kept tight to control tokens/cost per message
# Hard ceiling on the report-scope signals block (see build_report_system_prompt) — roughly
# ~2,700 tokens at English's ~4.5 chars/token, leaving headroom under Groq's 8,000 TPM cap for
# the rest of the prompt (headline/summary/style text), chat history, and the question itself.
MAX_SIGNALS_BLOCK_CHARS = 12_000
MAX_ANSWER_TOKENS = 400  # answers are meant to be short by default (see STYLE_INSTRUCTIONS)
HISTORY_TURNS_KEPT = 3  # only the last N user+assistant pairs are sent — bounds token growth as a chat gets long

# Applies to both scopes: short, plain-English answers by default. A founder can still ask for
# more ("explain in detail", "walk me through it") and the model will follow that — this just
# sets the *default* so every answer doesn't turn into a long report.
STYLE_INSTRUCTIONS = """Answer style: be brief and direct. Use simple, plain English — short \
sentences, no jargon. Give the short answer first. Only go into detail, background, or \
multi-paragraph explanation if the founder explicitly asks for it (e.g. "explain more", "why", \
"walk me through it")."""

REPORT_SYSTEM_PROMPT_TEMPLATE = """You are a research assistant embedded in a competitive intelligence \
report for a startup founder. Answer the founder's questions using ONLY the report content below \
— do not use outside knowledge about these companies, and do not guess. If the answer isn't \
covered in this report, say so plainly instead of speculating. When a fact comes from a specific \
competitor or source, name it.

{style_instructions}

REPORT: "{headline}" ({week_start} to {week_end})

EXECUTIVE SUMMARY:
{executive_summary}

SIGNALS IN THIS REPORT:
{signals_block}"""

COMPANY_SYSTEM_PROMPT_TEMPLATE = """You are a research assistant helping a startup founder track \
competitors for "{company_name}". Answer using ONLY the information below — do not use outside \
knowledge about these companies, and do not guess. If the answer isn't covered below, say so \
plainly instead of speculating. When a fact comes from a specific competitor or source, name it. \
The information below is not exhaustive — it's the most recent activity plus whatever best \
matches the founder's question, not a complete history.

{style_instructions}

COMPETITORS TRACKED:
{competitors_block}

RECENT SIGNALS (most recent first):
{recent_signals_block}

CONTENT MOST RELEVANT TO THE QUESTION (from semantic search across all tracked sources):
{relevant_snapshots_block}"""


@dataclass
class SignalContext:
    competitor_name: str
    source_type: str
    source_url: str
    priority: str | None
    is_baseline: bool
    what_changed: str | None
    why_it_matters: str | None
    suggested_response: str | None
    old_content: str | None
    new_content: str | None
    created_at: str | None = None  # only set (and only shown) for company-scoped recent signals


@dataclass
class CompetitorSummary:
    name: str
    website: str | None
    is_self: bool


@dataclass
class SnapshotContext:
    competitor_name: str
    source_type: str
    source_url: str
    fetched_at: str
    content: str


@dataclass
class ChatMessage:
    role: str  # "user" | "assistant"
    content: str


def _format_signal(i: int, s: SignalContext) -> str:
    kind = "Baseline finding" if s.is_baseline else "Change"
    header = f"[{i}] {kind} — {s.competitor_name} ({s.source_type}, priority: {s.priority or 'n/a'})"
    if s.created_at:
        header += f" — {s.created_at}"
    lines = [
        header,
        f"Source: {s.source_url}",
        f"What changed: {s.what_changed}",
        f"Why it matters: {s.why_it_matters}",
    ]
    if s.suggested_response:
        lines.append(f"Suggested response: {s.suggested_response}")
    if s.old_content or s.new_content:
        old = (s.old_content or "")[:MAX_CONTENT_CHARS]
        new = (s.new_content or "")[:MAX_CONTENT_CHARS]
        if old:
            lines.append(f"Old content excerpt: {old}")
        if new:
            lines.append(f"New content excerpt: {new}")
    return "\n".join(lines)


def build_report_system_prompt(
    headline: str | None,
    week_start: str,
    week_end: str,
    executive_summary: str | None,
    signals: list[SignalContext],
) -> str:
    signals_block = "\n\n".join(_format_signal(i + 1, s) for i, s in enumerate(signals)) or "(no signals this week)"
    # Bug found in QA (2026-09-15): a report with enough signals — especially ones with long
    # community/news content, which routinely fill the MAX_CONTENT_CHARS budget per side — can
    # push the whole prompt past Groq's 8,000 TPM cap for this model, which fails the request
    # every single time (not transient) with a generic "something went wrong" in the UI and no
    # indication of the real cause. Hard-capping the signals block is a blunter fix than trimming
    # per-signal content or the signal count individually, but it bounds the worst case
    # regardless of how many signals or how verbose any one of them is.
    if len(signals_block) > MAX_SIGNALS_BLOCK_CHARS:
        signals_block = (
            signals_block[:MAX_SIGNALS_BLOCK_CHARS]
            + "\n\n[…older/lower-priority signals truncated to stay within the model's context limit]"
        )
    return REPORT_SYSTEM_PROMPT_TEMPLATE.format(
        style_instructions=STYLE_INSTRUCTIONS,
        headline=headline or "(untitled report)",
        week_start=week_start,
        week_end=week_end,
        executive_summary=executive_summary or "(none)",
        signals_block=signals_block,
    )


def _format_competitor(c: CompetitorSummary) -> str:
    role = "your own company" if c.is_self else "competitor"
    site = f" — {c.website}" if c.website else ""
    return f"- {c.name} ({role}){site}"


def _format_snapshot(i: int, s: SnapshotContext) -> str:
    content = s.content[:MAX_CONTENT_CHARS]
    return (
        f"[{i}] {s.competitor_name} — {s.source_type} — fetched {s.fetched_at}\n"
        f"Source: {s.source_url}\n"
        f"Content: {content}"
    )


def build_company_system_prompt(
    company_name: str,
    competitors: list[CompetitorSummary],
    recent_signals: list[SignalContext],
    relevant_snapshots: list[SnapshotContext],
) -> str:
    competitors_block = "\n".join(_format_competitor(c) for c in competitors) or "(none tracked yet)"
    recent_signals_block = (
        "\n\n".join(_format_signal(i + 1, s) for i, s in enumerate(recent_signals)) or "(no signals yet)"
    )
    relevant_snapshots_block = (
        "\n\n".join(_format_snapshot(i + 1, s) for i, s in enumerate(relevant_snapshots)) or "(none found)"
    )
    return COMPANY_SYSTEM_PROMPT_TEMPLATE.format(
        style_instructions=STYLE_INSTRUCTIONS,
        company_name=company_name,
        competitors_block=competitors_block,
        recent_signals_block=recent_signals_block,
        relevant_snapshots_block=relevant_snapshots_block,
    )


def _trim_history(history: list[ChatMessage]) -> list[ChatMessage]:
    """Keep only the last HISTORY_TURNS_KEPT user+assistant pairs — a long-running chat
    shouldn't keep resending its entire history on every turn."""
    return history[-(HISTORY_TURNS_KEPT * 2) :]


def stream_answer(system_prompt: str, history: list[ChatMessage], question: str) -> Iterator[str]:
    """Yields the answer as it's generated (token deltas) instead of returning it all at once —
    the model can take a few seconds for a full answer, so the founder sees it appear
    incrementally rather than waiting on a blank panel."""
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend({"role": m.role, "content": m.content} for m in _trim_history(history))
    messages.append({"role": "user", "content": question})

    stream = _client.chat.completions.create(
        model=MODEL,
        max_tokens=MAX_ANSWER_TOKENS,
        extra_body={"reasoning_effort": "low"},
        messages=messages,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
