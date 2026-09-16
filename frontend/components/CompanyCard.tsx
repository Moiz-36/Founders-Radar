import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { DeleteCompanyButton } from "@/components/DeleteCompanyButton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, PRIORITY_TONE } from "@/components/ui/Badge";
import { SourceTypeIcon } from "@/components/ui/SourceTypeIcon";
import { SourceType } from "@/lib/types";

export interface CompanyCardSignal {
  what_changed: string;
  priority: "high" | "medium" | "low" | null;
  is_baseline: boolean;
  competitor_name: string;
}

export interface CompanyCardCompetitor {
  name: string;
  isSelf: boolean;
}

export interface CompanyCardProps {
  id: string;
  name: string;
  competitors: CompanyCardCompetitor[];
  activeSourceTypes: SourceType[];
  topSignal: CompanyCardSignal | null;
  reportIntervalDays: number;
  daysSinceLastReport: number | null; // null = no report yet, counting from company creation instead
}

// Alert box reads by color, same as the signal feed's left-accent strip — a critical/high
// finding shouldn't look identical to a low-priority one just because it's "the top signal".
const ALERT_TONE: Record<string, string> = {
  high: "border-critical-border bg-critical-bg dark:border-critical-border-dark dark:bg-critical-bg-dark",
  medium: "border-warning-border bg-warning-bg dark:border-warning-border-dark dark:bg-warning-bg-dark",
  low: "border-info-border bg-info-bg dark:border-info-border-dark dark:bg-info-bg-dark",
};
const ALERT_ICON_TONE: Record<string, string> = {
  high: "text-critical dark:text-critical-dark",
  medium: "text-warning dark:text-warning-dark",
  low: "text-info dark:text-info-dark",
};

export function CompanyCard({
  id,
  name,
  competitors,
  activeSourceTypes,
  topSignal,
  reportIntervalDays,
  daysSinceLastReport,
}: CompanyCardProps) {
  const elapsed = daysSinceLastReport ?? 0;
  const daysRemaining = Math.max(reportIntervalDays - elapsed, 0);
  const progressPct = Math.min(100, Math.round((elapsed / reportIntervalDays) * 100));
  const topPriority = topSignal?.priority ?? "low";

  return (
    <div className="flex flex-col rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} size={40} />
          <div className="min-w-0">
            <div className="truncate font-heading font-semibold text-ink dark:text-ink-dark">{name}</div>
            <div className="text-xs text-ink-muted dark:text-ink-muted-dark">
              {competitors.length} competitor{competitors.length === 1 ? "" : "s"} tracked
            </div>
          </div>
        </div>
        <DeleteCompanyButton companyId={id} companyName={name} variant="icon" />
      </div>

      {competitors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {competitors.slice(0, 6).map((c) => (
            <span
              key={c.name}
              className={
                c.isSelf
                  ? "rounded-full border border-[#b8e6e8] bg-[#e0f5f6] px-2 py-0.5 text-[11px] font-medium text-accent-teal dark:border-[#154548] dark:bg-[#0d2a2c] dark:text-[#4dd0d9]"
                  : "rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-hover-dark dark:text-ink-muted-dark"
              }
            >
              {c.isSelf ? "★ Your company" : c.name}
            </span>
          ))}
          {competitors.length > 6 && (
            <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-hover-dark dark:text-ink-muted-dark">
              +{competitors.length - 6} more
            </span>
          )}
        </div>
      )}

      {topSignal && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 ${ALERT_TONE[topPriority]}`}>
          <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${ALERT_ICON_TONE[topPriority]}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-ink-dark">
              {topSignal.competitor_name}
              <Badge tone={PRIORITY_TONE[topPriority]}>{topPriority}</Badge>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted dark:text-ink-muted-dark">
              {topSignal.what_changed}
            </p>
          </div>
        </div>
      )}

      {activeSourceTypes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activeSourceTypes.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-medium text-brand dark:bg-info-bg-dark dark:text-info-dark"
            >
              <SourceTypeIcon type={t} size={11} />
              {t.replace("_", " ")}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark">
          <span>Next report</span>
          <span>{daysRemaining === 0 ? "due now" : `in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover dark:bg-hover-dark">
          <div
            className={`h-full rounded-full ${progressPct >= 100 ? "bg-critical dark:bg-critical-dark" : progressPct >= 75 ? "bg-warning dark:bg-warning-dark" : "bg-brand"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <Link
        href={`/company/${id}`}
        className="mt-4 flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover"
      >
        View intelligence
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
