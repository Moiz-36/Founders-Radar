"use client";

import { useState } from "react";
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
    <div style={{ marginBottom: "1.5rem" }}>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen((v) => !v)}>
        {open ? "Close sharing" : "Share"} —{" "}
        <span className={`status-badge status-${visibility === "public" ? "active" : "needs_review"}`}>
          {visibility}
        </span>
      </button>

      {open && (
        <div className="competitor-group" style={{ marginTop: "0.8rem" }}>
          {error && <div className="form-error">{error}</div>}

          <div className="field-label" style={{ marginTop: 0 }}>
            Who can view this report
          </div>
          <div style={{ display: "flex", gap: "1.2rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === "private"}
                onChange={() => handleVisibilityChange("private")}
              />
              Private — only you, and anyone invited below
            </label>
          </div>
          <div style={{ display: "flex", gap: "1.2rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === "public"}
                onChange={() => handleVisibilityChange("public")}
              />
              Public — anyone with the link, no account needed
            </label>
          </div>

          <div className="field-label">Invite people by email</div>
          <form onSubmit={handleInvite} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.8rem" }}>
            <input
              className="input"
              style={{ flex: 1, marginBottom: 0 }}
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-secondary" type="submit" disabled={saving} style={{ flexShrink: 0 }}>
              {saving ? "Inviting..." : "Invite"}
            </button>
          </form>
          <p style={{ fontSize: "0.78rem", color: "#5b6472", marginTop: 0, marginBottom: "0.8rem" }}>
            They'll need to sign up or log in with this exact email to view it.
          </p>

          {shares.length > 0 && (
            <div>
              {shares.map((s) => (
                <div key={s.id} className="source-row">
                  <span>{s.email}</span>
                  <button type="button" className="btn-text" onClick={() => handleRemove(s.id)}>
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
