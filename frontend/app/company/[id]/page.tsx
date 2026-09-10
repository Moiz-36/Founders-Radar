import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { RunNowButton } from "@/components/RunNowButton";
import { TrendChart } from "@/components/TrendChart";
import { createClient } from "@/lib/supabase/server";
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

  const allSourceIds = Object.values(sourcesByCompetitor).flat().map((s) => s.id);
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

  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .eq("target_company_id", id)
    .order("created_at", { ascending: false });

  const reportList = (reports ?? []) as Report[];
  const trend = buildCompetitorTrend(reportList);

  return (
    <>
      <Nav />
      <main className="page">
        <h1>{company.name}</h1>
        <p className="page-subtitle">
          Tracking {competitorList.length} competitor{competitorList.length === 1 ? "" : "s"} — a new
          report every {company.report_interval_days} day{company.report_interval_days === 1 ? "" : "s"}
        </p>

        <RunNowButton companyId={company.id} />

        <h3 style={{ fontFamily: "Georgia, serif", marginTop: "2rem" }}>Competitors & sources</h3>
        {competitorList.length === 0 ? (
          <div className="empty-state">No competitors added yet.</div>
        ) : (
          competitorList.map((competitor) => (
            <div className="competitor-group" key={competitor.id}>
              <strong>{competitor.name}</strong>
              {(sourcesByCompetitor[competitor.id] ?? []).map((source) => {
                const snapshot = latestSnapshotBySource[source.id];
                return (
                  <div key={source.id}>
                    <div className="source-row">
                      <span>
                        {source.source_type} — {source.url}
                      </span>
                      <span className={`status-badge status-${source.status}`}>{source.status}</span>
                    </div>
                    {snapshot ? (
                      <details style={{ marginBottom: "0.6rem" }}>
                        <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)" }}>
                          View last captured content (fetched {new Date(snapshot.fetched_at).toLocaleString()})
                        </summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: "0.8rem",
                            background: "#f4f6f9",
                            padding: "0.8rem",
                            borderRadius: "4px",
                            marginTop: "0.4rem",
                          }}
                        >
                          {snapshot.content.slice(0, 3000)}
                          {snapshot.content.length > 3000 ? "…" : ""}
                        </pre>
                      </details>
                    ) : (
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.6rem" }}>
                        Not checked yet
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}

        {trend.periods.length >= 2 && (
          <>
            <h3 style={{ fontFamily: "Georgia, serif", marginTop: "2rem" }}>Signal trend</h3>
            <TrendChart title="Signals by competitor, over time" periods={trend.periods} series={trend.series} />
          </>
        )}

        <h3 style={{ fontFamily: "Georgia, serif", marginTop: "2rem" }}>Reports</h3>
        {reportList.length === 0 ? (
          <div className="empty-state">
            No reports yet — the first one will appear after the next scheduled run.
          </div>
        ) : (
          reportList.map((report) => (
            <Link key={report.id} href={`/report/${report.id}`} className="list-item">
              <div>
                <div className="list-item-title">{report.headline ?? "Report"}</div>
                <div className="list-item-meta">
                  {report.week_start} to {report.week_end}
                </div>
              </div>
            </Link>
          ))
        )}
      </main>
    </>
  );
}
