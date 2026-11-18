"use client";

import { GripVertical, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/BarChart";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { DataTable } from "@/components/charts/DataTable";
import { DonutChart } from "@/components/charts/DonutChart";
import { HeatmapGrid } from "@/components/charts/HeatmapGrid";
import { SparklineGrid } from "@/components/charts/SparklineGrid";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { PriceComparison, type PriceCompetitor } from "@/components/PriceComparison";
import { SignalCard } from "@/components/SignalCard";
import { StatTile } from "@/components/ui/StatTile";
import { TrendChart } from "@/components/TrendChart";
import { createClient } from "@/lib/supabase/client";
import { DashboardWidget, Signal, WidgetSize } from "@/lib/types";
import {
  PRIORITY_ORDER,
  SOURCE_TYPE_LABELS,
  WidgetSignal,
  aggregateBy,
  aggregateHeatmap,
  aggregateStacked,
  buildTrend,
  effectiveGroupBy,
  fetchWidgetSignals,
  keyOfForGroupBy,
} from "@/lib/widgetData";

const FEED_LIMIT = 6;
const DRILLDOWN_LIMIT = 8;

const SIZE_LABELS: Record<WidgetSize, string> = { small: "S", medium: "M", large: "L" };
const SIZE_TITLES: Record<WidgetSize, string> = {
  small: "Small — one column",
  medium: "Medium — two columns",
  large: "Large — full width",
};

const GROUPING_PHRASE: Record<string, string> = {
  competitor: "split by competitor",
  source_type: "split by kind of change (pricing, features, jobs…)",
  priority: "split by how much each change matters (high / medium / low priority)",
  week: "split by the week it was detected",
};

const GROUPING_TITLE: Record<string, string> = {
  competitor: "By competitor",
  source_type: "By signal type",
  priority: "By priority",
  week: "By week",
};

interface WidgetCardProps {
  widget: DashboardWidget;
  title: string;
  competitorNames: string;
  onRemove: (id: string) => void;
  onResize: (id: string, size: WidgetSize) => void;
  dragHandlers: {
    draggable: boolean;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    isDragging: boolean;
  };
}

// Plain-language "what is this chart counting", shown under every widget's title — the
// charts count detected changes (signals), which isn't obvious from a bare bar of "1".
function describeWidget(widget: DashboardWidget, competitorNames: string, groupBy: string): string {
  if (widget.display === "price_comparison") {
    return `Actual plan prices from ${competitorNames}'s pricing pages, per month — not counts of changes.`;
  }
  const where = widget.source_type ? ` on ${SOURCE_TYPE_LABELS[widget.source_type].toLowerCase()} sources` : "";
  const subject = `changes we've detected${where} for ${competitorNames}`;
  switch (widget.display) {
    case "feed":
      return `The latest ${subject}, newest first.`;
    case "table":
      return `Every one of the ${subject}, as a table.`;
    case "stat":
      return `How many ${subject} in total, and how many are high priority.`;
    case "heatmap":
      return `How many ${subject}: one row per competitor, one column per kind of change. Darker = more.`;
    case "stacked_bar":
      return `How many ${subject}, ${GROUPING_PHRASE[groupBy]}, with each bar split by priority.`;
    case "line":
    case "area":
    case "sparklines":
      return `How many ${subject} each week, ${GROUPING_PHRASE[groupBy]}.`;
    default:
      return `How many ${subject}, ${GROUPING_PHRASE[groupBy]}. Each change is one signal from your reports — click a bar or slice to see them.`;
  }
}

export function WidgetCard({ widget, title, competitorNames, onRemove, onResize, dragHandlers }: WidgetCardProps) {
  const [signals, setSignals] = useState<WidgetSignal[] | null>(null);
  const [priceCompetitors, setPriceCompetitors] = useState<PriceCompetitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isPrices = widget.display === "price_comparison";

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
    setPriceCompetitors(null);
    setError(null);
    const supabase = createClient();

    if (isPrices) {
      let query = supabase
        .from("competitors")
        .select("id,name,is_self")
        .eq("target_company_id", widget.target_company_id)
        .order("is_self", { ascending: false })
        .order("name");
      if (competitorIds) query = query.in("id", competitorIds);
      query.then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setError("Couldn't load this widget's data.");
        else setPriceCompetitors((data ?? []) as PriceCompetitor[]);
      });
    } else {
      fetchWidgetSignals(supabase, {
        targetCompanyId: widget.target_company_id,
        competitorIds,
        sourceType: widget.source_type,
      })
        .then((rows) => !cancelled && setSignals(rows))
        .catch(() => !cancelled && setError("Couldn't load this widget's data."));
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.target_company_id, widget.competitor_id, widget.competitor_ids, widget.source_type, isPrices]);

  // Escape closes the expanded view.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const groupBy = effectiveGroupBy(widget.group_by, competitorIds?.length ?? 0);
  const keyOf = keyOfForGroupBy(widget.group_by, competitorIds?.length ?? 0);
  const description = describeWidget(widget, competitorNames, groupBy);

  const content = (large: boolean) => (
    <>
      {error && (
        <div className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
          {error}
        </div>
      )}
      {!error && isPrices && priceCompetitors === null && <Loading />}
      {!error && isPrices && priceCompetitors !== null && (
        <PriceComparison competitors={priceCompetitors} compact={!large} />
      )}
      {!error && !isPrices && signals === null && <Loading />}
      {!error && !isPrices && signals !== null && signals.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
          No changes detected yet for this selection.
        </div>
      )}
      {!error && !isPrices && signals !== null && signals.length > 0 && (
        <WidgetBody widget={widget} signals={signals} keyOf={keyOf} groupBy={groupBy} large={large} />
      )}
    </>
  );

  return (
    <>
      <div
        draggable={dragHandlers.draggable}
        onDragStart={dragHandlers.onDragStart}
        onDragOver={dragHandlers.onDragOver}
        onDrop={dragHandlers.onDrop}
        className="flex min-w-0 flex-col rounded-lg border border-border bg-canvas p-4 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark"
        style={{ opacity: dragHandlers.isDragging ? 0.4 : 1, minHeight: widget.display === "feed" ? "auto" : "260px" }}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex min-w-0 cursor-grab items-start gap-1.5" title="Drag to reorder">
            <GripVertical size={15} className="mt-0.5 shrink-0 text-ink-muted/50 dark:text-ink-muted-dark/50" aria-hidden />
            <strong className="font-heading text-sm font-semibold text-ink dark:text-ink-dark">{title}</strong>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <div className="hidden overflow-hidden rounded-md border border-border sm:flex dark:border-border-dark" role="group" aria-label="Widget size">
              {(Object.keys(SIZE_LABELS) as WidgetSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  title={SIZE_TITLES[size]}
                  aria-pressed={widget.size === size}
                  onClick={() => onResize(widget.id, size)}
                  className={`px-1.5 py-0.5 text-[10px] font-semibold ${
                    widget.size === size
                      ? "bg-brand text-white"
                      : "text-ink-muted hover:bg-hover dark:text-ink-muted-dark dark:hover:bg-hover-dark"
                  }`}
                >
                  {SIZE_LABELS[size]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Expand"
              aria-label="Expand widget"
              className="rounded-md p-1 text-ink-muted hover:bg-hover hover:text-ink dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-ink-dark"
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(widget.id)}
              title="Remove widget"
              aria-label="Remove widget"
              className="rounded-md p-1 text-ink-muted hover:bg-hover hover:text-critical dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-critical-dark"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">{description}</p>
        {content(widget.size === "large")}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div
            className="w-full max-w-5xl rounded-xl border border-border bg-canvas p-6 shadow-xl dark:border-border-dark dark:bg-surface-dark"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-ink dark:text-ink-dark">{title}</h2>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="rounded-md p-1 text-ink-muted hover:bg-hover hover:text-ink dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-ink-dark"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-5 text-sm text-ink-muted dark:text-ink-muted-dark">{description}</p>
            {content(true)}
          </div>
        </div>
      )}
    </>
  );
}

function Loading() {
  return <div className="text-sm text-ink-muted dark:text-ink-muted-dark">Loading...</div>;
}

function WidgetBody({
  widget,
  signals,
  keyOf,
  groupBy,
  large,
}: {
  widget: DashboardWidget;
  signals: WidgetSignal[];
  keyOf: (s: WidgetSignal) => string;
  groupBy: string;
  large: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const groupingLabel = GROUPING_TITLE[groupBy];
  const toggle = (label: string) => setSelected((current) => (current === label ? null : label));
  const drilldown = selected ? signals.filter((s) => keyOf(s) === selected) : [];

  const chart = (() => {
    switch (widget.display) {
      case "feed":
        return (
          <div className={`${large ? "" : "max-h-[420px]"} space-y-2 overflow-y-auto`}>
            {signals.slice(0, large ? 50 : FEED_LIMIT).map((s) => (
              <SignalCard key={s.id} signal={s as unknown as Signal} />
            ))}
          </div>
        );
      case "table":
        return <DataTable signals={signals} />;
      case "stat": {
        const highCount = signals.filter((s) => s.priority === "high").length;
        return <StatTile icon={null} label="Changes detected" value={signals.length} sublabel={`${highCount} high priority`} />;
      }
      case "bar":
        return <BarChart title={groupingLabel} data={aggregateBy(signals, keyOf)} onSelect={toggle} selected={selected} />;
      case "column":
        return <ColumnChart title={groupingLabel} data={aggregateBy(signals, keyOf)} onSelect={toggle} selected={selected} />;
      case "donut":
        return <DonutChart title={groupingLabel} data={aggregateBy(signals, keyOf)} onSelect={toggle} selected={selected} />;
      case "line":
      case "area": {
        const { periods, series } = buildTrend(signals, keyOf);
        if (periods.length < 2) return <NotEnoughHistory />;
        return (
          <TrendChart title={`${groupingLabel}, over time`} periods={periods} series={series} filled={widget.display === "area"} />
        );
      }
      case "sparklines": {
        const { periods, series } = buildTrend(signals, keyOf);
        if (periods.length < 2) return <NotEnoughHistory />;
        return <SparklineGrid title={`${groupingLabel}, over time`} periods={periods} series={series} />;
      }
      case "stacked_bar": {
        const { groups, stacks, matrix } = aggregateStacked(signals, keyOf, (s) => s.priority ?? "low", PRIORITY_ORDER);
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
  })();

  return (
    <>
      {chart}
      {selected && (
        <div className="mt-3 border-t border-border pt-3 dark:border-border-dark">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink dark:text-ink-dark">
              {drilldown.length} change{drilldown.length === 1 ? "" : "s"} · {selected}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-medium text-brand hover:text-brand-hover dark:text-[#8ab4f8]"
            >
              Clear
            </button>
          </div>
          <div className={`${large ? "" : "max-h-[320px]"} space-y-2 overflow-y-auto`}>
            {drilldown.slice(0, large ? 50 : DRILLDOWN_LIMIT).map((s) => (
              <SignalCard key={s.id} signal={s as unknown as Signal} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function NotEnoughHistory() {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
      Not enough history yet for a trend — this needs changes from at least two different weeks.
    </div>
  );
}
