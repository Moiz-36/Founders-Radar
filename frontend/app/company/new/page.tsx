"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/client";
import { SourceType } from "@/lib/types";

const SOURCE_TYPES: SourceType[] = ["pricing", "feature", "job_posting", "news", "community"];
// "news"/"community" sources are a search term (competitor name), not a fetchable URL —
// see backend/collectors/news_collector.py and community_collector.py.
const SEARCH_TERM_TYPES: SourceType[] = ["news", "community"];

interface SourceDraft {
  source_type: SourceType;
  url: string;
}

interface CompetitorDraft {
  name: string;
  website: string;
  sources: SourceDraft[];
  confidence?: string;
}

function emptyCompetitor(): CompetitorDraft {
  return { name: "", website: "", sources: [{ source_type: "pricing", url: "" }] };
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
      .insert({ name: companyName, owner_id: user.id, report_interval_days: reportIntervalDays })
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
          name: competitor.name,
          website: competitor.website || null,
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
          url: s.url,
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
    <>
      <Nav />
      <main className="page">
        <h1>Add a company to track</h1>
        <p className="page-subtitle">
          Let us find your competitors automatically, or add them by hand. We'll generate
          your first report right away.
        </p>

        {error && <div className="form-error">{error}</div>}
        {discoveryNote && (
          <div className="empty-state" style={{ textAlign: "left", marginBottom: "1.5rem" }}>
            {discoveryNote}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="company-name">
            Company you're tracking competitors for
          </label>
          <input
            id="company-name"
            className="input"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />

          <label className="field-label" htmlFor="company-website">
            Website (optional, helps discovery)
          </label>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
            <input
              id="company-website"
              className="input"
              style={{ flex: 1 }}
              placeholder="https://..."
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDiscover}
              disabled={discovering}
              style={{ flexShrink: 0, marginTop: 0 }}
            >
              {discovering ? "Searching..." : "Find competitors automatically"}
            </button>
          </div>

          <label className="field-label" htmlFor="report-interval">
            Run a new report every
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <input
              id="report-interval"
              className="input"
              style={{ width: "5rem", marginBottom: 0 }}
              type="number"
              min={1}
              required
              value={reportIntervalDays}
              onChange={(e) => setReportIntervalDays(Math.max(1, Number(e.target.value) || 1))}
            />
            <span>day{reportIntervalDays === 1 ? "" : "s"}</span>
          </div>

          {competitors.map((competitor, ci) => (
            <div className="competitor-group" key={ci}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Competitor name
                </label>
                {competitor.confidence && (
                  <span className={`status-badge status-${competitor.confidence === "high" ? "active" : "needs_review"}`}>
                    {competitor.confidence} confidence
                  </span>
                )}
              </div>
              <input
                className="input"
                required
                value={competitor.name}
                onChange={(e) => updateCompetitor(ci, { name: e.target.value })}
              />

              <label className="field-label">Website (optional)</label>
              <input
                className="input"
                value={competitor.website}
                onChange={(e) => updateCompetitor(ci, { website: e.target.value })}
              />

              <label className="field-label">Sources to check</label>
              {competitor.sources.map((source, si) => (
                <div key={si} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <select
                    className="input"
                    style={{ width: "9rem", flexShrink: 0, marginBottom: 0 }}
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
                    className="input"
                    style={{ marginBottom: 0 }}
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
                      className="btn-text"
                      onClick={() => removeSource(ci, si)}
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-text" onClick={() => addSource(ci)}>
                + add source
              </button>

              {competitors.length > 1 && (
                <div style={{ marginTop: "0.8rem" }}>
                  <button type="button" className="btn-text" onClick={() => removeCompetitor(ci)}>
                    remove competitor
                  </button>
                </div>
              )}
            </div>
          ))}

          <button type="button" className="btn btn-secondary" onClick={addCompetitor} style={{ marginBottom: "1.5rem" }}>
            + Add another competitor
          </button>

          <div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? savingLabel : "Start tracking"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
