// Shared by every app/api/* route that proxies to the FastAPI pipeline (PIPELINE_API_BASE_URL).
// Adds the shared-secret header the backend's require_shared_secret middleware checks
// (backend/main.py) once PIPELINE_SHARED_SECRET is set — unset (local dev), this is a no-op,
// matching the backend's own no-op-when-unset behavior.
export function pipelineHeaders(extra?: Record<string, string>): Record<string, string> {
  const secret = process.env.PIPELINE_SHARED_SECRET;
  return {
    ...extra,
    ...(secret ? { "x-pipeline-secret": secret } : {}),
  };
}
