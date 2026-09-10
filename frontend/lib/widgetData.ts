import type { createClient } from "@/lib/supabase/client";
import { SourceType } from "@/lib/types";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export interface WidgetSignal {
  id: string;
  competitor_name: string;
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
};

// Scopes by source_id allowlist rather than relying on RLS for correctness: the
// signals/reports tables intentionally keep a public-read policy for shareable report
// links (see infra/sql/schema.sql), so a widget must only ever query source_ids it already
// confirmed — via the owner-scoped competitors/sources tables — belong to the current user.
export async function fetchWidgetSignals(
  supabase: SupabaseBrowserClient,
  params: { targetCompanyId: string; competitorId: string | null; sourceType: SourceType | null }
): Promise<WidgetSignal[]> {
  let competitorQuery = supabase
    .from("competitors")
    .select("id,name")
    .eq("target_company_id", params.targetCompanyId);
  if (params.competitorId) competitorQuery = competitorQuery.eq("id", params.competitorId);
  const { data: competitors } = await competitorQuery;
  if (!competitors || competitors.length === 0) return [];

  const competitorIds = competitors.map((c) => c.id);
  const nameById = Object.fromEntries(competitors.map((c) => [c.id, c.name as string]));

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
    return {
      ...s,
      competitor_name: nameById[source.competitor_id] ?? "Unknown",
      source_type: source.source_type,
    } as WidgetSignal;
  });
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

function mondayOf(iso: string): string {
  const d = new Date(iso);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7; // Mon=1 .. Sun=7
  if (day !== 1) utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc.toISOString().slice(0, 10);
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
