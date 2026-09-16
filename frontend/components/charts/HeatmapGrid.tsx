"use client";

import { useState } from "react";

interface HeatmapGridProps {
  title: string;
  rows: string[];
  cols: string[];
  matrix: number[][]; // [row][col]
}

const CELL = 34;
const CELL_GAP = 3;
const ROW_LABEL_WIDTH = 90;
const COL_LABEL_HEIGHT = 28;

// Sequential single hue (brand blue), light -> dark by magnitude — per dataviz skill:
// "sequential = one hue, light->dark," never a rainbow for a continuous intensity encoding.
export function HeatmapGrid({ title, rows, cols, matrix }: HeatmapGridProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (rows.length === 0 || cols.length === 0) return null;

  const max = Math.max(...matrix.flat(), 1);
  const width = ROW_LABEL_WIDTH + cols.length * (CELL + CELL_GAP);
  const height = COL_LABEL_HEIGHT + rows.length * (CELL + CELL_GAP);

  return (
    <div className="mb-2">
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>
      <svg
        role="img"
        aria-label={`${title} heatmap`}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: `${width}px`, overflow: "visible" }}
      >
        {cols.map((c, ci) => (
          <text
            key={c}
            x={ROW_LABEL_WIDTH + ci * (CELL + CELL_GAP) + CELL / 2}
            y={COL_LABEL_HEIGHT - 10}
            textAnchor="middle"
            fontSize="9"
            className="fill-ink-muted dark:fill-ink-muted-dark"
          >
            {c.length > 8 ? c.slice(0, 7) + "…" : c}
          </text>
        ))}
        {rows.map((r, ri) => (
          <g key={r}>
            <text
              x={ROW_LABEL_WIDTH - 8}
              y={COL_LABEL_HEIGHT + ri * (CELL + CELL_GAP) + CELL / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              className="fill-ink-muted dark:fill-ink-muted-dark"
            >
              {r}
            </text>
            {cols.map((c, ci) => {
              const value = matrix[ri]?.[ci] ?? 0;
              const intensity = value / max; // 0..1
              const key = `${r}__${c}`;
              return (
                <g key={c}>
                  <rect
                    x={ROW_LABEL_WIDTH + ci * (CELL + CELL_GAP)}
                    y={COL_LABEL_HEIGHT + ri * (CELL + CELL_GAP)}
                    width={CELL}
                    height={CELL}
                    rx={4}
                    fill="#0B57D0"
                    opacity={value === 0 ? 0.06 : 0.15 + intensity * 0.75}
                    stroke={hovered === key ? "#0842A0" : "none"}
                    strokeWidth={2}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "default" }}
                  >
                    <title>{`${r} × ${c}: ${value}`}</title>
                  </rect>
                  {value > 0 && (
                    <text
                      x={ROW_LABEL_WIDTH + ci * (CELL + CELL_GAP) + CELL / 2}
                      y={COL_LABEL_HEIGHT + ri * (CELL + CELL_GAP) + CELL / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill={intensity > 0.5 ? "#ffffff" : "#0B57D0"}
                      style={{ pointerEvents: "none" }}
                    >
                      {value}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
