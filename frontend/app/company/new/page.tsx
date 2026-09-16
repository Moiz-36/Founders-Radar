"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Nav } from "@/components/Nav";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { SourceType } from "@/lib/types";

const SOURCE_TYPES: SourceType[] = ["pricing", "feature", "job_posting", "news", "community", "review", "general"];
// "news"/"community" sources are a search term (competitor name), not a fetchable URL —
// see backend/collectors/news_collector.py and community_collector.py.
const SEARCH_TERM_TYPES: SourceType[] = ["news", "community"];

const inputClass =
  "block w-full rounded-lg border border-[#dadce0] bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-canvas-dark dark:text-ink-dark dark:placeholder:text-ink-muted-dark";
const labelClass = "mb-1 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark";

interface SourceDraft {
  source_type: SourceType;
  url: string;
}

interface CompetitorDraft {
  name: string;
  website: string;
  sources: SourceDraft[];
  confidence?: string;
  // Optional "track my own company too" (see docs/decisions.md) — same pipeline as any
  // competitor, just flagged so it never reads as a threat in generated report language.
  isSelf?: boolean;
}

function emptyCompetitor(): CompetitorDraft {
  return { name: "", website: "", sources: [{ source_type: "pricing", url: "" }] };
}

function emptySelfCompetitor(): CompetitorDraft {
  return { name: "", website: "", sources: [{ source_type: "pricing", url: "" }], isSelf: true };
}

export default function NewCompanyPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [reportIntervalDays, setReportIntervalDays] = useState(7);
  const [competitors, setCompetitors] = useState<CompetitorDraft[]>([emptyCompetitor()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState("Saving...");
  const [discovering, setDiscovering] = useState(false);
  const [discoveryNote, setDiscoveryNote] = useState<string | null>(null);

  async function handleDiscover() {
    if (!companyName.trim()) {
      setError("Enter a company name first.");
      return;
    }
    setError(null);
    setDiscoveryNote(null);
    setDiscovering(true);

    try {
      const competitorsRes = await fetch("/api/discover/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName, website: companyWebsite || null }),
      });
      if (!competitorsRes.ok) {
        const body = await competitorsRes.json().catch(() => ({}));
        setError(body.error ?? "Competitor discovery failed.");
        return;
      }
      const { competitors: found } = await competitorsRes.json();
      if (!found || found.length === 0) {
        setDiscoveryNote("No competitors found automatically — add them by hand below.");
        return;
      }

      const withSources = await Promise.all(
        found.map(async (c: { name: string; website: string | null; confidence: string }) => {
          const sourcesRes = await fetch("/api/discover/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ competitor_name: c.name, website: c.website }),
          });
          const sources = sourcesRes.ok ? (await sourcesRes.json()).sources ?? [] : [];
          return {
            name: c.name,
            website: c.website ?? "",
            confidence: c.confidence,
            sources: sources.length > 0
              ? sources.map((s: { source_type: SourceType; url: string }) => ({
                  source_type: s.source_type,
                  url: s.url,
                }))
              : [{ source_type: "pricing" as SourceType, url: "" }],
          };
        })
      );

      setCompetitors(withSources);
      setDiscoveryNote(
        `Found ${withSources.length} competitor${withSources.length === 1 ? "" : "s"} — review and edit before you start tracking.`
      );
    } catch {
      setError("Could not reach the discovery service.");
    } finally {
      setDiscovering(false);
    }
  }

  function updateCompetitor(index: number, patch: Partial<CompetitorDraft>) {
    setCompetitors((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
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

  function addSelfCompetitor() {
    setCompetitors((prev) => [emptySelfCompetitor(), ...prev]);
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

    // A competitor with zero real sources is dead weight — nothing to collect, so it'll
    // never produce a signal. Catch this before creating anything rather than silently
    // dropping the empty-URL row on insert (it used to be created anyway, invisibly useless).
    const activeCompetitors = competitors.filter((c) => c.name.trim());
    const withoutSources = activeCompetitors.filter((c) => !c.sources.some((s) => s.url.trim()));
    if (withoutSources.length > 0) {
      setError(
        `${withoutSources.map((c) => c.name).join(", ")} — add at least one source URL (or remove the competitor) before continuing.`
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

    for (const competitor of competitors) {
      if (!competitor.name.trim()) continue;

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
        setError(competitorError?.message ?? "Failed to create competitor.");
        setSaving(false);
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
          setError(sourceError.message);
          setSaving(false);
          return;
        }
      }
    }

    // Best-effort: generate the first report right away instead of making the user wait for
    // the next scheduled run. If the pipeline service isn't reachable (e.g. not running
    // locally), fail quietly — the company page just shows "no reports yet" and the
    // scheduled run will pick it up on the configured interval.
    setSavingLabel("Generating your first report...");
    try {
      await fetch(`/api/companies/${company.id}/run`, { method: "POST" });
    } catch {
      // ignored — see comment above
    }

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
          <div className="rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
            <label className={labelClass} htmlFor="company-name">
              Company you&apos;re tracking competitors for
            </label>
            <input
              id="company-name"
              className={inputClass}
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
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
                onChange={(e) => setCompanyWebsite(e.target.value)}
              />
              <button
                type="button"
                onClick={handleDiscover}
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
                onChange={(e) => setReportIntervalDays(Math.max(1, Number(e.target.value) || 1))}
              />
              <span className="text-sm text-ink dark:text-ink-dark">
                day{reportIntervalDays === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {competitors.map((competitor, ci) => (
            <div
              key={ci}
              className={
                competitor.isSelf
                  ? "rounded-lg border border-[#b8e6e8] bg-[#e0f5f6] p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-[#154548] dark:bg-[#0d2a2c]"
                  : "rounded-lg border border-border bg-canvas p-5 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark"
              }
            >
              <div className="flex items-baseline justify-between">
                <label className={`${labelClass} mt-0`}>
                  {competitor.isSelf ? "Your company" : "Competitor name"}
                </label>
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
                onChange={(e) => updateCompetitor(ci, { name: e.target.value })}
              />

              <label className={`${labelClass} mt-4`}>Website (optional)</label>
              <input
                className={inputClass}
                value={competitor.website}
                onChange={(e) => updateCompetitor(ci, { website: e.target.value })}
              />

              <label className={`${labelClass} mt-4`}>Sources to check</label>
              <div className="space-y-2">
                {competitor.sources.map((source, si) => (
                  <div key={si} className="flex flex-wrap items-center gap-2">
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
                        SEARCH_TERM_TYPES.includes(source.source_type)
                          ? "search term (e.g. company name)"
                          : "https://..."
                      }
                      value={source.url}
                      onChange={(e) => updateSource(ci, si, { url: e.target.value })}
                    />
                    {competitor.sources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSource(ci, si)}
                        aria-label="Remove source"
                        className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-hover hover:text-critical dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-critical-dark"
                      >
                        <Trash2 size={15} />
                      </button>
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

              {competitors.length > 1 && (
                <div className="mt-3 border-t border-border pt-3 dark:border-border-dark">
                  <button
                    type="button"
                    onClick={() => removeCompetitor(ci)}
                    className="text-sm font-medium text-critical hover:text-critical/80 dark:text-critical-dark"
                  >
                    Remove competitor
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addCompetitor}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              <Plus size={15} />
              Add another competitor
            </button>
            {!competitors.some((c) => c.isSelf) && (
              <button
                type="button"
                onClick={addSelfCompetitor}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#b8e6e8] bg-[#e0f5f6] px-4 py-2 text-sm font-medium text-accent-teal transition hover:brightness-95 dark:border-[#154548] dark:bg-[#0d2a2c] dark:text-[#4dd0d9]"
              >
                <Plus size={15} />
                Track my own company too
              </button>
            )}
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
