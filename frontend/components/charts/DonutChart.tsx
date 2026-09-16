"use client";

import { useState } from "react";

interface DonutChartProps {
  title: string;
  data: { label: string; value: number }[];
}

// Same validated categorical order as TrendChart (dataviz skill, references/palette.md) —
// segments are distinct named categories (identity), not a magnitude ramp, so this gets the
// fixed-order categorical palette rather than one sequential hue.
const SLICE_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];
const MAX_SLICES = SLICE_COLORS.length;
const SERIES_VARS_CLASS =
  "[--series-1:#2a78d6] dark:[--series-1:#3987e5] " +
  "[--series-2:#eb6834] dark:[--series-2:#d95926] " +
  "[--series-3:#1baf7a] dark:[--series-3:#199e70] " +
  "[--series-4:#eda100] dark:[--series-4:#c98500] " +
  "[--series-5:#e87ba4] dark:[--series-5:#d55181] " +
  "[--series-6:#008300] dark:[--series-6:#008300] " +
  "[--series-7:#4a3aa7] dark:[--series-7:#9085e9] " +
  "[--series-8:#e34948] dark:[--series-8:#e66767]";

const SIZE = 160;
const RADIUS = 62;
const STROKE = 26;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function foldToMax(data: { label: string; value: number }[]): { label: string; value: number }[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return sorted;
  const kept = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1);
  const otherTotal = rest.reduce((sum, d) => sum + d.value, 0);
  return [...kept, { label: "Other", value: otherTotal }];
}

export function DonutChart({ title, data }: DonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const slices = foldToMax(data.filter((d) => d.value > 0));
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  let offset = 0;
  const arcs = slices.map((d, i) => {
    const fraction = d.value / total;
    const dash = fraction * CIRCUMFERENCE;
    const arc = { ...d, dash, gap: CIRCUMFERENCE - dash, offset, color: SLICE_COLORS[i % SLICE_COLORS.length] };
    offset += dash;
    return arc;
  });

  return (
    <div className={`mb-2 ${SERIES_VARS_CLASS}`}>
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <svg
          role="img"
          aria-label={`${title}: ${slices.map((d) => `${d.label} ${d.value}`).join(", ")}`}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {arcs.map((a, i) => (
              <circle
                key={a.label}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={a.color}
                strokeWidth={activeIndex === i ? STROKE + 4 : STROKE}
                strokeDasharray={`${a.dash} ${a.gap}`}
                strokeDashoffset={-a.offset}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.35}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                style={{ cursor: "default", transition: "stroke-width 120ms ease" }}
              >
                <title>{`${a.label}: ${a.value} (${Math.round((a.value / total) * 100)}%)`}</title>
              </circle>
            ))}
          </g>
          <text x={CENTER} y={CENTER - 3} textAnchor="middle" fontSize="20" fontWeight="700" fill="#202124" className="dark:fill-[#E8EAED]">
            {total}
          </text>
          <text x={CENTER} y={CENTER + 14} textAnchor="middle" fontSize="10" fill="#5F6368" className="dark:fill-[#9AA0A6]">
            total
          </text>
        </svg>

        <div className="flex flex-col gap-1.5">
          {arcs.map((a, i) => (
            <div
              key={a.label}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              className="flex cursor-default items-center gap-1.5 text-xs text-ink-muted dark:text-ink-muted-dark"
              style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.4 }}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="text-ink dark:text-ink-dark">{a.label}</span>
              <span className="font-mono">{a.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
