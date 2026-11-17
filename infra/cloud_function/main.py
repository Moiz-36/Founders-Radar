"""Entrypoint for the private, scheduled Cloud Run service (founders-radar-pipeline).

Cloud Scheduler calls this once a day (infra/scheduler_config.yaml). It's served by
functions-framework rather than FastAPI because it was first written as a Cloud Function;
it now runs as a container on Cloud Run (see infra/cloud_function/Dockerfile for why).
"""

import os
import uuid

from backend.main import claim_run, execute_claimed_run, run_pipeline_for_all_active_companies


def run_weekly_pipeline(request) -> tuple[dict, int]:
    """With no target_company_id (env var or JSON body), runs every company that is due —
    the scheduled multi-tenant path. A specific target_company_id runs just that company now
    (a manual trigger that bypasses the due check)."""
    target_company_id = os.environ.get("TARGET_COMPANY_ID")
    if request is not None:
        body = request.get_json(silent=True) or {}
        target_company_id = body.get("target_company_id", target_company_id)

    if target_company_id:
        try:
            company_id = uuid.UUID(str(target_company_id))
        except ValueError:
            return {"error": "target_company_id is not a valid UUID"}, 400
        if not claim_run(company_id):
            return {"error": "company not found or a run is already in progress"}, 409
        result = execute_claimed_run(company_id)
        return result, 500 if result["status"] == "failed" else 200

    return {"results": run_pipeline_for_all_active_companies()}, 200
