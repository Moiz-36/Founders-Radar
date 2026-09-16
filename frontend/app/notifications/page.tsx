import { AlertTriangle, Radar, Signal as SignalIcon, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Badge, PRIORITY_TONE } from "@/components/ui/Badge";
import { SourceTypeIcon } from "@/components/ui/SourceTypeIcon";
import { StatTile } from "@/components/ui/StatTile";
import { createClient } from "@/lib/supabase/server";
import { Competitor, Report, Signal, Source, SourceType, TargetCompany } from "@/lib/types";
import { SOURCE_TYPE_LABELS } from "@/lib/widgetData";

const SIGNAL_LIMIT = 60;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: companies } = await supabase
    .from("target_companies")
    .select("*")
    .order("name");
  const companyList = (companies ?? []) as TargetCompany[];
  const companyIds = companyList.map((c) => c.id);
  const companyNameById = Object.fromEntries(companyList.map((c) => [c.id, c.name]));

  let signals: (Signal & { competitor_name: string; company_name: string; source_type: SourceType })[] = [];
  let reportIdBySignalId: Record<string, string> = {};

  if (companyIds.length > 0) {
    const { data: competitors } = await supabase
      .from("competitors")
      .select("*")
      .in("target_company_id", companyIds);
    const competitorList = (competitors ?? []) as Competitor[];
    const competitorMeta = Object.fromEntries(competitorList.map((c) => [c.id, c]));
    const competitorIds = competitorList.map((c) => c.id);

    if (competitorIds.length > 0) {
      const { data: sources } = await supabase
        .from("sources")
        .select("*")
        .in("competitor_id", competitorIds);
      const sourceList = (sources ?? []) as Source[];
      const sourceMeta = Object.fromEntries(sourceList.map((s) => [s.id, s]));
      const sourceIds = sourceList.map((s) => s.id);

      if (sourceIds.length > 0) {
        const { data: signalRows } = await supabase
          .from("signals")
          .select("*")
          .in("source_id", sourceIds)
          .order("created_at", { ascending: false })
          .limit(SIGNAL_LIMIT);

        signals = ((signalRows ?? []) as Signal[]).map((s) => {
          const source = sourceMeta[s.source_id];
          const competitor = source ? competitorMeta[source.competitor_id] : undefined;
          return {
            ...s,
            source_type: source?.source_type ?? "news",
            competitor_name: competitor ? (competitor.is_self ? "Your company" : competitor.name) : "Unknown",
            company_name: competitor ? companyNameById[competitor.target_company_id] ?? "Unknown" : "Unknown",
          };
        });
      }
    }

    const { data: reportRows } = await supabase
      .from("reports")
      .select("id,signal_ids")
      .in("target_company_id", companyIds);
    for (const r of (reportRows ?? []) as Pick<Report, "id" | "signal_ids">[]) {
      for (const sid of r.signal_ids ?? []) reportIdBySignalId[sid] = r.id;
    }
  }

  const last7Days = signals.filter((s) => Date.now() - new Date(s.created_at).getTime() < 7 * 24 * 60 * 60 * 1000);
  const highPriorityCount = signals.filter((s) => s.priority === "high").length;

  return (
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted-dark">
          Every detected signal across your tracked companies, newest first.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <StatTile icon={<SignalIcon size={14} />} label="Last 7 days" value={last7Days.length} tone="brand" />
          <StatTile icon={<TrendingUp size={14} />} label="High priority" value={highPriorityCount} tone="critical" />
          <StatTile icon={<Radar size={14} />} label="Total shown" value={signals.length} tone="secondary" />
        </div>

        <div className="mt-6">
          {!user ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
              Log in to see notifications for your tracked companies.
            </div>
          ) : signals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
              No signals yet — they&apos;ll show up here as soon as a tracked competitor changes.
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((s) => {
                const reportId = reportIdBySignalId[s.id];
                const priority = s.priority ?? "low";
                const body = (
                  <>
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          priority === "high"
                            ? "bg-critical-bg text-critical dark:bg-critical-bg-dark dark:text-critical-dark"
                            : priority === "medium"
                              ? "bg-warning-bg text-warning dark:bg-warning-bg-dark dark:text-warning-dark"
                              : "bg-info-bg text-info dark:bg-info-bg-dark dark:text-info-dark"
                        }`}
                      >
                        {priority === "high" ? (
                          <AlertTriangle size={15} />
                        ) : (
                          <SourceTypeIcon type={s.source_type} size={15} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted dark:text-ink-muted-dark">
                          <span className="font-semibold text-ink dark:text-ink-dark">{s.company_name}</span>
                          <span>·</span>
                          <span>{s.competitor_name}</span>
                          <span>·</span>
                          <span>{SOURCE_TYPE_LABELS[s.source_type]}</span>
                          <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
                          {s.is_baseline && <Badge tone="secondary">baseline</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-ink dark:text-ink-dark">{s.what_changed}</p>
                      </div>
                      <span className="shrink-0 text-xs whitespace-nowrap text-ink-muted dark:text-ink-muted-dark">
                        {relativeTime(s.created_at)}
                      </span>
                    </div>
                  </>
                );

                return reportId ? (
                  <Link
                    key={s.id}
                    href={`/report/${reportId}`}
                    className="block rounded-lg border border-border bg-canvas p-3.5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] transition hover:border-brand dark:border-border-dark dark:bg-surface-dark"
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    key={s.id}
                    className="rounded-lg border border-border bg-canvas p-3.5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark"
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
