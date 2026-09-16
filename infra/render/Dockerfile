# Serves backend/main.py's FastAPI app itself (discover/run/chat) as a persistent web
# service — a different job from infra/cloud_function/Dockerfile, which only wraps the
# scheduled run_weekly_pipeline trigger for GCP and was never a public API. Built from the
# REPO ROOT as build context (same reasoning as infra/cloud_function/Dockerfile — this needs
# backend/ alongside it), e.g.:
#   docker build -f infra/render/Dockerfile -t founders-radar-backend .
# On Render: set the web service's Dockerfile Path to infra/render/Dockerfile and its Docker
# Build Context Directory to the repo root (Render's dashboard/render.yaml both support this).
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    # Matches infra/cloud_function/Dockerfile's reasoning: re-install the browser build for
    # the exact pinned playwright==1.49.1 rather than trusting the base image's bundled one.
    && python -m playwright install --with-deps chromium

COPY backend/ ./backend/

# Render sets $PORT itself (not a fixed 8080 like Cloud Run's default) — the app must bind to
# whatever it provides, not assume a value.
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
