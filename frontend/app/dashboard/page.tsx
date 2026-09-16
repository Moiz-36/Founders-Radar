import { Building2, Plus, Radar as RadarIcon, Signal as SignalIcon, Users } from "lucide-react";
import Link from "next/link";
import { CompanyCard, CompanyCardSignal } from "@/components/CompanyCard";
import { Nav } from "@/components/Nav";
import { TrendChart } from "@/components/TrendChart";
import { StatTile } from "@/components/ui/StatTile";
import { createClient } from "@/lib/supabase/server";
import { Competitor, Report, Signal, Source, SourceType, TargetCompany } from "@/lib/types";

function daysBetween(from: string, to: Date): number {
  const ms = to.getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// Total signal count per company per report period, from the chart_data every report already
// stores (Report.chart_data.category_breakdown, backend/report/assembler.py) — no separate
// time-series storage, same approach as the company detail page's per-competitor trend.
function buildActivityTrend(companyList: TargetCompany[], reportsByCompany: Record<string, Report[]>) {
  const dated = companyList.flatMap((c) =>
    (reportsByCompany[c.id] ?? [])
      .filter((r) => r.chart_data)
      .map((r) => ({ week_start: r.week_start, companyName: c.name, chart_data: r.chart_data! }))
  );
  const periodKeys = Array.from(new Set(dated.map((r) => r.week_start))).sort();
  const periods = periodKeys.map((p) => new Date(p).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

  const series = companyList
    .map((c) => {
      const byPeriod: Record<string, number> = {};
      for (const r of dated) {
        if (r.companyName !== c.name) continue;
        const total = Object.values(r.chart_data.category_breakdown).reduce((sum, v) => sum + v, 0);
        byPeriod[r.week_start] = (byPeriod[r.week_start] ?? 0) + total;
      }
      return { label: c.name, values: periodKeys.map((p) => byPeriod[p] ?? 0) };
    })
    .filter((s) => s.values.some((v) => v > 0));

  return { periods, series };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("target_companies")
    .select("*")
    .order("created_at", { ascending: false });

  const companyList = (companies ?? []) as TargetCompany[];
  const companyIds = companyList.map((c) => c.id);

  let competitorsByCompany: Record<string, Competitor[]> = {};
  let sourcesByCompany: Record<string, Source[]> = {};
  let competitorMetaById: Record<string, { name: string; is_self: boolean }> = {};

  if (companyIds.length > 0) {
    const { data: competitors } = await supabase
      .from("competitors")
      .select("*")
      .in("target_company_id", companyIds)
      .order("is_self", { ascending: false })
      .order("name");
    const competitorList = (competitors ?? []) as Competitor[];
    competitorMetaById = Object.fromEntries(competitorList.map((c) => [c.id, { name: c.name, is_self: c.is_self }]));
    competitorsByCompany = competitorList.reduce((acc: Record<string, Competitor[]>, c) => {
      acc[c.target_company_id] = acc[c.target_company_id] ? [...acc[c.target_company_id], c] : [c];
      return acc;
    }, {});

    const competitorIds = competitorList.map((c) => c.id);
    if (competitorIds.length > 0) {
      const { data: sources } = await supabase.from("sources").select("*").in("competitor_id", competitorIds);
      const sourceList = (sources ?? []) as Source[];
      const companyIdByCompetitorId = Object.fromEntries(competitorList.map((c) => [c.id, c.target_company_id]));
      sourcesByCompany = sourceList.reduce((acc: Record<string, Source[]>, s) => {
        const companyId = companyIdByCompetitorId[s.competitor_id];
        if (!companyId) return acc;
        acc[companyId] = acc[companyId] ? [...acc[companyId], s] : [s];
        return acc;
      }, {});
    }
  }

  let reportsByCompany: Record<string, Report[]> = {};
  let totalReports = 0;
  if (companyIds.length > 0) {
    const { data: reports } = await supabase
      .from("reports")
      .select("*")
      .in("target_company_id", companyIds)
      .order("created_at", { ascending: false });

    const reportList = (reports ?? []) as Report[];
    totalReports = reportList.length;
    reportsByCompany = reportList.reduce((acc: Record<string, Report[]>, report) => {
      const key = report.target_company_id;
      acc[key] = acc[key] ? [...acc[key], report] : [report];
      return acc;
    }, {});
  }

  // One signal per company — the highest-priority signal from that company's latest report —
  // to surface on its dashboard card. Batched across all companies in a single query rather
  // than one round trip per company.
  const latestReportByCompany = Object.fromEntries(
    companyList.map((c) => [c.id, reportsByCompany[c.id]?.[0] ?? null])
  );
  const allLatestSignalIds = Array.from(
    new Set(Object.values(latestReportByCompany).flatMap((r) => r?.signal_ids ?? []))
  );

  let signalsById: Record<string, Signal> = {};
  let sourceCompetitorBySourceId: Record<string, string> = {};
  if (allLatestSignalIds.length > 0) {
    const { data: signals } = await supabase.from("signals").select("*").in("id", allLatestSignalIds);
    const signalList = (signals ?? []) as Signal[];
    signalsById = Object.fromEntries(signalList.map((s) => [s.id, s]));

    const sourceIds = Array.from(new Set(signalList.map((s) => s.source_id)));
    if (sourceIds.length > 0) {
      const { data: sourceRows } = await supabase.from("sources").select("id,competitor_id").in("id", sourceIds);
      sourceCompetitorBySourceId = Object.fromEntries(
        (sourceRows ?? []).map((s) => [s.id as string, s.competitor_id as string])
      );
    }
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  function topSignalFor(companyId: string): CompanyCardSignal | null {
    const report = latestReportByCompany[companyId];
    if (!report?.signal_ids) return null;
    const candidates = report.signal_ids.map((id) => signalsById[id]).filter((s): s is Signal => !!s);
    if (candidates.length === 0) return null;
    const best = candidates.sort((a, b) => priorityRank[a.priority ?? "low"] - priorityRank[b.priority ?? "low"])[0];
    const competitorId = sourceCompetitorBySourceId[best.source_id];
    const meta = competitorId ? competitorMetaById[competitorId] : undefined;
    return {
      what_changed: best.what_changed ?? "",
      priority: best.priority,
      is_baseline: best.is_baseline,
      competitor_name: meta ? (meta.is_self ? "Your company" : meta.name) : "Unknown",
    };
  }

  const totalCompetitors = Object.values(competitorsByCompany).reduce((sum, list) => sum + list.length, 0);
  const signalsThisPeriod = Object.values(latestReportByCompany).reduce(
    (sum, r) => sum + (r?.signal_ids?.length ?? 0),
    0
  );
  const activityTrend = buildActivityTrend(companyList, reportsByCompany);

  return (
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">Tracked Companies</h1>
            <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted-dark">
              Automated intelligence tracking your companies&apos; competitors.
            </p>
          </div>
          <Link
            href="/company/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            <Plus size={16} />
            Add company
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={<Building2 size={14} />} label="Companies" value={companyList.length} tone="brand" />
          <StatTile icon={<Users size={14} />} label="Competitors tracked" value={totalCompetitors} tone="secondary" />
          <StatTile icon={<SignalIcon size={14} />} label="Signals this period" value={signalsThisPeriod} tone="warning" />
          <StatTile icon={<RadarIcon size={14} />} label="Reports generated" value={totalReports} tone="positive" />
        </div>

        {activityTrend.periods.length >= 2 && (
          <div className="mt-6 rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
            <TrendChart title="Signal activity across companies" periods={activityTrend.periods} series={activityTrend.series} filled />
          </div>
        )}

        <div className="mt-8">
          {companyList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
              You&apos;re not tracking any companies yet. Add your first one to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {companyList.map((company) => {
                const sources = sourcesByCompany[company.id] ?? [];
                const activeSourceTypes = Array.from(
                  new Set(sources.filter((s) => s.status === "active").map((s) => s.source_type))
                ) as SourceType[];
                const latestReport = latestReportByCompany[company.id];
                const daysSinceLastReport = latestReport
                  ? daysBetween(latestReport.created_at, new Date())
                  : daysBetween(company.created_at, new Date());

                return (
                  <CompanyCard
                    key={company.id}
                    id={company.id}
                    name={company.name}
                    competitors={(competitorsByCompany[company.id] ?? []).map((c) => ({ name: c.name, isSelf: c.is_self }))}
                    activeSourceTypes={activeSourceTypes}
                    topSignal={topSignalFor(company.id)}
                    reportIntervalDays={company.report_interval_days}
                    daysSinceLastReport={daysSinceLastReport}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
