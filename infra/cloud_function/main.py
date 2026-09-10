"""GCP Cloud Function entrypoint — triggers the pipeline on a schedule via Cloud Scheduler.

Deploy with the backend/ package included (or installed as a dependency), and
point Cloud Scheduler at this function's HTTP trigger. Kept separate from
backend/main.py's FastAPI app since Cloud Functions and FastAPI have
different entrypoint conventions.
"""

import os

from backend.main import run_pipeline_for_all_active_companies, run_pipeline_for_target


def run_weekly_pipeline(request) -> tuple[dict, int]:
    """HTTP-triggered Cloud Function.

    With no target_company_id (env var or JSON body), runs every active target company —
    this is the multi-tenant scheduled path. A specific target_company_id still runs just
    that one company, for manual/on-demand triggers.
    """
    target_company_id = os.environ.get("TARGET_COMPANY_ID")

    if request is not None:
        body = request.get_json(silent=True) or {}
        target_company_id = body.get("target_company_id", target_company_id)

    if target_company_id:
        report = run_pipeline_for_target(target_company_id)
        return {"report_id": str(report.id), "pdf_url": report.pdf_url}, 200

    results = run_pipeline_for_all_active_companies()
    return {"results": results}, 200
