"use client";

import { useState } from "react";

interface ColumnChartProps {
  title: string;
  data: { label: string; value: number }[];
}

const COL_WIDTH = 34;
const COL_GAP = 18;
const CHART_HEIGHT = 200;
const LABEL_HEIGHT = 26;
const PLOT_HEIGHT = CHART_HEIGHT - LABEL_HEIGHT;

// Vertical-orientation sibling of BarChart — same "one sequential hue, no categorical set"
// reasoning (magnitude per already-labeled category), just oriented for a narrower widget card.
export function ColumnChart({ title, data }: ColumnChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const colStep = COL_WIDTH + COL_GAP;
  const width = data.length * colStep + COL_GAP;

  return (
    <div className="mb-2 [--bar:#0B57D0] [--bar-hover:#0842A0] [--chart-ink:#202124] [--chart-muted:#5F6368] dark:[--bar:#8AB4F8] dark:[--bar-hover:#AECBFA] dark:[--chart-ink:#E8EAED] dark:[--chart-muted:#9AA0A6]">
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>
      <svg
        role="img"
        aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
        width="100%"
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        style={{ maxWidth: `${width}px`, overflow: "visible" }}
      >
        {data.map((d, i) => {
          const x = COL_GAP + i * colStep;
          const colHeight = Math.max((d.value / max) * (PLOT_HEIGHT - 20), 3);
          const y = PLOT_HEIGHT - colHeight;
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
              <text x={x + COL_WIDTH / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--chart-ink)">
                {d.value}
              </text>
              <rect
                x={x}
                y={y}
                width={COL_WIDTH}
                height={colHeight}
                rx={4}
                fill={isHovered ? "var(--bar-hover)" : "var(--bar)"}
              />
              <text
                x={x + COL_WIDTH / 2}
                y={PLOT_HEIGHT + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--chart-muted)"
              >
                {d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label}
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
