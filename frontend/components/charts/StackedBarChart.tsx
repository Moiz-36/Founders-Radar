"use client";

import { useState } from "react";

interface StackedBarChartProps {
  title: string;
  groups: string[];
  stacks: string[];
  matrix: Record<string, Record<string, number>>;
}

// Fixed priority colors (dataviz skill: status colors are never themed / reused as series
// hues) — used when the stack keys are priority levels, the most common case for this widget.
// Falls back to the validated categorical order for any other stack-key set.
const PRIORITY_COLOR: Record<string, string> = {
  high: "#D93025",
  medium: "#D97706",
  low: "#1A73E8",
};
const CATEGORICAL_FALLBACK = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

function colorFor(stack: string, index: number): string {
  return PRIORITY_COLOR[stack] ?? CATEGORICAL_FALLBACK[index % CATEGORICAL_FALLBACK.length];
}

const BAR_HEIGHT = 18;
const ROW_GAP = 12;
const LABEL_WIDTH = 100;
const CHART_WIDTH = 420;
const BAR_AREA_WIDTH = CHART_WIDTH - LABEL_WIDTH - 10;

export function StackedBarChart({ title, groups, stacks, matrix }: StackedBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (groups.length === 0 || stacks.length === 0) return null;

  const totals = groups.map((g) => stacks.reduce((sum, st) => sum + (matrix[g]?.[st] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const rowHeight = BAR_HEIGHT + ROW_GAP;
  const height = groups.length * rowHeight;

  return (
    <div className="mb-2">
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>

      <div className="mb-2 flex flex-wrap gap-3.5">
        {stacks.map((st, i) => (
          <div key={st} className="flex items-center gap-1.5 text-[0.78rem] text-ink-muted dark:text-ink-muted-dark">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(st, i) }} />
            {st}
          </div>
        ))}
      </div>

      <svg
        role="img"
        aria-label={`${title}: ${groups.map((g, i) => `${g} ${totals[i]}`).join(", ")}`}
        width="100%"
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        style={{ maxWidth: `${CHART_WIDTH}px`, overflow: "visible" }}
      >
        {groups.map((g, gi) => {
          const y = gi * rowHeight;
          let x = LABEL_WIDTH;
          return (
            <g key={g}>
              <text
                x={LABEL_WIDTH - 10}
                y={y + BAR_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
                className="fill-ink-muted dark:fill-ink-muted-dark"
              >
                {g}
              </text>
              {stacks.map((st, si) => {
                const value = matrix[g]?.[st] ?? 0;
                if (value === 0) return null;
                // 1px surface gap between adjacent segments (dataviz skill mark spec).
                const segWidth = Math.max((value / max) * BAR_AREA_WIDTH - 1, 0);
                const segX = x;
                x += (value / max) * BAR_AREA_WIDTH;
                const key = `${g}__${st}`;
                return (
                  <rect
                    key={st}
                    x={segX}
                    y={y}
                    width={segWidth}
                    height={BAR_HEIGHT}
                    rx={2}
                    fill={colorFor(st, si)}
                    opacity={hovered === null || hovered === key ? 1 : 0.4}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "default" }}
                  >
                    <title>{`${g} — ${st}: ${value}`}</title>
                  </rect>
                );
              })}
              <text
                x={LABEL_WIDTH + (totals[gi] / max) * BAR_AREA_WIDTH + 6}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="bold"
                className="fill-ink dark:fill-ink-dark"
              >
                {totals[gi]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
