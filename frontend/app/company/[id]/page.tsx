import { Layers, ShieldCheck, Signal as SignalIcon, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";
import { DeleteCompanyButton } from "@/components/DeleteCompanyButton";
import { Nav } from "@/components/Nav";
import { RunNowButton } from "@/components/RunNowButton";
import { TrendChart } from "@/components/TrendChart";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, STATUS_TONE } from "@/components/ui/Badge";
import { SourceTypeIcon } from "@/components/ui/SourceTypeIcon";
import { StatTile } from "@/components/ui/StatTile";
import { parseListSnapshot } from "@/lib/parseListSnapshot";
import { createClient } from "@/lib/supabase/server";

// news/community snapshots are a list of items under the hood (see parseListSnapshot) — worth
// reconstructing into a readable list. Other source types are just scraped page text, already
// readable as a paragraph once it's not mistaken for a list, so they keep the plain <pre> view.
const LIST_SOURCE_TYPES = new Set(["news", "community"]);

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}
import { Competitor, Report, Snapshot, Source } from "@/lib/types";

// Builds a chronological (oldest -> newest) per-competitor signal-count series from
// each report's chart_data.volume_by_competitor (Report.chart_data, backend/report/assembler.py)
// — no separate time-series storage needed, since every report already snapshots its own counts.
function buildCompetitorTrend(reports: Report[]) {
  const withData = reports
    .filter((r) => r.chart_data)
    .slice()
    .sort((a, b) => a.week_start.localeCompare(b.week_start));

  const competitorNames = Array.from(
    new Set(withData.flatMap((r) => Object.keys(r.chart_data!.volume_by_competitor)))
  ).sort();

  const periods = withData.map((r) =>
    new Date(r.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  );

  const series = competitorNames.map((name) => ({
    label: name,
    values: withData.map((r) => r.chart_data!.volume_by_competitor[name] ?? 0),
  }));

  return { periods, series };
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase.from("target_companies").select("*").eq("id", id).single();
  if (!company) notFound();

  const { data: competitors } = await supabase
    .from("competitors")
    .select("*")
    .eq("target_company_id", id)
    .order("is_self", { ascending: false })
    .order("name");

  const competitorList = (competitors ?? []) as Competitor[];
  const competitorIds = competitorList.map((c) => c.id);

  let sourcesByCompetitor: Record<string, Source[]> = {};
  if (competitorIds.length > 0) {
    const { data: sources } = await supabase
      .from("sources")
      .select("*")
      .in("competitor_id", competitorIds);

    sourcesByCompetitor = (sources ?? []).reduce((acc: Record<string, Source[]>, source) => {
      acc[source.competitor_id] = acc[source.competitor_id]
        ? [...acc[source.competitor_id], source]
        : [source];
      return acc;
    }, {});
  }

  const allSources = Object.values(sourcesByCompetitor).flat();
  const allSourceIds = allSources.map((s) => s.id);
  const activeSourceCount = allSources.filter((s) => s.status === "active").length;

  let latestSnapshotBySource: Record<string, Snapshot> = {};
  if (allSourceIds.length > 0) {
    // Ordered newest-first so the first snapshot seen per source_id is the latest one.
    const { data: snapshots } = await supabase
      .from("snapshots")
      .select("id,source_id,content,fetched_at")
      .in("source_id", allSourceIds)
      .order("fetched_at", { ascending: false });

    for (const snapshot of (snapshots ?? []) as Snapshot[]) {
      if (!latestSnapshotBySource[snapshot.source_id]) {
        latestSnapshotBySource[snapshot.source_id] = snapshot;
      }
    }
  }

  let totalSignals = 0;
  let highPrioritySignals = 0;
  if (allSourceIds.length > 0) {
    const { count: totalCount } = await supabase
      .from("signals")
      .select("id", { count: "exact", head: true })
      .in("source_id", allSourceIds);
    totalSignals = totalCount ?? 0;

    const { count: highCount } = await supabase
      .from("signals")
      .select("id", { count: "exact", head: true })
      .in("source_id", allSourceIds)
      .eq("priority", "high");
    highPrioritySignals = highCount ?? 0;
  }

  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .eq("target_company_id", id)
    .order("created_at", { ascending: false });

  const reportList = (reports ?? []) as Report[];
  const trend = buildCompetitorTrend(reportList);

  return (
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={company.name} size={48} />
            <div>
              <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">{company.name}</h1>
              <p className="text-sm text-ink-muted dark:text-ink-muted-dark">
                Tracking {competitorList.length} competitor{competitorList.length === 1 ? "" : "s"} — a new report
                every {company.report_interval_days} day{company.report_interval_days === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RunNowButton companyId={company.id} />
            <DeleteCompanyButton
              companyId={company.id}
              companyName={company.name}
              variant="labeled"
              redirectTo="/dashboard"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={<Layers size={14} />} label="Competitors" value={competitorList.length} tone="brand" />
          <StatTile icon={<SignalIcon size={14} />} label="Signals to date" value={totalSignals} tone="secondary" />
          <StatTile icon={<TrendingUp size={14} />} label="High priority" value={highPrioritySignals} tone="critical" />
          <StatTile
            icon={<ShieldCheck size={14} />}
            label="Active sources"
            value={`${activeSourceCount}/${allSources.length}`}
            tone="positive"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {trend.periods.length >= 2 && (
              <div className="mb-8 rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
                <TrendChart title="Signals by competitor, over time" periods={trend.periods} series={trend.series} />
              </div>
            )}

            <h2 className="mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
              Competitors &amp; sources
            </h2>
            {competitorList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
                No competitors added yet.
              </div>
            ) : (
              <div className="space-y-4">
                {competitorList.map((competitor) => (
                  <div
                    key={competitor.id}
                    className="rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={competitor.name} size={30} />
                      <strong className="font-heading text-ink dark:text-ink-dark">{competitor.name}</strong>
                      {competitor.is_self && <Badge tone="secondary">your company</Badge>}
                    </div>
                    <div className="mt-3 divide-y divide-border dark:divide-border-dark">
                      {(sourcesByCompetitor[competitor.id] ?? []).map((source) => {
                        const snapshot = latestSnapshotBySource[source.id];
                        return (
                          <div key={source.id} className="py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink dark:text-ink-dark">
                                <SourceTypeIcon type={source.source_type} className="shrink-0 text-ink-muted dark:text-ink-muted-dark" />
                                <span className="font-medium capitalize">{source.source_type.replace("_", " ")}</span>
                                <span className="truncate text-ink-muted dark:text-ink-muted-dark">— {source.url}</span>
                              </span>
                              <Badge tone={STATUS_TONE[source.status] ?? "neutral"}>{source.status}</Badge>
                            </div>
                            {snapshot ? (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-xs text-ink-muted dark:text-ink-muted-dark">
                                  View last captured content (fetched {new Date(snapshot.fetched_at).toLocaleString()})
                                </summary>
                                {(() => {
                                  const items = LIST_SOURCE_TYPES.has(source.source_type)
                                    ? parseListSnapshot(snapshot.content)
                                    : null;
                                  if (items) {
                                    return (
                                      <ul className="mt-1.5 space-y-2 rounded-lg bg-canvas-dim p-3 dark:bg-hover-dark">
                                        {items.slice(0, 20).map((item, i) => (
                                          <li key={i} className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                                            <span className="text-ink dark:text-ink-dark">{capitalize(item.title)}</span>
                                            {item.url && (
                                              <>
                                                {" — "}
                                                <a
                                                  href={item.url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="text-brand break-all hover:underline"
                                                >
                                                  {item.url}
                                                </a>
                                              </>
                                            )}
                                            <span className="ml-1">
                                              ({item.points} point{item.points === 1 ? "" : "s"}
                                              {item.comments !== null &&
                                                `, ${item.comments} comment${item.comments === 1 ? "" : "s"}`}
                                              )
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    );
                                  }
                                  return (
                                    <pre className="mt-1.5 overflow-x-auto rounded-lg bg-canvas-dim p-3 font-mono text-xs whitespace-pre-wrap break-words text-ink-muted dark:bg-hover-dark dark:text-ink-muted-dark">
                                      {snapshot.content.slice(0, 3000)}
                                      {snapshot.content.length > 3000 ? "…" : ""}
                                    </pre>
                                  );
                                })()}
                              </details>
                            ) : source.status === "broken" ? (
                              // Distinct from "Not checked yet" below: this source *was*
                              // attempted (that's what earned the BROKEN badge above) and
                              // failed before ever capturing a snapshot — saying "not checked
                              // yet" here reads as contradicting the badge right next to it.
                              <div className="mt-1 text-xs text-critical dark:text-critical-dark">
                                Check failed — no content captured
                              </div>
                            ) : (
                              <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted-dark">Not checked yet</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
              Reports
            </h2>
            {reportList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
                No reports yet — the first one will appear after the next scheduled run.
              </div>
            ) : (
              <div className="space-y-2">
                {reportList.map((report) => (
                  <Link
                    key={report.id}
                    href={`/report/${report.id}`}
                    className="block rounded-lg border border-border bg-canvas p-3.5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] transition hover:border-brand dark:border-border-dark dark:bg-surface-dark"
                  >
                    <div className="truncate text-sm font-semibold text-ink dark:text-ink-dark">
                      {report.headline ?? "Report"}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted-dark">
                      {report.week_start} to {report.week_end}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <ChatPanel scope="company" id={company.id} />
    </div>
  );
}
