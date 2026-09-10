# Built from the REPO ROOT as build context, not from infra/cloud_function/ — e.g.
#   docker build -f infra/cloud_function/Dockerfile -t founders-radar-pipeline .
#   gcloud builds submit --tag <region>-docker.pkg.dev/<project>/<repo>/founders-radar-pipeline .
# The pipeline (backend/) needs to sit alongside this file in the image; a build rooted at
# infra/cloud_function/ can't see backend/ at all. See docs/decisions.md and
# docs/08-infra-scheduling.md for why this is a container on Cloud Run rather than a plain
# `gcloud functions deploy` — GCP's default Cloud Functions Python runtime has no Chromium or
# its system libraries, which both the jobs collector and pdf_renderer.py depend on
# (Playwright, see docs/decisions.md's 2026-09-02 PDF-rendering entry). This base image ships
# Chromium and every system library it needs already installed.
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Installed from two explicit paths, not the old `-r ../../backend/requirements.txt` — that
# relative path only ever resolved when running from inside infra/cloud_function/, which broke
# the moment this became a repo-root build (gcloud/Docker only see files under the build
# context, so a path reaching outside infra/cloud_function/ never uploaded in the first place).
COPY backend/requirements.txt ./backend/requirements.txt
COPY infra/cloud_function/requirements.txt ./infra/cloud_function/requirements.txt
RUN pip install --no-cache-dir \
      -r backend/requirements.txt \
      -r infra/cloud_function/requirements.txt \
    # Re-installs the browser build for the EXACT pinned playwright==1.49.1 (backend/requirements.txt)
    # rather than trusting the base image's own bundled v1.49.0 browsers to be close enough.
    # --with-deps is a no-op for system libraries the base image already has; kept for
    # correctness if the base image tag above is ever bumped without checking.
    && python -m playwright install --with-deps chromium

COPY backend/ ./backend/
COPY infra/cloud_function/main.py ./main.py

ENV PORT=8080
# functions-framework serves run_weekly_pipeline as a standard HTTP endpoint — same entry
# point Cloud Scheduler calls whether this runs as a raw Cloud Function or, as here, a
# container on Cloud Run. See https://github.com/GoogleCloudPlatform/functions-framework-python
# "Build and deploy a container image" for this exact pattern.
CMD exec functions-framework --target=run_weekly_pipeline --port=${PORT}
