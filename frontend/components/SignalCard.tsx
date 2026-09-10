import { Signal } from "@/lib/types";

export function SignalCard({ signal }: { signal: Signal }) {
  const priority = signal.priority ?? "low";

  return (
    <div className="card">
      <div className="card-header">
        <strong>{signal.is_baseline ? "What we found" : "What changed"}</strong>
        <span>
          {signal.is_baseline && <span className="baseline-badge">baseline</span>}
          <span className={`priority priority-${priority}`}>{priority}</span>
        </span>
      </div>
      <div>{signal.what_changed}</div>

      <div className="field-label">Why it matters</div>
      <div>{signal.why_it_matters}</div>

      {signal.suggested_response && (
        <>
          <div className="field-label">Suggested response</div>
          <div>{signal.suggested_response}</div>
        </>
      )}
    </div>
  );
}
