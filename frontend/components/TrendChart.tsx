"use client";

import { useState } from "react";

interface TrendSeries {
  label: string;
  values: number[]; // aligned with `periods`, one value per period
}

interface TrendChartProps {
  title: string;
  periods: string[]; // x-axis labels, chronological (oldest -> newest)
  series: TrendSeries[];
  filled?: boolean; // "area" variant — same geometry, plus a low-opacity fill under each line
}

// Validated categorical order (dataviz skill, references/palette.md) — fixed order,
// never cycled or reassigned by rank. All 8 slots clear the adjacent-pair CVD/contrast
// gates that apply to line charts, so up to 8 competitors get a distinct hue. Referenced as
// CSS custom properties (set on the wrapping div below) so each slot swaps to its own
// dark-surface step — not a separate palette, the same eight hues re-stepped for contrast.
const SERIES_COLORS = [
  "var(--series-1)", // blue
  "var(--series-2)", // orange
  "var(--series-3)", // aqua
  "var(--series-4)", // yellow
  "var(--series-5)", // magenta
  "var(--series-6)", // green
  "var(--series-7)", // violet
  "var(--series-8)", // red
];
const MAX_SERIES = SERIES_COLORS.length;

// Light -> dark step per slot, from the dataviz skill's validated palette table.
const SERIES_VARS_CLASS =
  "[--series-1:#2a78d6] dark:[--series-1:#3987e5] " +
  "[--series-2:#eb6834] dark:[--series-2:#d95926] " +
  "[--series-3:#1baf7a] dark:[--series-3:#199e70] " +
  "[--series-4:#eda100] dark:[--series-4:#c98500] " +
  "[--series-5:#e87ba4] dark:[--series-5:#d55181] " +
  "[--series-6:#008300] dark:[--series-6:#008300] " +
  "[--series-7:#4a3aa7] dark:[--series-7:#9085e9] " +
  "[--series-8:#e34948] dark:[--series-8:#e66767] " +
  "[--chart-ink:#202124] dark:[--chart-ink:#E8EAED] " +
  "[--chart-muted:#5F6368] dark:[--chart-muted:#9AA0A6] " +
  "[--chart-grid:#e1e0d9] dark:[--chart-grid:#2c2c2a]";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 240;
const MARGIN = { top: 12, right: 34, bottom: 28, left: 32 };
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

// Never cycle past the validated hue set — extra competitors fold into one "Other" line.
function foldSeries(series: TrendSeries[]): TrendSeries[] {
  if (series.length <= MAX_SERIES) return series;
  const kept = series.slice(0, MAX_SERIES - 1);
  const rest = series.slice(MAX_SERIES - 1);
  const otherValues = rest[0].values.map((_, i) => rest.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  return [...kept, { label: "Other", values: otherValues }];
}

function niceStep(rough: number): number {
  if (rough <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * pow;
}

function buildYTicks(max: number): number[] {
  const step = niceStep(max / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function TrendChart({ title, periods, series: rawSeries, filled = false }: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const series = foldSeries(rawSeries);
  if (periods.length < 2 || series.length === 0) return null;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const yTicks = buildYTicks(max);

  const xStep = PLOT_WIDTH / (periods.length - 1);
  const xAt = (i: number) => MARGIN.left + i * xStep;
  const yAt = (v: number) => MARGIN.top + PLOT_HEIGHT - (v / max) * PLOT_HEIGHT;
  const baselineY = yAt(0);

  return (
    <div className={`mb-8 ${SERIES_VARS_CLASS}`}>
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>

      {/* Legend — the dependable identity channel; hovering an entry highlights its line. */}
      <div className="mb-2 flex flex-wrap gap-3.5">
        {series.map((s, i) => (
          <div
            key={s.label}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            className="flex cursor-default items-center gap-1.5 text-[0.78rem] text-ink-muted dark:text-ink-muted-dark"
            style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.4 }}
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            {s.label}
          </div>
        ))}
      </div>

      <svg
        role="img"
        aria-label={`${title}: ${series.map((s) => `${s.label} ${s.values.join(", ")}`).join("; ")}`}
        width="100%"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ maxWidth: `${CHART_WIDTH}px`, overflow: "visible" }}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={CHART_WIDTH - MARGIN.right}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 8}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              fill="var(--chart-muted)"
            >
              {t}
            </text>
          </g>
        ))}

        {periods.map((p, i) => (
          <text key={p + i} x={xAt(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
            {p}
          </text>
        ))}

        {series.map((s, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const isDimmed = activeIndex !== null && activeIndex !== i;
          const points = s.values.map((v, pi) => `${xAt(pi)},${yAt(v)}`).join(" ");
          const areaPoints = `${xAt(0)},${baselineY} ${points} ${xAt(s.values.length - 1)},${baselineY}`;
          const lastValue = s.values[s.values.length - 1];
          const lastX = xAt(s.values.length - 1);
          const lastY = yAt(lastValue);

          return (
            <g key={s.label} opacity={isDimmed ? 0.25 : 1}>
              {filled && <polygon points={areaPoints} fill={color} opacity={0.15} stroke="none" />}
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={activeIndex === i ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.values.map((v, pi) => (
                <circle
                  key={pi}
                  cx={xAt(pi)}
                  cy={yAt(v)}
                  r={4}
                  fill={color}
                  className="stroke-canvas dark:stroke-surface-dark"
                  strokeWidth={2}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  style={{ cursor: "default" }}
                >
                  <title>{`${s.label} — ${periods[pi]}: ${v}`}</title>
                </circle>
              ))}
              {/* Direct end-label — value at the line's end, in ink (never the series hue). */}
              <text x={lastX + 6} y={lastY} dominantBaseline="middle" fontSize="11" fontWeight="bold" fill="var(--chart-ink)">
                {lastValue}
              </text>
            </g>
          );
        })}
      </svg>

      <button
        type="button"
        className="mt-2 text-xs font-medium text-brand hover:text-brand-hover"
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? "Hide table" : "View as table"}
      </button>

      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-border px-2.5 py-1 text-left text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
                  Competitor
                </th>
                {periods.map((p, i) => (
                  <th
                    key={p + i}
                    className="border-b border-border px-2.5 py-1 text-right text-ink-muted dark:border-border-dark dark:text-ink-muted-dark"
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.label}>
                  <td className="border-b border-border px-2.5 py-1 text-ink dark:border-border-dark dark:text-ink-dark">
                    {s.label}
                  </td>
                  {s.values.map((v, i) => (
                    <td
                      key={i}
                      className="border-b border-border px-2.5 py-1 text-right font-mono text-ink dark:border-border-dark dark:text-ink-dark"
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
