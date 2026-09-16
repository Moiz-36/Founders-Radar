import type { createClient } from "@/lib/supabase/client";
import { SourceType, WidgetGroupBy } from "@/lib/types";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export interface WidgetSignal {
  id: string;
  competitor_name: string;
  competitor_is_self: boolean;
  source_type: SourceType;
  what_changed: string | null;
  why_it_matters: string | null;
  suggested_response: string | null;
  priority: "high" | "medium" | "low" | null;
  is_baseline: boolean;
  created_at: string;
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  pricing: "Pricing",
  feature: "Feature",
  job_posting: "Job posting",
  news: "News",
  community: "Community chatter",
  review: "Review site",
  general: "General overview",
};

export const PRIORITY_ORDER = ["high", "medium", "low"] as const;

// Scopes by source_id allowlist rather than relying on RLS for correctness: the
// signals/reports tables intentionally keep a public-read policy for shareable report
// links (see infra/sql/schema.sql), so a widget must only ever query source_ids it already
// confirmed — via the owner-scoped competitors/sources tables — belong to the current user.
export async function fetchWidgetSignals(
  supabase: SupabaseBrowserClient,
  params: { targetCompanyId: string; competitorIds: string[] | null; sourceType: SourceType | null }
): Promise<WidgetSignal[]> {
  let competitorQuery = supabase
    .from("competitors")
    .select("id,name,is_self")
    .eq("target_company_id", params.targetCompanyId);
  if (params.competitorIds && params.competitorIds.length > 0) {
    competitorQuery = competitorQuery.in("id", params.competitorIds);
  }
  const { data: competitors } = await competitorQuery;
  if (!competitors || competitors.length === 0) return [];

  const competitorIds = competitors.map((c) => c.id);
  const competitorMeta = Object.fromEntries(competitors.map((c) => [c.id, c]));

  let sourceQuery = supabase
    .from("sources")
    .select("id,competitor_id,source_type")
    .in("competitor_id", competitorIds);
  if (params.sourceType) sourceQuery = sourceQuery.eq("source_type", params.sourceType);
  const { data: sources } = await sourceQuery;
  if (!sources || sources.length === 0) return [];

  const sourceIds = sources.map((s) => s.id);
  const sourceMeta = Object.fromEntries(sources.map((s) => [s.id, s]));

  const { data: signals } = await supabase
    .from("signals")
    .select("*")
    .in("source_id", sourceIds)
    .order("created_at", { ascending: false });

  return (signals ?? []).map((s) => {
    const source = sourceMeta[s.source_id];
    const competitor = competitorMeta[source.competitor_id];
    return {
      ...s,
      competitor_name: competitor?.name ?? "Unknown",
      competitor_is_self: competitor?.is_self ?? false,
      source_type: source.source_type,
    } as WidgetSignal;
  });
}

function mondayOf(iso: string): string {
  const d = new Date(iso);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7; // Mon=1 .. Sun=7
  if (day !== 1) utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc.toISOString().slice(0, 10);
}

// Resolves a widget's persisted `group_by` (or, for widgets saved before that column existed,
// the old implicit rule: source_type when scoped to exactly one competitor, competitor
// otherwise — including the new multi-competitor case, since comparing several competitors
// side by side is the whole point of picking more than one) into the actual grouping key
// function every aggregator below takes.
export function keyOfForGroupBy(groupBy: WidgetGroupBy | null, selectedCompetitorCount: number): (s: WidgetSignal) => string {
  const effective = groupBy ?? (selectedCompetitorCount === 1 ? "source_type" : "competitor");
  switch (effective) {
    case "source_type":
      return (s) => SOURCE_TYPE_LABELS[s.source_type];
    case "priority":
      return (s) => s.priority ?? "low";
    case "week":
      return (s) => mondayOf(s.created_at);
    case "competitor":
    default:
      // "Your company" reads clearly in a comparison chart's legend/labels — better than the
      // literal company name repeating the widget's own title.
      return (s) => (s.competitor_is_self ? "Your company" : s.competitor_name);
  }
}

export function aggregateBy(
  signals: WidgetSignal[],
  keyOf: (s: WidgetSignal) => string
): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    const key = keyOf(s);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// Buckets by calendar week (Monday start) rather than report periods, since a widget's
// competitor/type filters cut across reports in ways Report.chart_data doesn't store.
export function buildTrend(
  signals: WidgetSignal[],
  keyOf: (s: WidgetSignal) => string
): { periods: string[]; series: { label: string; values: number[] }[] } {
  if (signals.length === 0) return { periods: [], series: [] };

  const buckets = new Map<string, Map<string, number>>();
  for (const s of signals) {
    const week = mondayOf(s.created_at);
    const key = keyOf(s);
    if (!buckets.has(week)) buckets.set(week, new Map());
    const inner = buckets.get(week)!;
    inner.set(key, (inner.get(key) ?? 0) + 1);
  }

  const weeks = Array.from(buckets.keys()).sort();
  const labels = Array.from(new Set(signals.map(keyOf))).sort();
  const periods = weeks.map((w) => new Date(w).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const series = labels.map((label) => ({
    label,
    values: weeks.map((w) => buckets.get(w)?.get(label) ?? 0),
  }));

  return { periods, series };
}

// Two-dimension breakdown for the "stacked_bar" display — one group per bar (e.g. a
// competitor), one stack segment per sub-key (e.g. priority level) within it.
export function aggregateStacked(
  signals: WidgetSignal[],
  groupKeyOf: (s: WidgetSignal) => string,
  stackKeyOf: (s: WidgetSignal) => string,
  stackOrder?: readonly string[]
): { groups: string[]; stacks: string[]; matrix: Record<string, Record<string, number>> } {
  const matrix: Record<string, Record<string, number>> = {};
  const groupSet = new Set<string>();
  const stackSet = new Set<string>();
  for (const s of signals) {
    const g = groupKeyOf(s);
    const st = stackKeyOf(s);
    groupSet.add(g);
    stackSet.add(st);
    matrix[g] = matrix[g] ?? {};
    matrix[g][st] = (matrix[g][st] ?? 0) + 1;
  }
  const groups = Array.from(groupSet).sort((a, b) => {
    const totalA = Object.values(matrix[a]).reduce((x, y) => x + y, 0);
    const totalB = Object.values(matrix[b]).reduce((x, y) => x + y, 0);
    return totalB - totalA;
  });
  const stacks = stackOrder ? stackOrder.filter((s) => stackSet.has(s)) : Array.from(stackSet).sort();
  return { groups, stacks, matrix };
}

// Two-dimension intensity grid for the "heatmap" display (e.g. competitor x source type).
export function aggregateHeatmap(
  signals: WidgetSignal[],
  rowKeyOf: (s: WidgetSignal) => string,
  colKeyOf: (s: WidgetSignal) => string
): { rows: string[]; cols: string[]; matrix: number[][] } {
  const counts = new Map<string, number>();
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  for (const s of signals) {
    const r = rowKeyOf(s);
    const c = colKeyOf(s);
    rowSet.add(r);
    colSet.add(c);
    const key = `${r}__${c}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = Array.from(rowSet).sort();
  const cols = Array.from(colSet).sort();
  const matrix = rows.map((r) => cols.map((c) => counts.get(`${r}__${c}`) ?? 0));
  return { rows, cols, matrix };
}
