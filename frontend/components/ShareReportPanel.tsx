"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { ReportShare, ReportVisibility } from "@/lib/types";

interface ShareReportPanelProps {
  reportId: string;
  initialVisibility: ReportVisibility;
  initialShares: ReportShare[];
}

export function ShareReportPanel({ reportId, initialVisibility, initialShares }: ShareReportPanelProps) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [shares, setShares] = useState(initialShares);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleVisibilityChange(next: ReportVisibility) {
    setError(null);
    setVisibility(next);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("reports").update({ visibility: next }).eq("id", reportId);
    if (updateError) {
      setError(updateError.message);
      setVisibility(visibility);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = email.trim().toLowerCase();
    if (!cleaned || !cleaned.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("report_shares")
      .insert({ report_id: reportId, email: cleaned })
      .select()
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "Already invited." : insertError.message);
      return;
    }

    setShares((prev) => [...prev, data as ReportShare]);
    setEmail("");
  }

  async function handleRemove(id: string) {
    setShares((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("report_shares").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-[#dadce0] bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
      >
        {open ? "Close sharing" : "Share"}
        <Badge tone={visibility === "public" ? "positive" : "warning"}>{visibility}</Badge>
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
          {error && (
            <div className="mb-3 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
              {error}
            </div>
          )}

          <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
            Who can view this report
          </div>
          <div className="mb-2 flex gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-ink dark:text-ink-dark">
              <input
                type="radio"
                name="visibility"
                checked={visibility === "private"}
                onChange={() => handleVisibilityChange("private")}
              />
              Private — only you, and anyone invited below
            </label>
          </div>
          <div className="mb-4 flex gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-ink dark:text-ink-dark">
              <input
                type="radio"
                name="visibility"
                checked={visibility === "public"}
                onChange={() => handleVisibilityChange("public")}
              />
              Public — anyone with the link, no account needed
            </label>
          </div>

          <div className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
            Invite people by email
          </div>
          <form onSubmit={handleInvite} className="mb-2 flex gap-2">
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-[#dadce0] bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-canvas-dark dark:text-ink-dark"
            />
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 rounded-lg border border-[#dadce0] bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:bg-hover disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              {saving ? "Inviting..." : "Invite"}
            </button>
          </form>
          <p className="mb-3 text-xs text-ink-muted dark:text-ink-muted-dark">
            They&apos;ll need to sign up or log in with this exact email to view it.
          </p>

          {shares.length > 0 && (
            <div className="divide-y divide-border dark:divide-border-dark">
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink dark:text-ink-dark">{s.email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(s.id)}
                    className="text-xs font-medium text-ink-muted hover:text-critical dark:text-ink-muted-dark dark:hover:text-critical-dark"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
