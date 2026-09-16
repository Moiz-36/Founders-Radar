import { Badge, PRIORITY_TONE } from "@/components/ui/Badge";
import { WordDiff } from "@/lib/diff";
import { Signal } from "@/lib/types";

// Fixed regardless of theme (dataviz skill: status colors are never themed) — a left accent
// strip, same idea as the priority badge, so the feed reads by color at a glance.
const PRIORITY_BORDER: Record<string, string> = {
  high: "border-l-critical",
  medium: "border-l-warning",
  low: "border-l-info",
};

export function SignalCard({ signal, diff }: { signal: Signal; diff?: WordDiff | null }) {
  const priority = signal.priority ?? "low";

  return (
    <div
      className={`rounded-lg border border-l-4 border-border bg-canvas p-4 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark ${PRIORITY_BORDER[priority]} dark:bg-surface-dark`}
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="font-heading text-sm font-semibold text-ink dark:text-ink-dark">
          {signal.is_baseline ? "What we found" : "What changed"}
        </strong>
        <span className="flex items-center gap-1.5">
          {signal.is_baseline && <Badge tone="secondary">baseline</Badge>}
          <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
        </span>
      </div>
      <div className="mt-1.5 text-sm text-ink dark:text-ink-dark">{signal.what_changed}</div>

      <div className="mt-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        Why it matters
      </div>
      <div className="mt-0.5 text-sm text-ink dark:text-ink-dark">{signal.why_it_matters}</div>

      {signal.suggested_response && (
        <>
          <div className="mt-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
            Suggested response
          </div>
          <div className="mt-0.5 text-sm text-ink dark:text-ink-dark">{signal.suggested_response}</div>
        </>
      )}

      {diff && diff.segments.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
            View raw diff
          </summary>
          <div className="mt-1.5 rounded-lg bg-canvas-dim p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink-muted dark:bg-hover-dark dark:text-ink-muted-dark">
            {diff.segments.map((segment, i) => {
              // Trailing space (not just a gap in JSX) so adjacent segments — rendered as
              // separate sibling elements — don't visually run their words together.
              if (segment.type === "insert") {
                return (
                  <ins
                    key={i}
                    className="rounded-sm bg-positive-bg text-positive no-underline dark:bg-positive-bg-dark dark:text-positive-dark"
                  >
                    {segment.text + " "}
                  </ins>
                );
              }
              if (segment.type === "delete") {
                return (
                  <del
                    key={i}
                    className="rounded-sm bg-critical-bg text-critical dark:bg-critical-bg-dark dark:text-critical-dark"
                  >
                    {segment.text + " "}
                  </del>
                );
              }
              return <span key={i}>{segment.text + " "}</span>;
            })}
            {diff.truncated && (
              <div className="mt-1.5 text-[11px] text-ink-muted dark:text-ink-muted-dark">
                (truncated to the first 4,000 characters per side)
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
