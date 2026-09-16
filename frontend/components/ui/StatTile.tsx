export type StatTileTone = "brand" | "critical" | "warning" | "positive" | "secondary";

const TONE_CHIP: Record<StatTileTone, string> = {
  brand: "bg-info-bg text-brand dark:bg-info-bg-dark dark:text-info-dark",
  critical: "bg-critical-bg text-critical dark:bg-critical-bg-dark dark:text-critical-dark",
  warning: "bg-warning-bg text-warning dark:bg-warning-bg-dark dark:text-warning-dark",
  positive: "bg-positive-bg text-positive dark:bg-positive-bg-dark dark:text-positive-dark",
  secondary: "bg-[#e0f5f6] text-accent-teal dark:bg-[#0d2a2c] dark:text-[#4dd0d9]",
};

export function StatTile({
  icon,
  label,
  value,
  sublabel,
  tone = "brand",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  tone?: StatTileTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-canvas p-4 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-center gap-2">
        {icon && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TONE_CHIP[tone]}`}>
            {icon}
          </span>
        )}
        <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
          {label}
        </div>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-ink dark:text-ink-dark">{value}</div>
      {sublabel && <div className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted-dark">{sublabel}</div>}
    </div>
  );
}
