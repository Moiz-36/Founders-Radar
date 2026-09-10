"""Uploads rendered report PDFs to Supabase Storage.

Cloud Run's filesystem is ephemeral and not reachable from outside the container, so a local
path like `report.pdf_url = str(pdf_path)` (the old behavior) is unusable in production — the
file vanishes on the next cold start and nothing outside the container can fetch it anyway.

Uses the service role key (bypasses RLS) since the "reports" bucket is private — these are
per-tenant competitive-intelligence reports, not public documents. A signed URL is generated
so the stored pdf_url is directly fetchable without exposing the bucket.
"""

import os
from pathlib import Path
from uuid import UUID

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()

BUCKET = "reports"
SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30  # 30 days — long enough to outlive a report's usual review window

_HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}


def upload_report_pdf(local_path: Path, report_id: UUID) -> str:
    """Uploads the rendered PDF and returns a signed URL good for SIGNED_URL_EXPIRY_SECONDS."""
    object_path = f"{report_id}/report.pdf"

    with open(local_path, "rb") as f:
        upload_response = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_path}",
            headers={**_HEADERS, "Content-Type": "application/pdf", "x-upsert": "true"},
            data=f,
        )
    upload_response.raise_for_status()

    sign_response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET}/{object_path}",
        headers=_HEADERS,
        json={"expiresIn": SIGNED_URL_EXPIRY_SECONDS},
    )
    sign_response.raise_for_status()

    return f"{SUPABASE_URL}/storage/v1{sign_response.json()['signedURL']}"
