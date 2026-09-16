export type BadgeTone = "critical" | "warning" | "positive" | "info" | "neutral" | "secondary";

// DESIGN.md's "Badges & Status Chips" spec (bg/text/border per light tone) plus this
// session's dark-mode extension (see globals.css's token comment) and one added "info"/
// "neutral" tone for the cases DESIGN.md's badge section doesn't cover (low priority, plain
// status labels) — built the same way, just without a DESIGN.md-specified light triad to match.
const TONE_CLASSES: Record<BadgeTone, string> = {
  critical:
    "bg-critical-bg text-critical border border-critical-border dark:bg-critical-bg-dark dark:text-critical-dark dark:border-critical-border-dark",
  warning:
    "bg-warning-bg text-warning border border-warning-border dark:bg-warning-bg-dark dark:text-warning-dark dark:border-warning-border-dark",
  positive:
    "bg-positive-bg text-positive border border-positive-border dark:bg-positive-bg-dark dark:text-positive-dark dark:border-positive-border-dark",
  info: "bg-info-bg text-info border border-info-border dark:bg-info-bg-dark dark:text-info-dark dark:border-info-border-dark",
  neutral: "bg-hover text-ink-muted border border-border dark:bg-hover-dark dark:text-ink-muted-dark dark:border-border-dark",
  // DESIGN.md's Secondary role (#007A82 — "strategic signals, cohort clusters") repurposed as
  // a badge tone for markers that aren't a priority level at all (e.g. "baseline finding").
  secondary: "bg-[#e0f5f6] text-accent-teal border border-[#b8e6e8] dark:bg-[#0d2a2c] dark:text-[#4dd0d9] dark:border-[#154548]",
};

// Shared priority/status -> tone mapping so every screen (signal feed, source list, share
// panel) reads the same way: critical = needs attention, warning = worth a look, positive =
// healthy.
export const PRIORITY_TONE: Record<string, BadgeTone> = { high: "critical", medium: "warning", low: "info" };
export const STATUS_TONE: Record<string, BadgeTone> = { active: "positive", broken: "critical", needs_review: "warning" };

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold tracking-wide uppercase ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
