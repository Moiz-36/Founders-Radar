"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface DeleteCompanyButtonProps {
  companyId: string;
  companyName: string;
  // Icon-only variant for the dashboard card grid; the company detail page uses the labeled
  // variant and redirects to /dashboard afterward instead of just refreshing in place.
  variant?: "icon" | "labeled";
  redirectTo?: string;
}

export function DeleteCompanyButton({
  companyId,
  companyName,
  variant = "icon",
  redirectTo,
}: DeleteCompanyButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("target_companies").delete().eq("id", companyId);

    if (deleteError) {
      setDeleting(false);
      setConfirming(false);
      setError(deleteError.message);
      return;
    }

    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  if (confirming && variant === "labeled") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-critical-border bg-critical-bg px-3 py-2 dark:border-critical-border-dark dark:bg-critical-bg-dark">
        <span className="text-xs font-medium text-critical dark:text-critical-dark">
          Delete {companyName}? This removes all its competitors, sources, and reports too.
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting}
          className="shrink-0 rounded-md bg-critical px-2.5 py-1 text-xs font-semibold text-white hover:bg-critical/90 disabled:opacity-60 dark:bg-critical-dark dark:text-[#3c1f1d]"
        >
          {deleting ? "Deleting..." : "Confirm delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="shrink-0 text-xs font-medium text-ink-muted hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (confirming) {
    // Compact icon-pair variant, for the tight card-grid context — a checkmark/x rather than
    // a full sentence, so it can never break the card's layout regardless of card width.
    return (
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-critical-border bg-critical-bg p-0.5 dark:border-critical-border-dark dark:bg-critical-bg-dark"
        title={`Delete ${companyName}? This removes all its competitors, sources, and reports too.`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleConfirm();
          }}
          disabled={deleting}
          aria-label={`Confirm delete ${companyName}`}
          className="rounded-md px-1.5 py-1 text-xs font-semibold text-critical hover:bg-critical hover:text-white disabled:opacity-60 dark:text-critical-dark dark:hover:bg-critical-dark dark:hover:text-[#3c1f1d]"
        >
          {deleting ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirming(false);
          }}
          disabled={deleting}
          aria-label="Cancel"
          className="rounded-md px-1.5 py-1 text-xs text-ink-muted hover:bg-hover dark:text-ink-muted-dark dark:hover:bg-hover-dark"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirming(true);
          }}
          aria-label={`Delete ${companyName}`}
          className="rounded-lg p-2 text-ink-muted transition hover:bg-critical-bg hover:text-critical dark:text-ink-muted-dark dark:hover:bg-critical-bg-dark dark:hover:text-critical-dark"
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-critical-border bg-canvas px-4 py-2 text-sm font-medium text-critical transition hover:bg-critical-bg dark:border-critical-border-dark dark:bg-surface-dark dark:text-critical-dark dark:hover:bg-critical-bg-dark"
        >
          <Trash2 size={15} />
          Delete company
        </button>
      )}
      {error && (
        <div className="mt-2 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
          {error}
        </div>
      )}
    </div>
  );
}
