# Report Assembly

## Purpose
Turn a week's scored signals into a finished, designed artifact: a headline + executive summary, sorted signal cards, charts, and a source appendix — rendered to PDF.

## File structure
```
pipeline/report/assembler.py               # SignalCard, build_signal_cards(), generate_headline_and_summary(), build_chart_data(), assemble_report()
pipeline/report/charts.py                  # matplotlib -> PNG (volume-by-competitor bar chart, category-breakdown pie chart)
pipeline/report/pdf_renderer.py            # Jinja2 HTML template -> PDF via Playwright/Chromium
pipeline/report/templates/report.html.jinja # the actual report layout/styling
```

## Build steps
1. `build_signal_cards()` turns `Signal` rows into `SignalCard` dataclasses (joins in competitor name via `source.competitor`), sorted high-priority-first.
2. `generate_headline_and_summary()` sends the week's signals to Grok and expects `{"headline": ..., "executive_summary": ...}` back — same xAI client setup as [04-analyst-validator.md](./04-analyst-validator.md).
3. `build_chart_data()` computes two breakdowns (signal volume per competitor, signal count per category) as plain dicts, stored in `reports.chart_data` (JSONB).
4. `charts.py` renders those two dicts to PNG files via matplotlib (headless `Agg` backend).
5. `pdf_renderer.py` renders `report.html.jinja` with the report data + chart image paths, writes it to a temp `.html` file, opens it in Playwright's Chromium via `page.goto()`, and calls `page.pdf()`.

## Status
**Fully smoke-tested end-to-end** with fake signal data (no DB, no real LLM call) — charts render correctly and the PDF layout (headline, exec summary callout box, priority badges, signal cards, charts, source appendix) all look right. Not yet run with a real `Report`/`Signal` from the database.

## Gotchas
- **Do not use `page.set_content()` for the PDF step** — Chromium doesn't reliably resolve local `file://` `<img>` sources against a page with no real navigation, so charts silently render as broken image icons. Must write the HTML to disk and `page.goto()` it (already implemented this way — see [decisions.md](./decisions.md) for how this was discovered).
- Chart image paths are converted to absolute `file://` URIs (`Path.resolve().as_uri()`) before being handed to the template — relative paths won't resolve reliably either.
- The `@page` CSS rule in the template controls PDF page size/margins; `page.pdf(format="A4", ...)` in the renderer should match it to avoid inconsistent margins.
