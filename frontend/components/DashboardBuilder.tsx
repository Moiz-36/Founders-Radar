"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { WidgetCard } from "@/components/WidgetCard";
import { createClient } from "@/lib/supabase/client";
import { DashboardWidget, SourceType, WidgetDisplay, WidgetGroupBy } from "@/lib/types";
import { SOURCE_TYPE_LABELS } from "@/lib/widgetData";

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_LABELS) as SourceType[];

const DISPLAY_LABELS: Record<WidgetDisplay, string> = {
  feed: "Feed (list of recent changes)",
  bar: "Bar chart (horizontal totals)",
  column: "Column chart (vertical totals)",
  line: "Line chart (trend over time)",
  area: "Area chart (filled trend)",
  stacked_bar: "Stacked bar (breakdown per group)",
  donut: "Donut chart (share of whole)",
  table: "Table (raw signal list)",
  stat: "Stat tile (single big number)",
  heatmap: "Heatmap (two-dimension grid)",
  sparklines: "Sparklines (small-multiple trends)",
};

const GROUP_BY_LABELS: Record<WidgetGroupBy, string> = {
  competitor: "Competitor",
  source_type: "Signal type",
  priority: "Priority",
  week: "Week",
};

const inputClass =
  "block w-full rounded-lg border border-[#dadce0] bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-canvas-dark dark:text-ink-dark";
const labelClass = "mb-1 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark";

interface CompanyOption {
  id: string;
  name: string;
}

interface CompetitorOption {
  id: string;
  name: string;
  is_self: boolean;
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
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<string[]>([]);
  const [sourceType, setSourceType] = useState<string>("");
  const [display, setDisplay] = useState<WidgetDisplay>("feed");
  const [groupBy, setGroupBy] = useState<WidgetGroupBy | "">("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  function competitorLabel(companyIdForLookup: string, competitorId: string): string {
    const c = competitorsByCompany[companyIdForLookup]?.find((c) => c.id === competitorId);
    if (!c) return "Unknown";
    return c.is_self ? "Your company" : c.name;
  }

  function widgetTitle(w: DashboardWidget): string {
    if (w.title) return w.title;
    const company = companies.find((c) => c.id === w.target_company_id)?.name ?? "Unknown company";
    const ids = w.competitor_ids && w.competitor_ids.length > 0 ? w.competitor_ids : w.competitor_id ? [w.competitor_id] : [];
    const competitorPart =
      ids.length === 0
        ? "All competitors"
        : ids.length <= 3
          ? ids.map((id) => competitorLabel(w.target_company_id, id)).join(", ")
          : `${ids.length} competitors`;
    const type = w.source_type ? SOURCE_TYPE_LABELS[w.source_type] : null;
    return [company, competitorPart, type ?? "All types"].join(" — ");
  }

  function toggleCompetitor(id: string) {
    setSelectedCompetitorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
        competitor_ids: selectedCompetitorIds.length > 0 ? selectedCompetitorIds : null,
        source_type: sourceType || null,
        display,
        group_by: groupBy || null,
        title: title.trim() || null,
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
    setSelectedCompetitorIds([]);
    setSourceType("");
    setDisplay("feed");
    setGroupBy("");
    setTitle("");
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
  const needsGrouping = display !== "feed" && display !== "table";

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
      >
        <Plus size={15} />
        {showForm ? "Cancel" : "Add widget"}
      </button>

      {showForm && (
        <form
          onSubmit={handleAddWidget}
          className="mb-6 space-y-4 rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark"
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[180px]">
              <label className={labelClass}>Company</label>
              <select
                className={inputClass}
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setSelectedCompetitorIds([]);
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className={labelClass}>Signal type</label>
              <select className={inputClass} value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                <option value="">All types</option>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[240px]">
              <label className={labelClass}>Display as</label>
              <select className={inputClass} value={display} onChange={(e) => setDisplay(e.target.value as WidgetDisplay)}>
                {(Object.keys(DISPLAY_LABELS) as WidgetDisplay[]).map((d) => (
                  <option key={d} value={d}>
                    {DISPLAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>

            {needsGrouping && (
              <div className="min-w-[160px]">
                <label className={labelClass}>Break down by</label>
                <select className={inputClass} value={groupBy} onChange={(e) => setGroupBy(e.target.value as WidgetGroupBy | "")}>
                  <option value="">Auto</option>
                  {(Object.keys(GROUP_BY_LABELS) as WidgetGroupBy[]).map((g) => (
                    <option key={g} value={g}>
                      {GROUP_BY_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="min-w-[220px] flex-1">
              <label className={labelClass}>Title (optional)</label>
              <input
                className={inputClass}
                placeholder="e.g. Pricing comparison"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Compare competitors{" "}
              <span className="normal-case text-ink-muted/70 dark:text-ink-muted-dark/70">
                (pick specific ones, or leave empty for all)
              </span>
            </label>
            {competitorOptions.length === 0 ? (
              <div className="text-sm text-ink-muted dark:text-ink-muted-dark">
                This company has no competitors yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {competitorOptions.map((c) => {
                  const isSelected = selectedCompetitorIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCompetitor(c.id)}
                      className={
                        isSelected
                          ? "rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white"
                          : c.is_self
                            ? "rounded-full border border-[#b8e6e8] bg-[#e0f5f6] px-3 py-1 text-xs font-medium text-accent-teal transition hover:brightness-95 dark:border-[#154548] dark:bg-[#0d2a2c] dark:text-[#4dd0d9]"
                            : "rounded-full border border-border bg-canvas px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-hover dark:border-border-dark dark:bg-canvas-dark dark:text-ink-muted-dark dark:hover:bg-hover-dark"
                      }
                    >
                      {c.is_self ? "★ Your company" : c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !companyId}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Adding..." : "Add widget"}
          </button>
        </form>
      )}

      {widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
          No widgets yet — add one above to start building your dashboard.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
