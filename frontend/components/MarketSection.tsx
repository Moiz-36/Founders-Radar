"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { StockChart } from "@/components/StockChart";
import { createClient } from "@/lib/supabase/client";
import type { Competitor, FundingRound, StockSeries } from "@/lib/types";

// The company page's Market section: share prices for publicly traded competitors
// (StockChart) and funding/valuation history for private ones, extracted from web search
// with a source link on every round (backend/market/funding.py).

// Same rule as backend/market/stocks.py's TICKER_PATTERN.
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/;

interface StockError {
  name: string;
  ticker: string;
  error: string;
}

// Formatted by hand rather than Intl's compact notation: Node (server render) and browsers
// ship different ICU data and disagreed ("$350M" vs "$350.0M"), which broke hydration.
function formatUsd(value: number): string {
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (value >= size) return `$${(value / size).toFixed(1).replace(/\.0$/, "")}${suffix}`;
  }
  return `$${Math.round(value)}`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatMonth(iso: string | null): string {
  if (!iso) return "date unknown";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

const card =
  "rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark";
const sectionLabel = "text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark";

function TickerInput({ competitor }: { competitor: Competitor }) {
  const router = useRouter();
  const [value, setValue] = useState(competitor.stock_ticker ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function save() {
    const ticker = value.trim().toUpperCase().replace(/^\$/, "");
    if (ticker === (competitor.stock_ticker ?? "")) return;
    if (ticker && !TICKER_PATTERN.test(ticker)) {
      setState("error");
      return;
    }
    setState("saving");
    const { error } = await createClient()
      .from("competitors")
      .update({ stock_ticker: ticker || null })
      .eq("id", competitor.id);
    setState(error ? "error" : "idle");
    if (!error) {
      setValue(ticker);
      router.refresh();
    }
  }

  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="truncate text-ink dark:text-ink-dark">{competitor.name}</span>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Ticker (if public)"
        aria-label={`Stock ticker for ${competitor.name}`}
        aria-invalid={state === "error"}
        className={`w-36 rounded-md border bg-canvas px-2 py-1 text-sm uppercase text-ink placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-brand/20 dark:bg-canvas-dark dark:text-ink-dark ${
          state === "error" ? "border-critical" : "border-[#dadce0] dark:border-border-dark"
        }`}
      />
    </label>
  );
}

export function MarketSection({
  companyId,
  competitors,
  fundingRounds,
}: {
  companyId: string;
  competitors: Competitor[];
  fundingRounds: FundingRound[];
}) {
  const router = useRouter();
  const [stocks, setStocks] = useState<StockSeries[] | null>(null);
  const [stockErrors, setStockErrors] = useState<StockError[]>([]);
  const [stockLoadFailed, setStockLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<string[]>([]);

  const tickerKey = competitors.map((c) => `${c.id}:${c.stock_ticker ?? ""}`).join(",");
  const hasTickers = competitors.some((c) => c.stock_ticker);

  useEffect(() => {
    if (!hasTickers) {
      setStocks([]);
      return;
    }
    let cancelled = false;
    setStockLoadFailed(false);
    fetch(`/api/companies/${companyId}/market`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((body: { series: StockSeries[]; errors: StockError[] }) => {
        if (cancelled) return;
        setStocks(body.series);
        setStockErrors(body.errors);
      })
      .catch(() => !cancelled && setStockLoadFailed(true));
    return () => {
      cancelled = true;
    };
    // Refetch when a ticker is added, changed or removed.
  }, [companyId, tickerKey, hasTickers]);

  async function refreshFunding() {
    const targets = competitors;
    setRefreshErrors([]);
    setRefreshing({ done: 0, total: targets.length });
    const failed: string[] = [];
    // One request per competitor, sequentially: each is a web search + LLM call, and running
    // them one by one keeps every request short and the search quota predictable.
    for (const [i, competitor] of targets.entries()) {
      try {
        const res = await fetch(`/api/competitors/${competitor.id}/funding`, { method: "POST" });
        if (!res.ok) failed.push(competitor.name);
      } catch {
        failed.push(competitor.name);
      }
      setRefreshing({ done: i + 1, total: targets.length });
    }
    setRefreshing(null);
    setRefreshErrors(failed);
    router.refresh();
  }

  const roundsByCompetitor = new Map<string, FundingRound[]>();
  for (const r of fundingRounds) {
    roundsByCompetitor.set(r.competitor_id, [...(roundsByCompetitor.get(r.competitor_id) ?? []), r]);
  }
  const summaries = competitors.map((c) => {
    const rounds = (roundsByCompetitor.get(c.id) ?? []).slice().sort((a, b) =>
      (a.announced_on ?? "").localeCompare(b.announced_on ?? "")
    );
    const totalRaised = rounds.reduce((sum, r) => sum + (r.amount_usd ?? 0), 0);
    const withValuation = rounds.filter((r) => r.valuation_usd);
    return { competitor: c, rounds, totalRaised, latestValuation: withValuation.at(-1) ?? null };
  });
  const lastChecked = competitors
    .map((c) => c.funding_checked_at)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const toMillions = (v: number) => Math.round(v / 1_000_000);
  const raisedData = summaries
    .filter((s) => s.totalRaised > 0)
    .map((s) => ({ label: s.competitor.name, value: toMillions(s.totalRaised) }));
  const valuationData = summaries
    .filter((s) => s.latestValuation)
    .map((s) => ({ label: s.competitor.name, value: toMillions(s.latestValuation!.valuation_usd!) }));

  if (competitors.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className={`mb-3 ${sectionLabel}`}>Market</h2>

      <div className={`${card} mb-4`}>
        {!hasTickers ? (
          <p className="text-sm text-ink-muted dark:text-ink-muted-dark">
            No publicly traded competitors yet. Add a ticker below (or refresh funding data — it detects public
            companies) to compare share prices.
          </p>
        ) : stockLoadFailed ? (
          <p className="text-sm text-critical dark:text-critical-dark">Couldn&apos;t load share prices right now.</p>
        ) : stocks === null ? (
          <p className="text-sm text-ink-muted dark:text-ink-muted-dark">Loading share prices…</p>
        ) : (
          <>
            {stocks.length > 0 && <StockChart series={stocks} />}
            {stockErrors.map((e) => (
              <p key={e.ticker} className="mt-1 text-xs text-critical dark:text-critical-dark">
                {e.name}: no price data for &ldquo;{e.ticker}&rdquo; — check the ticker below.
              </p>
            ))}
          </>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-brand dark:text-[#8ab4f8]">Edit stock tickers</summary>
          <div className="mt-2 divide-y divide-border dark:divide-border-dark">
            {competitors.map((c) => (
              <TickerInput key={`${c.id}:${c.stock_ticker ?? ""}`} competitor={c} />
            ))}
          </div>
        </details>
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className={sectionLabel}>Funding &amp; valuation</div>
            <p className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted-dark">
              Found in public news via web search, so it may be incomplete — every round links to its source.
              {lastChecked && ` Last checked ${formatDay(lastChecked)}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={refreshFunding}
            disabled={refreshing !== null}
            className="rounded-lg border border-[#dadce0] bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-hover disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
          >
            {refreshing
              ? `Looking up ${Math.min(refreshing.done + 1, refreshing.total)} of ${refreshing.total}…`
              : lastChecked
                ? "Refresh funding data"
                : "Look up funding data"}
          </button>
        </div>

        {refreshErrors.length > 0 && (
          <p className="mb-3 text-xs text-critical dark:text-critical-dark">
            Lookup failed for {refreshErrors.join(", ")} — try again later.
          </p>
        )}

        {fundingRounds.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-ink-muted-dark">
            {lastChecked ? "No funding rounds found in public sources." : "Not looked up yet."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {valuationData.length > 0 && <ColumnChart title="Latest known valuation ($M)" data={valuationData} />}
              {raisedData.length > 0 && <ColumnChart title="Total disclosed funding ($M)" data={raisedData} />}
            </div>

            <div className="mt-2 divide-y divide-border dark:divide-border-dark">
              {summaries
                .filter((s) => s.rounds.length > 0)
                .map((s) => (
                  <details key={s.competitor.id} className="py-2.5">
                    <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-ink dark:text-ink-dark">{s.competitor.name}</span>
                      <span className="text-ink-muted dark:text-ink-muted-dark">
                        {s.totalRaised > 0 && `${formatUsd(s.totalRaised)} raised`}
                        {s.latestValuation && ` · valued ${formatUsd(s.latestValuation.valuation_usd!)}`}
                        {` · ${s.rounds.length} round${s.rounds.length === 1 ? "" : "s"}`}
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {s.rounds.map((r) => (
                        <li key={r.id} className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                          <span className="font-medium text-ink dark:text-ink-dark">{r.round}</span>
                          {` · ${formatMonth(r.announced_on)}`}
                          {r.amount_usd != null && ` · ${formatUsd(r.amount_usd)}`}
                          {r.valuation_usd != null && ` at ${formatUsd(r.valuation_usd)} valuation`}
                          {r.investors && ` · ${r.investors}`}
                          {/^https?:\/\//.test(r.source_url) && (
                            <>
                              {" · "}
                              <a href={r.source_url} target="_blank" rel="noreferrer noopener" className="text-brand dark:text-[#8ab4f8] hover:underline">
                                source
                              </a>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
