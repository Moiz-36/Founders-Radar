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
      <button
        className="rounded-lg border border-[#dadce0] bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-hover disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
        onClick={handleClick}
        disabled={running}
      >
        {running ? "Running..." : "Run report now"}
      </button>
      {error && (
        <div className="mt-2 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
          {error}
        </div>
      )}
    </div>
  );
}
