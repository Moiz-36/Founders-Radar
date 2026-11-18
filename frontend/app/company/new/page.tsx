"use client";

import { Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Nav } from "@/components/Nav";
import { Badge } from "@/components/ui/Badge";
import {
  CompetitorDraft,
  SourceDraft,
  discoverSourcesFor,
  resetDraft,
  runDiscovery,
  updateCompetitorAt,
  updateDraft,
  useNewCompanyDraft,
} from "@/lib/newCompanyDraft";
import { createClient } from "@/lib/supabase/client";
import { SourceType } from "@/lib/types";

const SOURCE_TYPES: SourceType[] = ["pricing", "feature", "job_posting", "news", "community", "review", "general"];
// "news"/"community" sources are a search term (the competitor's name), not a page — see
// backend/collectors/__init__.py's NewsCollector and CommunityCollector.
const SEARCH_TERM_TYPES: SourceType[] = ["news", "community"];
const SEARCH_TERM_HINT: Partial<Record<SourceType, string>> = {
  news: "Not a link — we search Hacker News for stories mentioning this name.",
  community: "Not a link — we search Hacker News for “alternative to …” and “switching from …” discussions.",
};

const inputClass =
  "block w-full rounded-lg border border-[#dadce0] bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-canvas-dark dark:text-ink-dark dark:placeholder:text-ink-muted-dark";
const labelClass = "mb-1 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark";
const cardClass =
  "rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark";
const selfCardClass =
  "rounded-lg border border-[#b8e6e8] bg-[#e0f5f6] p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-[#154548] dark:bg-[#0d2a2c]";

function emptyCompetitor(): CompetitorDraft {
  return { name: "", website: "", sources: [{ source_type: "pricing", url: "" }] };
}

export default function NewCompanyPage() {
  const router = useRouter();
  // The form state lives in lib/newCompanyDraft.ts, not here, so it (and a running
  // discovery) survives leaving this page and coming back.
  const { companyName, companyWebsite, reportIntervalDays, competitors, error, discovering, discoveryNote } =
    useNewCompanyDraft();
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState("Saving...");

  const setError = (message: string | null) => updateDraft({ error: message });

  function setCompetitors(next: (prev: CompetitorDraft[]) => CompetitorDraft[]) {
    updateDraft((d) => ({ competitors: next(d.competitors) }));
  }

  function updateSource(competitorIndex: number, sourceIndex: number, patch: Partial<SourceDraft>) {
    setCompetitors((prev) =>
      prev.map((c, i) =>
        i !== competitorIndex
          ? c
          : { ...c, sources: c.sources.map((s, j) => (j === sourceIndex ? { ...s, ...patch } : s)) }
      )
    );
  }

  function addCompetitor() {
    setCompetitors((prev) => [...prev, emptyCompetitor()]);
  }

  // Only one entry can be "my own company" — ticking one unticks any other.
  function setSelf(index: number, isSelf: boolean) {
    setCompetitors((prev) =>
      prev.map((c, i) => (i === index ? { ...c, isSelf } : isSelf ? { ...c, isSelf: false } : c))
    );
  }

  function removeCompetitor(index: number) {
    setCompetitors((prev) => prev.filter((_, i) => i !== index));
  }

  function addSource(competitorIndex: number) {
    setCompetitors((prev) =>
      prev.map((c, i) =>
        i !== competitorIndex ? c : { ...c, sources: [...c.sources, { source_type: "pricing", url: "" }] }
      )
    );
  }

  function removeSource(competitorIndex: number, sourceIndex: number) {
    setCompetitors((prev) =>
      prev.map((c, i) =>
        i !== competitorIndex ? c : { ...c, sources: c.sources.filter((_, j) => j !== sourceIndex) }
      )
    );
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedName = companyName.trim();
    if (!trimmedName) {
      setError("Enter a company name.");
      return;
    }
    if (competitors.some((c) => c.sourcesStatus === "searching")) {
      setError("Still looking up competitor pages — wait for it to finish, or remove those competitors.");
      return;
    }

    // A competitor with zero real sources is dead weight — nothing to collect, so it'll
    // never produce a signal. Catch this before creating anything.
    const activeCompetitors = competitors.filter((c) => c.name.trim());
    const withoutSources = activeCompetitors.filter((c) => !c.sources.some((s) => s.url.trim()));
    if (withoutSources.length > 0) {
      setError(
        `${withoutSources.map((c) => c.name).join(", ")} — add at least one source (or remove it) before continuing.`
      );
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setSaving(false);
      return;
    }

    const { data: company, error: companyError } = await supabase
      .from("target_companies")
      .insert({ name: trimmedName, owner_id: user.id, report_interval_days: reportIntervalDays })
      .select()
      .single();

    if (companyError || !company) {
      setError(companyError?.message ?? "Failed to create company.");
      setSaving(false);
      return;
    }

    // The inserts below are separate requests, not one transaction. If one fails part-way,
    // delete the company again (cascades to whatever competitors/sources were saved) so the
    // user isn't left with a half-built company and can simply retry.
    async function abort(message: string) {
      await supabase.from("target_companies").delete().eq("id", company.id);
      setError(message);
      setSaving(false);
    }

    for (const competitor of activeCompetitors) {
      const { data: competitorRow, error: competitorError } = await supabase
        .from("competitors")
        .insert({
          target_company_id: company.id,
          name: competitor.name.trim(),
          website: competitor.website || null,
          is_self: !!competitor.isSelf,
        })
        .select()
        .single();

      if (competitorError || !competitorRow) {
        await abort(competitorError?.message ?? "Failed to create competitor.");
        return;
      }

      const sourcesToInsert = competitor.sources
        .filter((s) => s.url.trim())
        .map((s) => ({
          competitor_id: competitorRow.id,
          source_type: s.source_type,
          url: s.url.trim(),
        }));

      if (sourcesToInsert.length > 0) {
        const { error: sourceError } = await supabase.from("sources").insert(sourcesToInsert);
        if (sourceError) {
          await abort(sourceError.message);
          return;
        }
      }
    }

    // Best-effort: start the first report right away instead of waiting for the next
    // scheduled run. This returns as soon as the run has started; the company page shows its
    // progress. If the pipeline isn't reachable, the scheduled run picks the company up.
    setSavingLabel("Starting your first report...");
    try {
      await fetch(`/api/companies/${company.id}/run`, { method: "POST" });
    } catch {
      // ignored — see comment above
    }

    resetDraft();
    router.push(`/company/${company.id}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">Add a company to track</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted-dark">
          Let us find your competitors automatically, or add them by hand. We&apos;ll generate your first report
          right away.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
            {error}
          </div>
        )}
        {discoveryNote && (
          <div className="mt-4 rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info dark:border-info-border-dark dark:bg-info-bg-dark dark:text-info-dark">
            {discoveryNote}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className={cardClass}>
            <label className={labelClass} htmlFor="company-name">
              Company you&apos;re tracking competitors for
            </label>
            <input
              id="company-name"
              className={inputClass}
              required
              value={companyName}
              onChange={(e) => updateDraft({ companyName: e.target.value })}
            />

            <label className={`${labelClass} mt-4`} htmlFor="company-website">
              Website (optional, helps discovery)
            </label>
            <div className="flex flex-wrap items-start gap-2">
              <input
                id="company-website"
                className={`${inputClass} flex-1`}
                placeholder="https://..."
                value={companyWebsite}
                onChange={(e) => updateDraft({ companyWebsite: e.target.value })}
              />
              <button
                type="button"
                onClick={runDiscovery}
                disabled={discovering}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm font-semibold text-brand transition hover:brightness-95 disabled:opacity-60 dark:border-info-border-dark dark:bg-info-bg-dark dark:text-info-dark"
              >
                <Sparkles size={14} />
                {discovering ? "Searching..." : "Find competitors automatically"}
              </button>
            </div>

            <label className={`${labelClass} mt-4`} htmlFor="report-interval">
              Run a new report every
            </label>
            <div className="flex items-center gap-2">
              <input
                id="report-interval"
                className={`${inputClass} w-20`}
                type="number"
                min={1}
                required
                value={reportIntervalDays}
                onChange={(e) => updateDraft({ reportIntervalDays: Math.max(1, Number(e.target.value) || 1) })}
              />
              <span className="text-sm text-ink dark:text-ink-dark">
                day{reportIntervalDays === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {competitors.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
              {discovering
                ? "Looking for competitors… you can leave this page — the search keeps going and the results will be here when you come back."
                : "No competitors yet. Use “Find competitors automatically” above, or add one by hand below."}
            </div>
          )}

          {competitors.map((competitor, ci) => (
            <div key={ci} className={competitor.isSelf ? selfCardClass : cardClass}>
              <div className="flex items-baseline justify-between">
                <label className={labelClass}>{competitor.isSelf ? "Your company" : "Competitor name"}</label>
                {competitor.isSelf ? (
                  <Badge tone="secondary">your company</Badge>
                ) : (
                  competitor.confidence && (
                    <Badge tone={competitor.confidence === "high" ? "positive" : "warning"}>
                      {competitor.confidence} confidence
                    </Badge>
                  )
                )}
              </div>
              <input
                className={inputClass}
                required
                value={competitor.name}
                onChange={(e) => updateCompetitorAt(ci, { name: e.target.value })}
              />
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-ink-dark">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0B57D0]"
                  checked={!!competitor.isSelf}
                  onChange={(e) => setSelf(ci, e.target.checked)}
                />
                This is my own company
                <span className="text-xs text-ink-muted dark:text-ink-muted-dark">
                  (tracked alongside the others, never treated as a threat)
                </span>
              </label>

              <label className={`${labelClass} mt-4`}>Website (optional)</label>
              <input
                className={inputClass}
                value={competitor.website}
                onChange={(e) => updateCompetitorAt(ci, { website: e.target.value })}
              />

              <div className="mt-4 mb-1 flex items-center justify-between gap-2">
                <span className={`${labelClass} mb-0`}>Sources to check</span>
                {competitor.name.trim() && competitor.sourcesStatus !== "searching" && (
                  <button
                    type="button"
                    onClick={() => discoverSourcesFor(competitor.name, competitor.website)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover dark:text-[#8ab4f8]"
                  >
                    <RefreshCw size={12} />
                    {competitor.sourcesStatus === "failed" ? "Find sources again" : "Find sources automatically"}
                  </button>
                )}
              </div>

              {competitor.sourcesStatus === "searching" ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
                  Finding {competitor.name}&apos;s pricing, changelog, jobs and review pages…
                </div>
              ) : (
                <>
                  {competitor.sourcesStatus === "failed" && (
                    <p className="mb-2 text-xs text-critical dark:text-critical-dark">
                      Couldn&apos;t look up pages for {competitor.name}. Try again, or add links by hand.
                    </p>
                  )}
                  <div className="space-y-2">
                    {competitor.sources.map((source, si) => (
                      <div key={si}>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className={`${inputClass} w-36 shrink-0`}
                            value={source.source_type}
                            onChange={(e) => updateSource(ci, si, { source_type: e.target.value as SourceType })}
                          >
                            {SOURCE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <input
                            className={`${inputClass} flex-1`}
                            placeholder={
                              SEARCH_TERM_TYPES.includes(source.source_type) ? "Search term (e.g. company name)" : "https://..."
                            }
                            value={source.url}
                            onChange={(e) => updateSource(ci, si, { url: e.target.value })}
                          />
                          <button
                            type="button"
                            onClick={() => removeSource(ci, si)}
                            aria-label="Remove source"
                            className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-hover hover:text-critical dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-critical-dark"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {source.notFound && !source.url.trim() && (
                          <p className="mt-1 text-xs text-warning dark:text-warning-dark">
                            Couldn&apos;t find a relevant {source.source_type.replace("_", " ")} page. Add a link
                            manually, or leave it empty to skip it.
                          </p>
                        )}
                        {SEARCH_TERM_HINT[source.source_type] && (
                          <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted-dark">
                            {SEARCH_TERM_HINT[source.source_type]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addSource(ci)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover"
                  >
                    <Plus size={14} />
                    Add source
                  </button>
                </>
              )}

              <div className="mt-3 border-t border-border pt-3 dark:border-border-dark">
                <button
                  type="button"
                  onClick={() => removeCompetitor(ci)}
                  className="text-sm font-medium text-critical hover:text-critical/80 dark:text-critical-dark"
                >
                  Remove {competitor.isSelf ? "your company" : "competitor"}
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addCompetitor}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              <Plus size={15} />
              {competitors.length === 0 ? "Add a competitor manually" : "Add another competitor"}
            </button>
          </div>

          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? savingLabel : "Start tracking"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
