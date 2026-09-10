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
}

// Validated categorical order (dataviz skill, references/palette.md) — fixed order,
// never cycled or reassigned by rank. All 8 slots clear the adjacent-pair CVD/contrast
// gates that apply to line charts, so up to 8 competitors get a distinct hue.
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
const MAX_SERIES = SERIES_COLORS.length;

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

export function TrendChart({ title, periods, series: rawSeries }: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const series = foldSeries(rawSeries);
  if (periods.length < 2 || series.length === 0) return null;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const yTicks = buildYTicks(max);

  const xStep = PLOT_WIDTH / (periods.length - 1);
  const xAt = (i: number) => MARGIN.left + i * xStep;
  const yAt = (v: number) => MARGIN.top + PLOT_HEIGHT - (v / max) * PLOT_HEIGHT;

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div className="field-label" style={{ marginTop: 0, marginBottom: "0.6rem" }}>
        {title}
      </div>

      {/* Legend — the dependable identity channel; hovering an entry highlights its line. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", marginBottom: "0.6rem" }}>
        {series.map((s, i) => (
          <div
            key={s.label}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.78rem",
              color: "#5b6472",
              cursor: "default",
              opacity: activeIndex === null || activeIndex === i ? 1 : 0.4,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: SERIES_COLORS[i % SERIES_COLORS.length],
                display: "inline-block",
                flexShrink: 0,
              }}
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
            <line x1={MARGIN.left} x2={CHART_WIDTH - MARGIN.right} y1={yAt(t)} y2={yAt(t)} stroke="#e8ebef" strokeWidth={1} />
            <text
              x={MARGIN.left - 8}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              fontFamily="Helvetica, Arial, sans-serif"
              fill="#5b6472"
            >
              {t}
            </text>
          </g>
        ))}

        {periods.map((p, i) => (
          <text
            key={p + i}
            x={xAt(i)}
            y={CHART_HEIGHT - 6}
            textAnchor="middle"
            fontSize="10"
            fontFamily="Helvetica, Arial, sans-serif"
            fill="#5b6472"
          >
            {p}
          </text>
        ))}

        {series.map((s, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const isDimmed = activeIndex !== null && activeIndex !== i;
          const points = s.values.map((v, pi) => `${xAt(pi)},${yAt(v)}`).join(" ");
          const lastValue = s.values[s.values.length - 1];
          const lastX = xAt(s.values.length - 1);
          const lastY = yAt(lastValue);

          return (
            <g key={s.label} opacity={isDimmed ? 0.25 : 1}>
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
                  stroke="#fff"
                  strokeWidth={2}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  style={{ cursor: "default" }}
                >
                  <title>{`${s.label} — ${periods[pi]}: ${v}`}</title>
                </circle>
              ))}
              {/* Direct end-label — value at the line's end, in ink (never the series hue). */}
              <text
                x={lastX + 6}
                y={lastY}
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="bold"
                fontFamily="Helvetica, Arial, sans-serif"
                fill="#1a1f27"
              >
                {lastValue}
              </text>
            </g>
          );
        })}
      </svg>

      <button
        type="button"
        className="btn-text"
        style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? "Hide table" : "View as table"}
      </button>

      {showTable && (
        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.3rem 0.6rem", borderBottom: "1px solid #d8dde3" }}>
                  Competitor
                </th>
                {periods.map((p, i) => (
                  <th key={p + i} style={{ textAlign: "right", padding: "0.3rem 0.6rem", borderBottom: "1px solid #d8dde3" }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.label}>
                  <td style={{ padding: "0.3rem 0.6rem", borderBottom: "1px solid #d8dde3" }}>{s.label}</td>
                  {s.values.map((v, i) => (
                    <td key={i} style={{ textAlign: "right", padding: "0.3rem 0.6rem", borderBottom: "1px solid #d8dde3" }}>
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
