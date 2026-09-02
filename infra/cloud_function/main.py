"""GCP Cloud Function entrypoint — triggers the pipeline on a schedule via Cloud Scheduler.

Deploy with the backend/ package included (or installed as a dependency), and
point Cloud Scheduler at this function's HTTP trigger. Kept separate from
backend/main.py's FastAPI app since Cloud Functions and FastAPI have
different entrypoint conventions.
"""

import os

from backend.main import run_pipeline_for_target


def run_weekly_pipeline(request) -> tuple[dict, int]:
    """HTTP-triggered Cloud Function. Expects TARGET_COMPANY_ID env var or a JSON body with target_company_id."""
    target_company_id = os.environ.get("TARGET_COMPANY_ID")

    if request is not None:
        body = request.get_json(silent=True) or {}
        target_company_id = body.get("target_company_id", target_company_id)

    if not target_company_id:
        return {"error": "target_company_id not provided"}, 400

    report = run_pipeline_for_target(target_company_id)
    return {"report_id": str(report.id), "pdf_url": report.pdf_url}, 200
