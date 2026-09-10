"use client";

import { useEffect, useState } from "react";
import { BarChart } from "@/components/BarChart";
import { SignalCard } from "@/components/SignalCard";
import { TrendChart } from "@/components/TrendChart";
import { createClient } from "@/lib/supabase/client";
import { DashboardWidget, Signal } from "@/lib/types";
import { SOURCE_TYPE_LABELS, WidgetSignal, aggregateBy, buildTrend, fetchWidgetSignals } from "@/lib/widgetData";

const FEED_LIMIT = 6;

interface WidgetCardProps {
  widget: DashboardWidget;
  title: string;
  onRemove: (id: string) => void;
  dragHandlers: {
    draggable: boolean;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    isDragging: boolean;
  };
}

export function WidgetCard({ widget, title, onRemove, dragHandlers }: WidgetCardProps) {
  const [signals, setSignals] = useState<WidgetSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSignals(null);
    setError(null);

    const supabase = createClient();
    fetchWidgetSignals(supabase, {
      targetCompanyId: widget.target_company_id,
      competitorId: widget.competitor_id,
      sourceType: widget.source_type,
    })
      .then((rows) => {
        if (!cancelled) setSignals(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this widget's data.");
      });

    return () => {
      cancelled = true;
    };
  }, [widget.target_company_id, widget.competitor_id, widget.source_type]);

  // Comparing across competitors is the default; once a widget is pinned to one
  // competitor, comparing across categories is the more useful axis instead.
  const keyOf = widget.competitor_id
    ? (s: WidgetSignal) => SOURCE_TYPE_LABELS[s.source_type]
    : (s: WidgetSignal) => s.competitor_name;
  const groupingLabel = widget.competitor_id ? "By category" : "By competitor";

  return (
    <div
      className="card"
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      style={{
        marginBottom: 0,
        opacity: dragHandlers.isDragging ? 0.4 : 1,
        display: "flex",
        flexDirection: "column",
        minHeight: widget.display === "feed" ? "auto" : "260px",
      }}
    >
      <div className="card-header" style={{ marginBottom: "0.8rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "grab" }}>
          <span aria-hidden="true" style={{ color: "#c3c2b7", fontSize: "0.9rem" }}>
            ⠿
          </span>
          <strong style={{ fontSize: "0.9rem" }}>{title}</strong>
        </div>
        <button type="button" className="btn-text" onClick={() => onRemove(widget.id)}>
          remove
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!error && signals === null && (
        <div style={{ color: "#5b6472", fontSize: "0.85rem" }}>Loading...</div>
      )}

      {!error && signals !== null && signals.length === 0 && (
        <div className="empty-state" style={{ padding: "1.2rem" }}>
          No signals yet for this selection.
        </div>
      )}

      {!error && signals !== null && signals.length > 0 && widget.display === "feed" && (
        <div style={{ maxHeight: "420px", overflowY: "auto" }}>
          {signals.slice(0, FEED_LIMIT).map((s) => (
            <SignalCard key={s.id} signal={s as unknown as Signal} />
          ))}
        </div>
      )}

      {!error && signals !== null && signals.length > 0 && widget.display === "bar" && (
        <BarChart title={groupingLabel} data={aggregateBy(signals, keyOf)} />
      )}

      {!error && signals !== null && signals.length > 0 && widget.display === "line" && (
        <TrendChartOrEmpty groupingLabel={groupingLabel} signals={signals} keyOf={keyOf} />
      )}
    </div>
  );
}

function TrendChartOrEmpty({
  groupingLabel,
  signals,
  keyOf,
}: {
  groupingLabel: string;
  signals: WidgetSignal[];
  keyOf: (s: WidgetSignal) => string;
}) {
  const { periods, series } = buildTrend(signals, keyOf);
  if (periods.length < 2) {
    return (
      <div className="empty-state" style={{ padding: "1.2rem" }}>
        Not enough history yet for a trend — check back after another signal or two.
      </div>
    );
  }
  return <TrendChart title={`${groupingLabel}, over time`} periods={periods} series={series} />;
}
