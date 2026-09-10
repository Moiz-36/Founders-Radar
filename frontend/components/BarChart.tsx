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

// Matches the report page's existing accent (globals.css --accent) — one hue, since each
// chart here is a single series (magnitude per category), not multiple series needing
// CVD-distinct hues. See dataviz skill: "Compare magnitude -> bar; color job: sequential."
const BAR_COLOR = "#2c3e50";
const BAR_COLOR_HOVER = "#3d5a76";

export function BarChart({ title, data }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const rowHeight = BAR_HEIGHT + ROW_GAP;
  const height = data.length * rowHeight;

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div className="field-label" style={{ marginTop: 0, marginBottom: "0.6rem" }}>
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
                fontFamily="Helvetica, Arial, sans-serif"
                fill="#5b6472"
              >
                {d.label}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={barWidth}
                height={BAR_HEIGHT}
                rx={4}
                fill={isHovered ? BAR_COLOR_HOVER : BAR_COLOR}
              />
              <text
                x={LABEL_WIDTH + barWidth + 8}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                fontSize="12"
                fontFamily="Helvetica, Arial, sans-serif"
                fontWeight="bold"
                fill="#1a1f27"
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
