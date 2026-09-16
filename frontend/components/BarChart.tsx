"use client";

import { useState } from "react";

interface BarChartProps {
  title: string;
  data: { label: string; value: number }[];
}

const BAR_HEIGHT = 18;
const ROW_GAP = 10;
const LABEL_WIDTH = 110;
const CHART_WIDTH = 420;
const BAR_AREA_WIDTH = CHART_WIDTH - LABEL_WIDTH - 40; // leaves room for the value label

export function BarChart({ title, data }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const rowHeight = BAR_HEIGHT + ROW_GAP;
  const height = data.length * rowHeight;

  return (
    // Single-series magnitude comparison (one bar per named category/competitor) — one
    // sequential hue (DESIGN.md's brand blue), not a categorical set, per dataviz skill's form
    // heuristic: color isn't needed to distinguish bars already distinguished by their axis
    // label. Light/dark values as scoped CSS custom properties (dataviz skill's recommended
    // pattern) so the SVG's presentation attributes can reference them directly.
    <div className="mb-8 [--bar:#0B57D0] [--bar-hover:#0842A0] [--chart-ink:#202124] [--chart-muted:#5F6368] dark:[--bar:#8AB4F8] dark:[--bar-hover:#AECBFA] dark:[--chart-ink:#E8EAED] dark:[--chart-muted:#9AA0A6]">
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>
      <svg
        role="img"
        aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
        width="100%"
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        style={{ maxWidth: `${CHART_WIDTH}px`, overflow: "visible" }}
      >
        {data.map((d, i) => {
          const y = i * rowHeight;
          const barWidth = Math.max((d.value / max) * BAR_AREA_WIDTH, 3);
          const isHovered = hovered === i;

          return (
            <g
              key={d.label}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${d.value}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              style={{ cursor: "default", outline: "none" }}
            >
              <text
                x={LABEL_WIDTH - 10}
                y={y + BAR_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
                fill="var(--chart-muted)"
              >
                {d.label}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={barWidth}
                height={BAR_HEIGHT}
                rx={4}
                fill={isHovered ? "var(--bar-hover)" : "var(--bar)"}
              />
              <text
                x={LABEL_WIDTH + barWidth + 8}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="bold"
                fill="var(--chart-ink)"
              >
                {d.value}
              </text>
              {isHovered && (
                <title>
                  {d.label}: {d.value}
                </title>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
