# Report Assembly

## Purpose
Turn a period's new signals into a report — headline, executive summary, sorted signal cards, charts — shown on the web, and downloadable as a PDF on demand.

## File structure
```
backend/report/assembler.py                # SignalCard, build_signal_cards(), generate_headline_and_summary(), build_chart_data(), assemble_report()
backend/report/diff_util.py                # word-level old/new diff as escaped HTML (PDF only; the web report diffs client-side)
backend/report/charts.py                   # matplotlib -> PNG (volume per competitor, category breakdown)
backend/report/pdf_renderer.py             # render_report_pdf(): Jinja2 template -> PDF via Playwright/Chromium
backend/report/templates/report.html.jinja # the PDF layout
```

## How it works
1. After collecting, the pipeline gathers the company's signals not yet in any report. **If there are none, no report is made** (the run is recorded as `skipped`).
2. `assemble_report()` builds the signal cards (high priority first), asks the LLM for a headline + executive summary, computes chart data, and saves the `Report` row.
3. The web report (`frontend/app/report/[id]`) renders straight from the database.
4. The PDF is rendered only when someone clicks **Download PDF**: `frontend/app/api/reports/[id]/pdf` checks the viewer can see the report (RLS), then calls the backend's `GET /reports/{id}/pdf`, which renders charts + template in a temp directory and prints it with Chromium.

## Why on-demand PDF
PDFs used to be rendered and uploaded to Supabase Storage on every run, but nothing in the app linked to them, the signed URL expired after 30 days, and it was the heaviest step of a run. `reports.pdf_url` is now legacy (left NULL). See [decisions.md](./decisions.md), 2026-11-17.

## Gotchas
- **Do not use `page.set_content()` for the PDF** — Chromium doesn't reliably resolve local `file://` `<img>` sources on a page with no real navigation. The HTML is written to disk and opened with `page.goto()`.
- The template is **autoescaped**: headlines and signal text come from an LLM reading scraped third-party pages and must never be interpreted as HTML. Only the pre-escaped diff is marked `|safe`.
- Charts with no data are skipped (matplotlib can't draw an empty pie).
