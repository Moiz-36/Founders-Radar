import Link from "next/link";
import { BarChart } from "@/components/BarChart";
import { ShareReportPanel } from "@/components/ShareReportPanel";
import { SignalCard } from "@/components/SignalCard";
import { createClient } from "@/lib/supabase/server";
import { Report, ReportShare, Signal } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  pricing: "Pricing",
  feature: "Feature",
  job_posting: "Job posting",
  news: "News",
  community: "Community chatter",
};

function toChartRows(counts: Record<string, number>, labelFor: (key: string) => string) {
  return Object.entries(counts)
    .map(([key, value]) => ({ label: labelFor(key), value }))
    .sort((a, b) => b.value - a.value);
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Cookie-aware server client (not the plain anon lib/supabase.ts client): the owner/shared
  // RLS policies on reports/signals need the viewer's session to resolve auth.uid()/auth.jwt(),
  // or a private/shared report would look identical to a nonexistent one to its own owner.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: report } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();

  if (!report) {
    return (
      <main className="report">
        <h1 className="headline">
          {user ? "Not shared with you" : "Log in to view this report"}
        </h1>
        <p className="subtitle" style={{ marginBottom: 0 }}>
          {user
            ? "This report is private and hasn't been shared with your account."
            : "This report may be private. Log in with the email it was shared with, or ask the owner for access."}
        </p>
        {!user && (
          <Link href={`/login?next=/report/${id}`} className="btn" style={{ marginTop: "1.5rem", display: "inline-block" }}>
            Log in
          </Link>
        )}
      </main>
    );
  }

  const { data: signals } = await supabase
    .from("signals")
    .select("*")
    .in("id", (report as Report).signal_ids ?? []);

  // Succeeds (returns a row) only for the report's actual owner — RLS on target_companies
  // filters to rows owner_id = auth.uid(), so this doubles as an ownership check without a
  // separate "am I the owner" query the owner-only policies could disagree with.
  const { data: ownedCompany } = await supabase
    .from("target_companies")
    .select("id")
    .eq("id", (report as Report).target_company_id)
    .maybeSingle();
  const isOwner = !!ownedCompany;

  let shares: ReportShare[] = [];
  if (isOwner) {
    const { data: shareRows } = await supabase
      .from("report_shares")
      .select("*")
      .eq("report_id", id)
      .order("invited_at", { ascending: true });
    shares = (shareRows ?? []) as ReportShare[];
  }

  return (
    <main className="report">
      {isOwner && <ShareReportPanel reportId={report.id} initialVisibility={report.visibility} initialShares={shares} />}

      <h1 className="headline">{report.headline}</h1>
      <div className="subtitle">
        {report.week_start} to {report.week_end}
      </div>

      <div className="summary">{report.executive_summary}</div>

      {report.chart_data && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem", marginBottom: "0.5rem" }}>
          {Object.keys(report.chart_data.category_breakdown).length > 0 && (
            <BarChart
              title="Signals by category"
              data={toChartRows(report.chart_data.category_breakdown, (k) => CATEGORY_LABELS[k] ?? k)}
            />
          )}
          {Object.keys(report.chart_data.volume_by_competitor).length > 0 && (
            <BarChart
              title="Signals by competitor"
              data={toChartRows(report.chart_data.volume_by_competitor, (k) => k)}
            />
          )}
        </div>
      )}

      {((signals ?? []) as Signal[]).map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}
    </main>
  );
}
