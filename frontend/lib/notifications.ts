import type { createClient } from "@/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

// Same "scope by an explicit ownership chain, don't rely on RLS alone" convention as
// lib/widgetData.ts's fetchWidgetSignals: signals/reports keep a public-read-ish policy for
// shareable report links, so a personal notification count must resolve the caller's own
// source_ids first rather than just filtering signals directly (a bare `signals` query would
// also surface signals from anyone else's publicly-shared reports).
export async function fetchOwnedSourceIds(supabase: SupabaseBrowserClient, ownerId: string): Promise<string[]> {
  const { data: companies } = await supabase.from("target_companies").select("id").eq("owner_id", ownerId);
  const companyIds = (companies ?? []).map((c) => c.id as string);
  if (companyIds.length === 0) return [];

  const { data: competitors } = await supabase.from("competitors").select("id").in("target_company_id", companyIds);
  const competitorIds = (competitors ?? []).map((c) => c.id as string);
  if (competitorIds.length === 0) return [];

  const { data: sources } = await supabase.from("sources").select("id").in("competitor_id", competitorIds);
  return (sources ?? []).map((s) => s.id as string);
}

const RECENT_WINDOW_DAYS = 7;

export async function fetchRecentSignalCount(supabase: SupabaseBrowserClient, ownerId: string): Promise<number> {
  const sourceIds = await fetchOwnedSourceIds(supabase, ownerId);
  if (sourceIds.length === 0) return 0;

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .in("source_id", sourceIds)
    .gte("created_at", since);

  return count ?? 0;
}
