import { Badge, PRIORITY_TONE } from "@/components/ui/Badge";
import { SOURCE_TYPE_LABELS, WidgetSignal } from "@/lib/widgetData";

const ROW_LIMIT = 12;

export function DataTable({ signals }: { signals: WidgetSignal[] }) {
  const rows = signals.slice(0, ROW_LIMIT);
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:text-ink-muted-dark">
              Competitor
            </th>
            <th className="border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:text-ink-muted-dark">
              Type
            </th>
            <th className="border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:text-ink-muted-dark">
              Priority
            </th>
            <th className="border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:text-ink-muted-dark">
              What changed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="border-b border-border px-2 py-1.5 whitespace-nowrap text-ink dark:border-border-dark dark:text-ink-dark">
                {s.competitor_name}
              </td>
              <td className="border-b border-border px-2 py-1.5 whitespace-nowrap text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
                {SOURCE_TYPE_LABELS[s.source_type]}
              </td>
              <td className="border-b border-border px-2 py-1.5 dark:border-border-dark">
                <Badge tone={PRIORITY_TONE[s.priority ?? "low"]}>{s.priority ?? "low"}</Badge>
              </td>
              <td className="max-w-[280px] truncate border-b border-border px-2 py-1.5 text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
                {s.what_changed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {signals.length > ROW_LIMIT && (
        <div className="mt-1.5 text-xs text-ink-muted dark:text-ink-muted-dark">
          +{signals.length - ROW_LIMIT} more not shown
        </div>
      )}
    </div>
  );
}
