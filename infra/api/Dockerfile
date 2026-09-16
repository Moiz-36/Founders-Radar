# Serves backend/main.py's FastAPI app itself (discover/run/chat) as a persistent web
# service — a different job from infra/cloud_function/Dockerfile, which only wraps the
# scheduled run_weekly_pipeline trigger and was never a public API. Deployed as its own
# Cloud Run service ("founders-radar-api"), separate from and alongside the existing
# scheduled one — see infra/api/cloudbuild.yaml and docs/decisions.md's 2026-09-16 entry.
# (Originally built for a Render deploy that was ultimately dropped in favor of staying on
# GCP — this Dockerfile is host-agnostic, so it carried over unchanged.)
#
# Built from the REPO ROOT as build context (same reasoning as infra/cloud_function/Dockerfile
# — this needs backend/ alongside it):
#   docker build -f infra/api/Dockerfile -t founders-radar-api .
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    # Matches infra/cloud_function/Dockerfile's reasoning: re-install the browser build for
    # the exact pinned playwright==1.49.1 rather than trusting the base image's bundled one.
    && python -m playwright install --with-deps chromium

COPY backend/ ./backend/

# Cloud Run sets $PORT itself (defaults to 8080, but never assume — always bind to what it
# actually provides).
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
