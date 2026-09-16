"use client";

import { useEffect, useState } from "react";
import { BarChart } from "@/components/BarChart";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { DataTable } from "@/components/charts/DataTable";
import { DonutChart } from "@/components/charts/DonutChart";
import { HeatmapGrid } from "@/components/charts/HeatmapGrid";
import { SparklineGrid } from "@/components/charts/SparklineGrid";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { SignalCard } from "@/components/SignalCard";
import { StatTile } from "@/components/ui/StatTile";
import { TrendChart } from "@/components/TrendChart";
import { createClient } from "@/lib/supabase/client";
import { DashboardWidget, Signal } from "@/lib/types";
import {
  PRIORITY_ORDER,
  SOURCE_TYPE_LABELS,
  WidgetSignal,
  aggregateBy,
  aggregateHeatmap,
  aggregateStacked,
  buildTrend,
  fetchWidgetSignals,
  keyOfForGroupBy,
} from "@/lib/widgetData";

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

  // New widgets use competitor_ids (an array); older rows saved before that column existed
  // still carry the singular competitor_id — treated as a one-element selection.
  const competitorIds =
    widget.competitor_ids && widget.competitor_ids.length > 0
      ? widget.competitor_ids
      : widget.competitor_id
        ? [widget.competitor_id]
        : null;

  useEffect(() => {
    let cancelled = false;
    setSignals(null);
    setError(null);

    const supabase = createClient();
    fetchWidgetSignals(supabase, {
      targetCompanyId: widget.target_company_id,
      competitorIds,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.target_company_id, widget.competitor_id, widget.competitor_ids, widget.source_type]);

  const keyOf = keyOfForGroupBy(widget.group_by, competitorIds?.length ?? 0);
  const groupingLabel =
    widget.group_by === "priority"
      ? "By priority"
      : widget.group_by === "week"
        ? "By week"
        : widget.group_by === "source_type" || (!widget.group_by && competitorIds?.length === 1)
          ? "By signal type"
          : "By competitor";

  return (
    <div
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      className="flex flex-col rounded-lg border border-border bg-canvas p-4 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark"
      style={{ opacity: dragHandlers.isDragging ? 0.4 : 1, minHeight: widget.display === "feed" ? "auto" : "260px" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex cursor-grab items-center gap-2">
          <span aria-hidden="true" className="text-sm text-ink-muted/50 dark:text-ink-muted-dark/50">
            ⠿
          </span>
          <strong className="font-heading text-sm font-semibold text-ink dark:text-ink-dark">{title}</strong>
        </div>
        <button
          type="button"
          onClick={() => onRemove(widget.id)}
          className="text-xs font-medium text-ink-muted hover:text-critical dark:text-ink-muted-dark dark:hover:text-critical-dark"
        >
          remove
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
          {error}
        </div>
      )}

      {!error && signals === null && <div className="text-sm text-ink-muted dark:text-ink-muted-dark">Loading...</div>}

      {!error && signals !== null && signals.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
          No signals yet for this selection.
        </div>
      )}

      {!error && signals !== null && signals.length > 0 && (
        <WidgetBody widget={widget} signals={signals} keyOf={keyOf} groupingLabel={groupingLabel} />
      )}
    </div>
  );
}

function WidgetBody({
  widget,
  signals,
  keyOf,
  groupingLabel,
}: {
  widget: DashboardWidget;
  signals: WidgetSignal[];
  keyOf: (s: WidgetSignal) => string;
  groupingLabel: string;
}) {
  switch (widget.display) {
    case "feed":
      return (
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {signals.slice(0, FEED_LIMIT).map((s) => (
            <SignalCard key={s.id} signal={s as unknown as Signal} />
          ))}
        </div>
      );

    case "table":
      return <DataTable signals={signals} />;

    case "stat": {
      const highCount = signals.filter((s) => s.priority === "high").length;
      return (
        <StatTile
          icon={null}
          label={groupingLabel === "By competitor" ? "Total signals" : groupingLabel}
          value={signals.length}
          sublabel={`${highCount} high priority`}
        />
      );
    }

    case "bar":
      return <BarChart title={groupingLabel} data={aggregateBy(signals, keyOf)} />;

    case "column":
      return <ColumnChart title={groupingLabel} data={aggregateBy(signals, keyOf)} />;

    case "donut":
      return <DonutChart title={groupingLabel} data={aggregateBy(signals, keyOf)} />;

    case "line":
    case "area": {
      const { periods, series } = buildTrend(signals, keyOf);
      if (periods.length < 2) return <NotEnoughHistory />;
      return (
        <TrendChart
          title={`${groupingLabel}, over time`}
          periods={periods}
          series={series}
          filled={widget.display === "area"}
        />
      );
    }

    case "sparklines": {
      const { periods, series } = buildTrend(signals, keyOf);
      if (periods.length < 2) return <NotEnoughHistory />;
      return <SparklineGrid title={`${groupingLabel}, over time`} periods={periods} series={series} />;
    }

    case "stacked_bar": {
      const { groups, stacks, matrix } = aggregateStacked(
        signals,
        keyOf,
        (s) => s.priority ?? "low",
        PRIORITY_ORDER
      );
      return <StackedBarChart title={`${groupingLabel}, by priority`} groups={groups} stacks={stacks} matrix={matrix} />;
    }

    case "heatmap": {
      const { rows, cols, matrix } = aggregateHeatmap(
        signals,
        (s) => (s.competitor_is_self ? "Your company" : s.competitor_name),
        (s) => SOURCE_TYPE_LABELS[s.source_type]
      );
      return <HeatmapGrid title="Competitor × signal type" rows={rows} cols={cols} matrix={matrix} />;
    }

    default:
      return null;
  }
}

function NotEnoughHistory() {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
      Not enough history yet for a trend — check back after another signal or two.
    </div>
  );
}
