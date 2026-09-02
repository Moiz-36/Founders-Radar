# Infra & Scheduling

## Purpose
Run the pipeline automatically on a weekly schedule, without relying on Vercel (whose function timeouts make it unsuitable for scraping/heavy compute per `context.md`).

## File structure
```
infra/cloud_function/main.py             # GCP Cloud Function HTTP entrypoint, calls run_pipeline_for_target()
infra/cloud_function/requirements.txt    # functions-framework + backend/requirements.txt
infra/scheduler_config.yaml              # Cloud Scheduler job definition (cron + target)
infra/sql/schema.sql                     # see 01-database.md
```

## Build steps
1. Deploy `infra/cloud_function/` as a GCP Cloud Function (HTTP-triggered), with `backend/` available as a dependency and `GROQ_API_KEY`/`DATABASE_URL` set as function environment variables/secrets.
2. `gcloud scheduler jobs create http founders-radar-weekly --schedule="0 8 * * 1" --uri="<cloud-function-url>" --http-method=POST --message-body='{"target_company_id": "<uuid>"}' --time-zone="America/New_York"` (see the comment block in `scheduler_config.yaml`).
3. Fill in the real Cloud Function URL and target company UUID in `scheduler_config.yaml` once known.

## Status
Scaffolded, not deployed. Lowest priority — only matters once the pipeline reliably produces a good report manually; automating a broken/untuned pipeline just wastes API calls on a schedule.

## Gotchas
- `run_weekly_pipeline()` in `main.py` reads `target_company_id` from either an env var or the request body — supports both a fixed single-tenant deployment and passing it explicitly via Scheduler's `message-body`.
- Playwright/Chromium (used by `JobsCollector` and `pdf_renderer.py`) needs its browser binaries available in the Cloud Function's runtime — GCP Cloud Functions' default Python runtime does **not** include them; this will need a custom container or an explicit `playwright install` step in the build, not yet worked out.
