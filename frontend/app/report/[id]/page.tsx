import { Radar } from "lucide-react";
import Link from "next/link";
import { BarChart } from "@/components/BarChart";
import { ChatPanel } from "@/components/ChatPanel";
import { ShareReportPanel } from "@/components/ShareReportPanel";
import { SignalCard } from "@/components/SignalCard";
import { diffWords, WordDiff } from "@/lib/diff";
import { createClient } from "@/lib/supabase/server";
import { Report, ReportShare, Signal } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  pricing: "Pricing",
  feature: "Feature",
  job_posting: "Job posting",
  news: "News",
  community: "Community chatter",
  review: "Review site",
  general: "General overview",
};

function toChartRows(counts: Record<string, number>, labelFor: (key: string) => string) {
  return Object.entries(counts)
    .map(([key, value]) => ({ label: labelFor(key), value }))
    .sort((a, b) => b.value - a.value);
}

function ReportHeader() {
  return (
    <Link href="/dashboard" className="mb-8 flex items-center gap-2 text-ink dark:text-ink-dark">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <Radar size={17} />
      </span>
      <span className="font-heading text-[15px] font-bold tracking-tight">Founder&apos;s Radar</span>
    </Link>
  );
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
      <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <ReportHeader />
          <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">
            {user ? "Not shared with you" : "Log in to view this report"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">
            {user
              ? "This report is private and hasn't been shared with your account."
              : "This report may be private. Log in with the email it was shared with, or ask the owner for access."}
          </p>
          {!user && (
            <Link
              href={`/login?next=/report/${id}`}
              className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Log in
            </Link>
          )}
        </main>
      </div>
    );
  }

  const { data: signals } = await supabase
    .from("signals")
    .select("*")
    .in("id", (report as Report).signal_ids ?? []);
  const signalList = (signals ?? []) as Signal[];

  // Raw diff view (docs/10-competitive-feature-research.md quick win #2): fetch the old/new
  // snapshot content for every non-baseline signal in one batched query rather than one round
  // trip per signal, then compute each diff below. RLS on snapshots mirrors signals' own
  // owner/shared read policy (see infra/sql/schema.sql) so this returns nothing extra for a
  // viewer who couldn't already see the signal itself.
  const snapshotIds = Array.from(
    new Set(signalList.flatMap((s) => [s.old_snapshot_id, s.new_snapshot_id]).filter((id): id is string => !!id))
  );
  let contentBySnapshotId: Record<string, string> = {};
  if (snapshotIds.length > 0) {
    const { data: snapshotRows } = await supabase.from("snapshots").select("id,content").in("id", snapshotIds);
    contentBySnapshotId = Object.fromEntries((snapshotRows ?? []).map((s) => [s.id as string, s.content as string]));
  }
  const diffBySignalId: Record<string, WordDiff> = {};
  for (const signal of signalList) {
    const oldContent = signal.old_snapshot_id ? contentBySnapshotId[signal.old_snapshot_id] : undefined;
    const newContent = signal.new_snapshot_id ? contentBySnapshotId[signal.new_snapshot_id] : undefined;
    if (oldContent !== undefined && newContent !== undefined) {
      diffBySignalId[signal.id] = diffWords(oldContent, newContent);
    }
  }

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
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <ReportHeader />

        {isOwner && <ShareReportPanel reportId={report.id} initialVisibility={report.visibility} initialShares={shares} />}

        <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">{report.headline}</h1>
        <div className="mt-1 text-sm text-ink-muted dark:text-ink-muted-dark">
          {report.week_start} to {report.week_end}
        </div>

        <div className="mt-4 rounded-lg border-l-4 border-brand bg-canvas p-4 leading-relaxed text-ink shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:bg-surface-dark dark:text-ink-dark">
          {report.executive_summary}
        </div>

        {report.chart_data && (
          <div className="mt-6 flex flex-wrap gap-6">
            {Object.keys(report.chart_data.category_breakdown).length > 0 && (
              <div className="flex-1 rounded-lg border border-border bg-canvas p-4 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
                <BarChart
                  title="Signals by category"
                  data={toChartRows(report.chart_data.category_breakdown, (k) => CATEGORY_LABELS[k] ?? k)}
                />
              </div>
            )}
            {Object.keys(report.chart_data.volume_by_competitor).length > 0 && (
              <div className="flex-1 rounded-lg border border-border bg-canvas p-4 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
                <BarChart
                  title="Signals by competitor"
                  data={toChartRows(report.chart_data.volume_by_competitor, (k) => k)}
                />
              </div>
            )}
          </div>
        )}

        <h2 className="mt-8 mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
          Intelligence signal feed
        </h2>
        <div className="space-y-3">
          {signalList.map((signal) => (
            <SignalCard key={signal.id} signal={signal} diff={diffBySignalId[signal.id]} />
          ))}
        </div>
      </main>
      <ChatPanel scope="report" id={report.id} />
    </div>
  );
}
