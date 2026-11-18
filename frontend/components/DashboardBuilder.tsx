"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { WidgetCard } from "@/components/WidgetCard";
import { createClient } from "@/lib/supabase/client";
import { DashboardWidget, SourceType, WidgetDisplay, WidgetGroupBy, WidgetSize } from "@/lib/types";
import { SOURCE_TYPE_LABELS } from "@/lib/widgetData";

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_LABELS) as SourceType[];

const DISPLAY_LABELS: Record<WidgetDisplay, string> = {
  price_comparison: "Price comparison (actual plan prices)",
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

// Shown under the "Display as" picker so it's clear what each option actually draws.
const DISPLAY_HELP: Record<WidgetDisplay, string> = {
  price_comparison: "Each competitor's plans and their monthly price, read from their pricing pages.",
  feed: "The latest detected changes as cards: what changed, why it matters, what to do.",
  bar: "How many changes per group, as horizontal bars. Click a bar to see the changes behind it.",
  column: "How many changes per group, as vertical columns. Click a column to see its changes.",
  line: "How many changes per group each week, as lines: is activity rising or falling?",
  area: "Same as the line chart, with the area under each line filled in.",
  stacked_bar: "How many changes per group, each bar split into high / medium / low priority.",
  donut: "Each group's share of all changes. Click a slice to see its changes.",
  table: "Every detected change in a sortable list.",
  stat: "One big number: total changes detected, and how many are high priority.",
  heatmap: "A grid of competitor x kind of change; darker cells mean more changes.",
  sparklines: "A small weekly trend line per group, for comparing many at a glance.",
};

const GROUP_BY_HELP: Record<WidgetGroupBy | "", string> = {
  "": "Signal type if you pick exactly one competitor, otherwise competitor.",
  competitor: "One bar/slice per competitor: who is changing the most?",
  source_type: "One per kind of change (pricing, features, jobs, news, reviews...): what is changing?",
  priority: "High / medium / low: how much the changes matter to you.",
  week: "One per week: when did the changes happen?",
};

// Column span on the grid below (1 column on phones, 2 on tablets, 3 on wide screens).
const SIZE_SPAN: Record<WidgetSize, string> = {
  small: "min-w-0",
  medium: "min-w-0 sm:col-span-2",
  large: "min-w-0 sm:col-span-2 xl:col-span-3",
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
  const isPriceWidget = display === "price_comparison";
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
    if (w.display === "price_comparison") return [company, competitorPart, "Plan prices"].join(" — ");
    const type = w.source_type ? SOURCE_TYPE_LABELS[w.source_type] : null;
    return [company, competitorPart, type ?? "All types"].join(" — ");
  }

  function competitorNames(w: DashboardWidget): string {
    const ids = w.competitor_ids && w.competitor_ids.length > 0 ? w.competitor_ids : w.competitor_id ? [w.competitor_id] : [];
    if (ids.length === 0) return "all competitors";
    const names = ids.map((id) => competitorLabel(w.target_company_id, id));
    return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }

  async function handleResize(id: string, size: WidgetSize) {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, size } : w)));
    const { error: updateError } = await createClient().from("dashboard_widgets").update({ size }).eq("id", id);
    if (updateError) setError(updateError.message);
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
        source_type: isPriceWidget ? "pricing" : sourceType || null,
        display,
        // A price comparison needs room for its plan labels; start it at two columns.
        size: isPriceWidget ? "medium" : "small",
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
  const needsGrouping = !["feed", "table", "stat", "heatmap", "price_comparison"].includes(display);

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

            {!isPriceWidget && (
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
            )}

            <div className="min-w-[240px] max-w-[320px]">
              <label className={labelClass}>Display as</label>
              <select className={inputClass} value={display} onChange={(e) => setDisplay(e.target.value as WidgetDisplay)}>
                {(Object.keys(DISPLAY_LABELS) as WidgetDisplay[]).map((d) => (
                  <option key={d} value={d}>
                    {DISPLAY_LABELS[d]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted-dark">{DISPLAY_HELP[display]}</p>
            </div>

            {needsGrouping && (
              <div className="min-w-[160px] max-w-[260px]">
                <label className={labelClass}>Break down by</label>
                <select className={inputClass} value={groupBy} onChange={(e) => setGroupBy(e.target.value as WidgetGroupBy | "")}>
                  <option value="">Auto</option>
                  {(Object.keys(GROUP_BY_LABELS) as WidgetGroupBy[]).map((g) => (
                    <option key={g} value={g}>
                      {GROUP_BY_LABELS[g]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted-dark">{GROUP_BY_HELP[groupBy]}</p>
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
            <div key={w.id} className={SIZE_SPAN[w.size ?? "medium"]}>
            <WidgetCard
              widget={w}
              title={widgetTitle(w)}
              competitorNames={competitorNames(w)}
              onRemove={handleRemove}
              onResize={handleResize}
              dragHandlers={{
                draggable: true,
                onDragStart: () => setDraggedId(w.id),
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => handleDrop(w.id),
                isDragging: draggedId === w.id,
              }}
            />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
