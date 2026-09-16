"""Entrypoint for the Render Cron Job (see render.yaml) — the Render equivalent of
infra/cloud_function/main.py's run_weekly_pipeline, which is GCP/Cloud-Scheduler-specific and
unused here. run_pipeline_for_all_active_companies() already checks each company's own
report_interval_days internally, so this can (and should) be scheduled to run daily
regardless of what interval any individual company is set to."""

from backend.main import logger, run_pipeline_for_all_active_companies

if __name__ == "__main__":
    results = run_pipeline_for_all_active_companies()
    logger.info("Cron run complete: %d companies processed", len(results))
