"use client";

import { useState } from "react";
import { WidgetCard } from "@/components/WidgetCard";
import { createClient } from "@/lib/supabase/client";
import { DashboardWidget, SourceType, WidgetDisplay } from "@/lib/types";
import { SOURCE_TYPE_LABELS } from "@/lib/widgetData";

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_LABELS) as SourceType[];

const DISPLAY_LABELS: Record<WidgetDisplay, string> = {
  feed: "Feed (list of recent changes)",
  bar: "Bar chart (totals)",
  line: "Line chart (trend over time)",
};

interface CompanyOption {
  id: string;
  name: string;
}

interface CompetitorOption {
  id: string;
  name: string;
}

interface DashboardBuilderProps {
  ownerId: string;
  companies: CompanyOption[];
  competitorsByCompany: Record<string, CompetitorOption[]>;
  initialWidgets: DashboardWidget[];
}

export function DashboardBuilder({
  ownerId,
  companies,
  competitorsByCompany,
  initialWidgets,
}: DashboardBuilderProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialWidgets);
  const [showForm, setShowForm] = useState(widgets.length === 0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [competitorId, setCompetitorId] = useState<string>("");
  const [sourceType, setSourceType] = useState<string>("");
  const [display, setDisplay] = useState<WidgetDisplay>("feed");
  const [saving, setSaving] = useState(false);

  function widgetTitle(w: DashboardWidget): string {
    if (w.title) return w.title;
    const company = companies.find((c) => c.id === w.target_company_id)?.name ?? "Unknown company";
    const competitor = w.competitor_id
      ? competitorsByCompany[w.target_company_id]?.find((c) => c.id === w.competitor_id)?.name
      : null;
    const type = w.source_type ? SOURCE_TYPE_LABELS[w.source_type] : null;
    return [company, competitor ?? "All competitors", type ?? "All types"].join(" — ");
  }

  async function handleAddWidget(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setError(null);
    setSaving(true);

    const supabase = createClient();
    const nextPosition = widgets.length > 0 ? Math.max(...widgets.map((w) => w.position)) + 1 : 0;
    const { data, error: insertError } = await supabase
      .from("dashboard_widgets")
      .insert({
        owner_id: ownerId,
        target_company_id: companyId,
        competitor_id: competitorId || null,
        source_type: sourceType || null,
        display,
        position: nextPosition,
      })
      .select()
      .single();

    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add widget.");
      return;
    }

    setWidgets((prev) => [...prev, data as DashboardWidget]);
    setCompetitorId("");
    setSourceType("");
    setDisplay("feed");
  }

  async function handleRemove(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("dashboard_widgets").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
  }

  async function persistOrder(ordered: DashboardWidget[]) {
    const supabase = createClient();
    const results = await Promise.all(
      ordered.map((w, i) => supabase.from("dashboard_widgets").update({ position: i }).eq("id", w.id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(failed.error.message);
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    setWidgets((prev) => {
      const fromIndex = prev.findIndex((w) => w.id === draggedId);
      const toIndex = prev.findIndex((w) => w.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const reindexed = next.map((w, i) => ({ ...w, position: i }));
      persistOrder(reindexed);
      return reindexed;
    });
    setDraggedId(null);
  }

  const competitorOptions = competitorsByCompany[companyId] ?? [];

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginBottom: "1.5rem" }}
        onClick={() => setShowForm((v) => !v)}
      >
        {showForm ? "Cancel" : "+ Add widget"}
      </button>

      {showForm && (
        <form
          onSubmit={handleAddWidget}
          className="competitor-group"
          style={{ marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}
        >
          <div style={{ minWidth: "180px" }}>
            <label className="field-label" style={{ marginTop: 0 }}>
              Company
            </label>
            <select
              className="input"
              style={{ marginBottom: 0 }}
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setCompetitorId("");
              }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: "160px" }}>
            <label className="field-label" style={{ marginTop: 0 }}>
              Competitor
            </label>
            <select
              className="input"
              style={{ marginBottom: 0 }}
              value={competitorId}
              onChange={(e) => setCompetitorId(e.target.value)}
            >
              <option value="">All competitors</option>
              {competitorOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: "150px" }}>
            <label className="field-label" style={{ marginTop: 0 }}>
              Signal type
            </label>
            <select
              className="input"
              style={{ marginBottom: 0 }}
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              <option value="">All types</option>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: "220px" }}>
            <label className="field-label" style={{ marginTop: 0 }}>
              Display as
            </label>
            <select
              className="input"
              style={{ marginBottom: 0 }}
              value={display}
              onChange={(e) => setDisplay(e.target.value as WidgetDisplay)}
            >
              {(Object.keys(DISPLAY_LABELS) as WidgetDisplay[]).map((d) => (
                <option key={d} value={d}>
                  {DISPLAY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          <button className="btn" type="submit" disabled={saving || !companyId} style={{ marginBottom: 0 }}>
            {saving ? "Adding..." : "Add widget"}
          </button>
        </form>
      )}

      {widgets.length === 0 ? (
        <div className="empty-state">
          No widgets yet — add one above to start building your dashboard.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1.2rem",
          }}
        >
          {widgets.map((w) => (
            <WidgetCard
              key={w.id}
              widget={w}
              title={widgetTitle(w)}
              onRemove={handleRemove}
              dragHandlers={{
                draggable: true,
                onDragStart: () => setDraggedId(w.id),
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => handleDrop(w.id),
                isDragging: draggedId === w.id,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
