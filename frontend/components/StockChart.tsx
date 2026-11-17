"use client";

import { useMemo, useRef, useState } from "react";
import type { StockSeries } from "@/lib/types";
import { SERIES_COLORS, SERIES_VARS_CLASS } from "./TrendChart";

// Compares competitors' share prices. Prices sit on very different scales ($8 vs $500), and
// some trade in other currencies, so every line is indexed to 100 at the start of the chosen
// range: one shared axis that reads as "% change since then" (never a dual axis). The
// tooltip and table still show the real price in its own currency.

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const CHART_WIDTH = 640;
const CHART_HEIGHT = 260;
const MARGIN = { top: 12, right: 64, bottom: 28, left: 40 };
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
const MAX_SERIES = SERIES_COLORS.length;
const MAX_DIRECT_LABELS = 4;
const X_LABELS = 5;

interface PreparedSeries {
  label: string;
  ticker: string;
  currency: string | null;
  color: string;
  prices: (number | null)[]; // forward-filled close per date, null before the series starts
  indexed: (number | null)[];
}

function formatPrice(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD" }).format(value);
  } catch {
    return value.toFixed(2); // unknown currency code
  }
}

function formatChange(indexed: number): string {
  const pct = indexed - 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = Math.max(max - min, 1);
  const rough = span / (count - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function StockChart({ series: rawSeries }: { series: StockSeries[] }) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Color follows the entity (input order is stable: own company first, then by name), so
  // changing the range never repaints a line. More than 8 tickers would need an "Other"
  // fold, which is meaningless for prices — extra tickers are listed as not shown instead.
  const visibleSeries = rawSeries.slice(0, MAX_SERIES);
  const hiddenCount = rawSeries.length - visibleSeries.length;

  const { dates, prepared } = useMemo(() => {
    const latest = visibleSeries.flatMap((s) => s.points.map((p) => p.date)).sort().at(-1);
    if (!latest) return { dates: [] as string[], prepared: [] as PreparedSeries[] };
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = new Date(Date.parse(`${latest}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

    const dateSet = new Set<string>();
    for (const s of visibleSeries) for (const p of s.points) if (p.date >= cutoff) dateSet.add(p.date);
    const allDates = Array.from(dateSet).sort();

    const prepared = visibleSeries.map((s, i) => {
      const byDate = new Map(s.points.map((p) => [p.date, p.close]));
      // Carry the last close forward over days this exchange was closed but another wasn't.
      let last: number | null = s.points.filter((p) => p.date < cutoff).at(-1)?.close ?? null;
      const prices = allDates.map((d) => {
        if (byDate.has(d)) last = byDate.get(d)!;
        return last;
      });
      const base = prices.find((p) => p !== null) ?? null;
      return {
        label: s.name,
        ticker: s.ticker,
        currency: s.currency,
        color: SERIES_COLORS[i],
        prices,
        indexed: prices.map((p) => (p === null || base === null ? null : (p / base) * 100)),
      };
    });
    return { dates: allDates, prepared };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSeries, range]);

  if (dates.length < 2) {
    return <p className="text-sm text-ink-muted dark:text-ink-muted-dark">Not enough price history to chart yet.</p>;
  }

  const values = prepared.flatMap((s) => s.indexed.filter((v): v is number => v !== null));
  const ticks = niceTicks(Math.min(100, ...values), Math.max(100, ...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const xAt = (i: number) => MARGIN.left + (i / (dates.length - 1)) * PLOT_WIDTH;
  const yAt = (v: number) => MARGIN.top + PLOT_HEIGHT - ((v - yMin) / (yMax - yMin)) * PLOT_HEIGHT;
  const labelIndexes = Array.from({ length: X_LABELS }, (_, k) => Math.round((k * (dates.length - 1)) / (X_LABELS - 1)));
  const showLegend = prepared.length >= 2;
  const showDirectLabels = prepared.length <= MAX_DIRECT_LABELS;

  function pathFor(indexed: (number | null)[]): string {
    let d = "";
    indexed.forEach((v, i) => {
      if (v === null) return;
      d += `${d && indexed[i - 1] !== null ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
    });
    return d;
  }

  function onPointerMove(event: React.PointerEvent<SVGRectElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
    const i = Math.round(((x - MARGIN.left) / PLOT_WIDTH) * (dates.length - 1));
    setHoverIndex(Math.max(0, Math.min(dates.length - 1, i)));
  }

  // Keyboard access to the same readout: focus the plot, then arrow keys move the crosshair.
  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    setHoverIndex((i) => Math.max(0, Math.min(dates.length - 1, (i ?? dates.length - 1) + step)));
  }

  const tooltipLeftPct = hoverIndex === null ? 0 : (xAt(hoverIndex) / CHART_WIDTH) * 100;

  return (
    <div className={SERIES_VARS_CLASS}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
          Share price, indexed to 100 at the start of the range
        </div>
        <div role="group" aria-label="Time range" className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                range === r.key
                  ? "bg-brand text-white"
                  : "text-ink-muted hover:bg-hover dark:text-ink-muted-dark dark:hover:bg-hover-dark"
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      {showLegend && (
        <div className="mb-2 flex flex-wrap gap-3.5">
          {prepared.map((s) => (
            <div key={s.ticker} className="flex items-center gap-1.5 text-[0.78rem] text-ink-muted dark:text-ink-muted-dark">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: s.color }} />
              {s.label} ({s.ticker})
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          role="img"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setHoverIndex(null)}
          aria-label={`Share price change over ${range}: ${prepared
            .map((s) => {
              const last = s.indexed.at(-1);
              return `${s.label} ${last != null ? formatChange(last) : "no data"}`;
            })
            .join("; ")}`}
          width="100%"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          style={{ overflow: "visible" }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + PLOT_WIDTH}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="var(--chart-grid)"
                strokeWidth={t === 100 ? 1.5 : 1}
              />
              <text x={MARGIN.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--chart-muted)">
                {t}
              </text>
            </g>
          ))}
          {labelIndexes.map((i) => (
            <text key={i} x={xAt(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
              {shortDate(dates[i])}
            </text>
          ))}

          {prepared.map((s) => (
            <path key={s.ticker} d={pathFor(s.indexed)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
          ))}

          {showDirectLabels &&
            prepared.map((s) => {
              const last = s.indexed.at(-1);
              if (last == null) return null;
              return (
                <text
                  key={s.ticker}
                  x={xAt(dates.length - 1) + 6}
                  y={yAt(last)}
                  dominantBaseline="middle"
                  fontSize="11"
                  fontWeight="bold"
                  fill="var(--chart-ink)"
                >
                  {formatChange(last)}
                </text>
              );
            })}

          {hoverIndex !== null && (
            <g pointerEvents="none">
              <line
                x1={xAt(hoverIndex)}
                x2={xAt(hoverIndex)}
                y1={MARGIN.top}
                y2={MARGIN.top + PLOT_HEIGHT}
                stroke="var(--chart-muted)"
                strokeWidth={1}
              />
              {prepared.map((s) => {
                const v = s.indexed[hoverIndex];
                return v == null ? null : (
                  <circle
                    key={s.ticker}
                    cx={xAt(hoverIndex)}
                    cy={yAt(v)}
                    r={4}
                    fill={s.color}
                    className="stroke-canvas dark:stroke-surface-dark"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}

          {/* Hit area for the crosshair — the whole plot, so readers aim at a date, not a line. */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>

        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-border bg-canvas px-3 py-2 text-xs shadow-md dark:border-border-dark dark:bg-surface-dark"
            style={
              tooltipLeftPct > 60
                ? { right: `${100 - tooltipLeftPct + 2}%` }
                : { left: `${tooltipLeftPct + 2}%` }
            }
          >
            <div className="mb-1 text-ink-muted dark:text-ink-muted-dark">{shortDate(dates[hoverIndex])}</div>
            {prepared.map((s) => {
              const price = s.prices[hoverIndex];
              const v = s.indexed[hoverIndex];
              return (
                <div key={s.ticker} className="flex items-center gap-2 py-0.5">
                  <span className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: s.color }} />
                  <strong className="text-ink dark:text-ink-dark">{v == null ? "—" : formatChange(v)}</strong>
                  <span className="text-ink-muted dark:text-ink-muted-dark">
                    {s.ticker}
                    {price != null && ` · ${formatPrice(price, s.currency)}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hiddenCount > 0 && (
        <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted-dark">
          {hiddenCount} more ticker{hiddenCount === 1 ? "" : "s"} not shown — up to {MAX_SERIES} fit on one chart.
        </p>
      )}

      <button
        type="button"
        className="mt-2 text-xs font-medium text-brand dark:text-[#8ab4f8] hover:text-brand-hover"
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? "Hide table" : "View as table"}
      </button>
      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-ink-muted dark:text-ink-muted-dark">
                {["Company", "Start", "Latest", "Change", "Range high", "Range low"].map((h) => (
                  <th key={h} className="border-b border-border px-2.5 py-1 font-medium dark:border-border-dark">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prepared.map((s) => {
                const prices = s.prices.filter((p): p is number => p !== null);
                const last = s.indexed.at(-1);
                return (
                  <tr key={s.ticker} className="text-ink dark:text-ink-dark">
                    <td className="border-b border-border px-2.5 py-1 dark:border-border-dark">
                      {s.label} <span className="text-ink-muted dark:text-ink-muted-dark">({s.ticker})</span>
                    </td>
                    {prices.length === 0 ? (
                      <td colSpan={5} className="border-b border-border px-2.5 py-1 text-ink-muted dark:border-border-dark">
                        No data in this range
                      </td>
                    ) : (
                      <>
                        <td className="border-b border-border px-2.5 py-1 dark:border-border-dark">{formatPrice(prices[0], s.currency)}</td>
                        <td className="border-b border-border px-2.5 py-1 dark:border-border-dark">
                          {formatPrice(prices[prices.length - 1], s.currency)}
                        </td>
                        <td className="border-b border-border px-2.5 py-1 font-medium dark:border-border-dark">
                          {last != null ? formatChange(last) : "—"}
                        </td>
                        <td className="border-b border-border px-2.5 py-1 dark:border-border-dark">
                          {formatPrice(Math.max(...prices), s.currency)}
                        </td>
                        <td className="border-b border-border px-2.5 py-1 dark:border-border-dark">
                          {formatPrice(Math.min(...prices), s.currency)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
