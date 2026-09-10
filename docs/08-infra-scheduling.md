# Infra & Scheduling

## Purpose
Run the pipeline automatically on a schedule (per-company interval, see `docs/09-v2-plan.md`), without relying on Vercel (whose function timeouts make it unsuitable for scraping/heavy compute per `context.md`).

## File structure
```
infra/cloud_function/main.py             # HTTP entrypoint (functions-framework), calls run_pipeline_for_target() / run_pipeline_for_all_active_companies()
infra/cloud_function/requirements.txt    # functions-framework only — backend/requirements.txt is installed separately, see Dockerfile
infra/cloud_function/Dockerfile          # builds a container with Chromium preinstalled; build context is the REPO ROOT, not this directory
infra/scheduler_config.yaml              # Cloud Scheduler job definition (cron + target + deploy commands in the comment block)
infra/sql/schema.sql                     # see 01-database.md
```

**Deployed to Cloud Run, not a plain `gcloud functions deploy`.** Despite the directory name (kept for historical/import-path reasons — `infra/cloud_function/main.py`'s `run_weekly_pipeline` function still works unchanged as a container entrypoint via `functions-framework`), this ships as a Cloud Run service. Reason: GCP's default Cloud Functions Python runtime has no Chromium or its system libraries, and both `JobsCollector` and `pdf_renderer.py` depend on Playwright (see `docs/decisions.md`'s 2026-09-02 PDF-rendering entry) — Cloud Functions doesn't support custom system packages, but Cloud Run does via a Dockerfile. `infra/cloud_function/Dockerfile` starts from Microsoft's official Playwright Python image (`mcr.microsoft.com/playwright/python`), which has Chromium and its dependencies preinstalled.

A second, unrelated reason the deploy can't be a plain `gcloud functions deploy --source=infra/cloud_function`: `main.py` does `from backend.main import ...`, but Cloud Functions/Cloud Build only ever see the exact `--source` directory — they can't reach `backend/` one level up. The Dockerfile solves this too, by building from the repo root as context so both `backend/` and `infra/cloud_function/` are in scope (see the comment at the top of the Dockerfile).

## Build steps
1. Build and push the image (from the **repo root**, not `infra/cloud_function/` — the Dockerfile needs to see `backend/` too). Use the explicit `infra/cloud_function/cloudbuild.yaml` config, not `gcloud builds submit --tag ... -f <path>` — that flag combination doesn't exist; `--tag` always runs a plain `docker build -t $TAG .` against a Dockerfile at the source root, with no way to point it elsewhere:
   ```
   gcloud builds submit --config=infra/cloud_function/cloudbuild.yaml \
     --substitutions=_IMAGE=<region>-docker.pkg.dev/<project>/<repo>/founders-radar-pipeline .
   ```
2. Deploy to Cloud Run, **not publicly invokable** (`--no-allow-unauthenticated`) — every hit triggers real Groq/Tavily API calls and DB writes, so only Cloud Scheduler's own service account should be able to call it:
   ```
   gcloud run deploy founders-radar-pipeline \
     --image=<region>-docker.pkg.dev/<project>/<repo>/founders-radar-pipeline \
     --region=<region> --no-allow-unauthenticated \
     --set-env-vars=GROQ_API_KEY=<key>,TAVILY_API_KEY=<key>,DATABASE_URL=<url>,SUPABASE_URL=<url>,SUPABASE_SERVICE_ROLE_KEY=<key> \
     --memory=1Gi --timeout=540s
   ```
3. Grant a dedicated service account `roles/run.invoker` on that service, then create the Cloud Scheduler job with OIDC auth pointed at it — full command in the comment block at the top of `infra/scheduler_config.yaml`.
4. Fill in the real Cloud Run service URL and invoker service account email in `scheduler_config.yaml` once known.

## Status
Deployed and verified working (2026-09-09), in the `foundersradar` GCP project — a separate
project/account from this repo's default `gcloud` config (`compliance-scorer`), so don't
expect `gcloud run services list` etc. to show it unless you `gcloud config set project
foundersradar` (or run from Cloud Shell logged into that account) first.

Confirmed end-to-end: Cloud Scheduler job `founders-radar-daily` fires daily at 08:00
America/New_York, OIDC-authenticates as `scheduler-invoker@foundersradar.iam.gserviceaccount.com`
(has `roles/run.invoker` on the service, no `allUsers` binding), hits the Cloud Run service,
which returns HTTP 200.

One real bug found and fixed along the way: the service OOM'd on *every* cold start at the
`--memory=1Gi` this doc originally recommended (Playwright/Chromium + the local embeddings
model together used ~1050 MiB, just over the limit) — every scheduled/manual trigger before
2026-09-09 silently crashed before the pipeline logic ran. Fixed by redeploying with
`--memory=2Gi --cpu=2` (see the updated build steps above and `infra/scheduler_config.yaml`).

A second bug found the same day: `report.pdf_url` was just the local container filesystem
path (`/app/backend/output/<id>/report.pdf`) — meaningless outside the container, and gone on
the next cold start. Fixed in `backend/report/storage.py`: the rendered PDF is now uploaded to
a private Supabase Storage bucket (`reports`, created via `infra/sql/schema.sql`) and `pdf_url`
is a signed URL (30-day expiry) instead. Requires `SUPABASE_SERVICE_ROLE_KEY` as a new env var
on the Cloud Run service (added to the deploy command above) — backend-only, never expose it
to the frontend.

## Gotchas
- `run_weekly_pipeline()` in `main.py` reads `target_company_id` from either an env var or the request body — supports both a manual/on-demand single-company trigger and the default multi-tenant path (`run_pipeline_for_all_active_companies()`, no `target_company_id` given) that the daily Scheduler job actually uses. See the 2026-09-05 entries in `docs/decisions.md`.
- Playwright/Chromium: **resolved** via the Dockerfile's base image, see above. `RUN python -m playwright install --with-deps chromium` in the Dockerfile re-installs the browser build matching the exact `playwright==1.49.1` pin in `backend/requirements.txt`, rather than trusting the base image's own bundled version to be close enough — worth double-checking if that version is ever bumped without updating the base image tag too.
- `functions-framework` works identically whether the target is deployed as a raw Cloud Function or, as here, containerized and run on Cloud Run — same `--target=run_weekly_pipeline` entrypoint either way. This is Google's own documented "build and deploy a container image" pattern for the Functions Framework, not a workaround specific to this project.
