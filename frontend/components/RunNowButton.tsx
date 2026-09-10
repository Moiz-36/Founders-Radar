"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunNowButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/run`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Run failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the pipeline service.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button className="btn btn-secondary" onClick={handleClick} disabled={running}>
        {running ? "Running..." : "Run report now"}
      </button>
      {error && <div className="form-error" style={{ marginTop: "0.6rem" }}>{error}</div>}
    </div>
  );
}
