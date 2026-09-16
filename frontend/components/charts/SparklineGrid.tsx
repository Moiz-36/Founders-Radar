interface SparklineGridProps {
  title: string;
  periods: string[];
  series: { label: string; values: number[] }[];
}

const WIDTH = 140;
const HEIGHT = 36;
const MAX_TILES = 9;

function pathFor(values: number[], max: number): string {
  if (values.length < 2) return "";
  const step = WIDTH / (values.length - 1);
  return values.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step},${HEIGHT - (v / max) * (HEIGHT - 6) - 3}`).join(" ");
}

// Small multiples — one mini trend per group, for scanning many competitors/categories at
// once rather than reading one crowded multi-line chart. No axes/legend on each tile (the
// label + latest value carry it); a full TrendChart is the right tool when the shapes
// themselves need close comparison.
export function SparklineGrid({ title, periods, series }: SparklineGridProps) {
  if (periods.length < 2 || series.length === 0) return null;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const tiles = series.slice(0, MAX_TILES);

  return (
    <div className="mb-2">
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((s) => {
          const latest = s.values[s.values.length - 1];
          const prior = s.values[s.values.length - 2] ?? latest;
          const trendUp = latest > prior;
          const trendDown = latest < prior;
          return (
            <div key={s.label} className="rounded-lg border border-border p-2.5 dark:border-border-dark">
              <div className="mb-1 flex items-center justify-between">
                <span className="truncate text-xs font-medium text-ink dark:text-ink-dark">{s.label}</span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    trendUp ? "text-critical dark:text-critical-dark" : trendDown ? "text-positive dark:text-positive-dark" : "text-ink-muted dark:text-ink-muted-dark"
                  }`}
                >
                  {latest}
                </span>
              </div>
              <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ maxWidth: WIDTH, overflow: "visible" }}>
                <path d={pathFor(s.values, max)} fill="none" stroke="#0B57D0" className="dark:stroke-[#8AB4F8]" strokeWidth={1.5} />
              </svg>
            </div>
          );
        })}
      </div>
      {series.length > MAX_TILES && (
        <div className="mt-1.5 text-xs text-ink-muted dark:text-ink-muted-dark">
          +{series.length - MAX_TILES} more not shown
        </div>
      )}
    </div>
  );
}
