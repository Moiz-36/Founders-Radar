"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RunStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 5_000;
// Matches backend/main.py's RUN_STALE_AFTER: a run "running" for longer than this died.
const RUN_STALE_AFTER_MS = 45 * 60 * 1000;

interface RunNowButtonProps {
  companyId: string;
  initialStatus?: RunStatus | null;
  initialStartedAt?: string | null;
}

function isActiveRun(status: RunStatus | null | undefined, startedAt: string | null | undefined): boolean {
  if (status !== "running" || !startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() < RUN_STALE_AFTER_MS;
}

// A run takes minutes, so starting one returns immediately (202) and this polls
// target_companies.run_status until the backend records the outcome.
export function RunNowButton({ companyId, initialStatus, initialStartedAt }: RunNowButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(isActiveRun(initialStatus, initialStartedAt));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("target_companies")
      .select("run_status, run_started_at")
      .eq("id", companyId)
      .maybeSingle();

    if (data && isActiveRun(data.run_status, data.run_started_at)) {
      timer.current = setTimeout(poll, POLL_INTERVAL_MS);
      return;
    }

    setRunning(false);
    if (data?.run_status === "skipped") {
      setNotice("No changes since the last report, so no new report was made.");
    } else if (data?.run_status === "failed" || data?.run_status === "running") {
      setError("The run failed. Some sources may be broken — check the sources list and try again.");
    }
    router.refresh();
  }, [companyId, router]);

  useEffect(() => {
    if (running) timer.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Only on mount: resumes polling if the page loads mid-run. Later runs start in handleClick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick() {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/run`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setError(body.error ?? "Could not start the run.");
        return;
      }
      // 409 = already running (e.g. another tab) — just follow that run.
      setRunning(true);
      timer.current = setTimeout(poll, POLL_INTERVAL_MS);
    } catch {
      setError("Could not reach the pipeline service.");
    }
  }

  return (
    <div>
      <button
        className="rounded-lg border border-[#dadce0] bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-hover disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
        onClick={handleClick}
        disabled={running}
      >
        {running ? "Generating report..." : "Run report now"}
      </button>
      {running && (
        <div className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">
          This takes a few minutes. You can leave this page — the report will appear here when it&apos;s done.
        </div>
      )}
      {error && (
        <div className="mt-2 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
          {error}
        </div>
      )}
      {notice && <div className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">{notice}</div>}
    </div>
  );
}
