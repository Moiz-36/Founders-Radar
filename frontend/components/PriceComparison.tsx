"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PricePlan } from "@/lib/types";

// Actual plan prices side by side, from each competitor's pricing page (price_plans, filled in
// by backend/market/pricing.py after every run). One row per paid plan, bar length = price per
// month, colored per competitor; plans without a listed price ("Contact sales") are listed
// separately rather than drawn as a zero.

export interface PriceCompetitor {
  id: string;
  name: string;
  is_self: boolean;
}

// Same validated categorical palette (and light/dark pairs) as DonutChart and TrendChart.
const PALETTE_SIZE = 8;
const SERIES_VARS_CLASS =
  "[--series-0:#2a78d6] dark:[--series-0:#3987e5] " +
  "[--series-1:#eb6834] dark:[--series-1:#d95926] " +
  "[--series-2:#1baf7a] dark:[--series-2:#199e70] " +
  "[--series-3:#eda100] dark:[--series-3:#c98500] " +
  "[--series-4:#e87ba4] dark:[--series-4:#d55181] " +
  "[--series-5:#008300] dark:[--series-5:#008300] " +
  "[--series-6:#4a3aa7] dark:[--series-6:#9085e9] " +
  "[--series-7:#e34948] dark:[--series-7:#e66767]";

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥" };

function money(value: number, currency: string | null): string {
  const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(2).replace(/\.00$/, "");
  if (!currency) return rounded;
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol ? `${symbol}${rounded}` : `${rounded} ${currency}`;
}

function describe(plan: PricePlan): string {
  if (plan.price === null) return "Not listed (contact sales)";
  if (plan.price === 0) return "Free";
  const per = plan.unit ? ` / ${plan.unit}` : "";
  if (plan.monthly_price !== null) {
    const yearly = plan.billing_period === "year" ? ` (billed ${money(plan.price, plan.currency)} yearly)` : "";
    return `${money(plan.monthly_price, plan.currency)}${per} / month${yearly}`;
  }
  return `${money(plan.price, plan.currency)}${per}${plan.billing_period === "one_time" ? " one-time" : ""}`;
}

export function PriceComparison({
  competitors,
  compact = false,
}: {
  competitors: PriceCompetitor[];
  compact?: boolean;
}) {
  const [plans, setPlans] = useState<PricePlan[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [cheapestOnly, setCheapestOnly] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null);
  const [refreshFailed, setRefreshFailed] = useState<string[]>([]);

  const competitorKey = competitors.map((c) => c.id).join(",");

  const load = useCallback(async () => {
    if (competitors.length === 0) {
      setPlans([]);
      return;
    }
    const { data, error } = await createClient()
      .from("price_plans")
      .select("*")
      .in("competitor_id", competitors.map((c) => c.id))
      .order("position");
    if (error) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setPlans((data ?? []) as PricePlan[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitorKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshFailed([]);
    const failed: string[] = [];
    for (const [i, c] of competitors.entries()) {
      setRefreshing({ done: i, total: competitors.length });
      try {
        const res = await fetch(`/api/competitors/${c.id}/prices`, { method: "POST" });
        if (!res.ok) failed.push(c.name);
      } catch {
        failed.push(c.name);
      }
    }
    setRefreshing(null);
    setRefreshFailed(failed);
    await load();
  }

  const colorIndex = new Map(competitors.map((c, i) => [c.id, i % PALETTE_SIZE]));
  const nameOf = new Map(competitors.map((c) => [c.id, c.is_self ? `${c.name} (you)` : c.name]));

  const all = plans ?? [];
  let paid = all.filter((p) => p.monthly_price !== null && p.monthly_price > 0);
  if (cheapestOnly) {
    const cheapest = new Map<string, PricePlan>();
    for (const p of paid) {
      const current = cheapest.get(p.competitor_id);
      if (!current || p.monthly_price! < current.monthly_price!) cheapest.set(p.competitor_id, p);
    }
    paid = Array.from(cheapest.values());
  }
  paid = paid.slice().sort((a, b) => a.monthly_price! - b.monthly_price!);
  const unlisted = all.filter((p) => p.price === null || (p.monthly_price === null && p.price !== 0));
  const free = all.filter((p) => p.price === 0);
  const currencies = new Set(paid.map((p) => p.currency ?? "?"));
  const max = Math.max(...paid.map((p) => p.monthly_price!), 1);
  const withoutPlans = competitors.filter((c) => !all.some((p) => p.competitor_id === c.id));
  const selectedPlan = all.find((p) => p.id === selected) ?? null;

  const refreshButton = (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing !== null}
      className="inline-flex items-center gap-1 rounded-lg border border-[#dadce0] bg-canvas px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-hover disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
    >
      <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
      {refreshing ? `Reading pricing page ${refreshing.done + 1} of ${refreshing.total}…` : "Refresh prices"}
    </button>
  );

  if (loadFailed) {
    return <p className="text-sm text-critical dark:text-critical-dark">Couldn&apos;t load plan prices right now.</p>;
  }
  if (plans === null) {
    return <p className="text-sm text-ink-muted dark:text-ink-muted-dark">Loading plan prices…</p>;
  }

  return (
    <div className={`[--chart-ink:#202124] dark:[--chart-ink:#E8EAED] ${SERIES_VARS_CLASS}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
          Price per month for each plan, read from each competitor&apos;s pricing page.{" "}
          {!compact && "Hover or click a bar for details."}
        </p>
        <div className="flex items-center gap-2">
          {paid.length > 0 && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink dark:text-ink-dark">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#0B57D0]"
                checked={cheapestOnly}
                onChange={(e) => setCheapestOnly(e.target.checked)}
              />
              Cheapest paid plan only
            </label>
          )}
          {refreshButton}
        </div>
      </div>

      {refreshFailed.length > 0 && (
        <p className="mb-2 text-xs text-critical dark:text-critical-dark">
          Couldn&apos;t read prices for {refreshFailed.join(", ")} — try again later.
        </p>
      )}

      {all.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
          No plan prices yet. They&apos;re read from each competitor&apos;s <strong>pricing</strong> source after a
          report runs — click &ldquo;Refresh prices&rdquo; to read them now. Competitors without a pricing source
          can&apos;t be compared.
        </p>
      ) : (
        <>
          {paid.length > 0 && (
            <div className="space-y-1.5" role="list" aria-label="Plan prices per month">
              {paid.map((p) => {
                const ci = colorIndex.get(p.competitor_id) ?? 0;
                const active = hovered === p.id || selected === p.id;
                const dimmed = (hovered || selected) && !active;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="listitem"
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(p.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => setSelected(selected === p.id ? null : p.id)}
                    title={`${nameOf.get(p.competitor_id)} · ${p.plan}: ${describe(p)}`}
                    className="grid w-full grid-cols-[minmax(90px,38%)_1fr] items-center gap-2 text-left"
                    style={{ opacity: dimmed ? 0.45 : 1 }}
                  >
                    <span className="truncate text-xs text-ink dark:text-ink-dark">
                      <span className="font-medium">{nameOf.get(p.competitor_id)}</span>
                      <span className="text-ink-muted dark:text-ink-muted-dark"> · {p.plan}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className="block h-4 rounded"
                        style={{
                          width: `${Math.max((p.monthly_price! / max) * 100, 2)}%`,
                          maxWidth: "calc(100% - 7.5rem)",
                          background: `var(--series-${ci})`,
                          outline: active ? "2px solid var(--chart-ink)" : "none",
                          outlineOffset: 1,
                        }}
                      />
                      <span className="shrink-0 font-mono text-xs font-semibold text-ink dark:text-ink-dark">
                        {money(p.monthly_price!, p.currency)}
                        {p.unit && <span className="font-sans font-normal text-ink-muted dark:text-ink-muted-dark">/{p.unit}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedPlan && (
            <div className="mt-3 rounded-lg border border-border bg-canvas-dim px-3 py-2 text-xs text-ink dark:border-border-dark dark:bg-canvas-dark dark:text-ink-dark">
              <strong>
                {nameOf.get(selectedPlan.competitor_id)} · {selectedPlan.plan}
              </strong>
              : {describe(selectedPlan)}
              {!selectedPlan.currency && " — currency not stated clearly on the page"}. Read from the pricing page on{" "}
              {new Date(selectedPlan.extracted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
            </div>
          )}

          {(free.length > 0 || unlisted.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...free, ...unlisted].map((p) => (
                <span
                  key={p.id}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-ink-muted dark:border-border-dark dark:text-ink-muted-dark"
                >
                  {nameOf.get(p.competitor_id)} · {p.plan}: <span className="text-ink dark:text-ink-dark">{describe(p)}</span>
                </span>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
            {currencies.size > 1 &&
              "Prices are in each page's own currency and aren't converted, so compare across currencies with care. "}
            {currencies.has("?") && "A price without a symbol means the page didn't state its currency clearly. "}
            Per-seat and flat prices aren&apos;t directly comparable — the unit is shown after each price.
            {withoutPlans.length > 0 && ` No prices found for: ${withoutPlans.map((c) => c.name).join(", ")}.`}
          </p>
        </>
      )}
    </div>
  );
}
