"use client";

import { useSyncExternalStore } from "react";
import { SourceType } from "@/lib/types";

// The add-company form's state lives here, at module level, rather than in the page's own
// React state. Two reasons:
// - Discovery takes a while (a search + LLM call per competitor). If the founder opens another
//   page meanwhile, the page unmounts but this module stays alive (client-side navigation
//   keeps the same JS context), so the running discovery keeps writing its results here and
//   they're all there on return.
// - It's also mirrored to sessionStorage, so a full reload of the tab keeps the draft too.
//   A discovery that was cut off by a reload is reported as interrupted, not left "running".

export interface SourceDraft {
  source_type: SourceType;
  url: string;
  // Set when discovery searched for this type and found nothing — shown as a hint so the
  // founder knows to paste a link (or remove the row) rather than wonder why it's empty.
  notFound?: boolean;
}

export interface CompetitorDraft {
  name: string;
  website: string;
  sources: SourceDraft[];
  confidence?: string;
  // "This is my own company" (see docs/decisions.md) — same pipeline as any competitor, just
  // flagged so it never reads as a threat in generated report language.
  isSelf?: boolean;
  // Discovery state for this competitor's sources.
  sourcesStatus?: "searching" | "done" | "failed";
}

export interface NewCompanyDraft {
  companyName: string;
  companyWebsite: string;
  reportIntervalDays: number;
  competitors: CompetitorDraft[];
  discovering: boolean;
  discoveryNote: string | null;
  error: string | null;
}

const STORAGE_KEY = "founders-radar:new-company-draft";

// The source types discovery searches the web for (backend/discovery/source_finder.py's
// SEARCH_QUERIES). One it didn't find comes back as an empty, flagged row.
const SEARCHED_SOURCE_TYPES: SourceType[] = ["pricing", "feature", "job_posting", "review"];

function initialDraft(): NewCompanyDraft {
  return {
    companyName: "",
    companyWebsite: "",
    reportIntervalDays: 7,
    competitors: [],
    discovering: false,
    discoveryNote: null,
    error: null,
  };
}

function loadDraft(): NewCompanyDraft {
  if (typeof window === "undefined") return initialDraft();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDraft();
    const saved = { ...initialDraft(), ...(JSON.parse(raw) as Partial<NewCompanyDraft>) };
    // Restored from storage means the page was reloaded, which kills any in-flight request.
    if (saved.discovering || saved.competitors.some((c) => c.sourcesStatus === "searching")) {
      saved.discovering = false;
      saved.competitors = saved.competitors.map((c) =>
        c.sourcesStatus === "searching" ? { ...c, sourcesStatus: "failed" } : c
      );
      saved.discoveryNote = "The search was interrupted by a page reload — results so far are kept below.";
    }
    return saved;
  } catch {
    return initialDraft();
  }
}

let draft: NewCompanyDraft | null = null;
const listeners = new Set<() => void>();

function current(): NewCompanyDraft {
  if (draft === null) draft = loadDraft();
  return draft;
}

export function updateDraft(patch: Partial<NewCompanyDraft> | ((d: NewCompanyDraft) => Partial<NewCompanyDraft>)) {
  const base = current();
  draft = { ...base, ...(typeof patch === "function" ? patch(base) : patch) };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked — the in-memory draft still works for this visit.
  }
  listeners.forEach((l) => l());
}

export function resetDraft() {
  draft = initialDraft();
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignored
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_SNAPSHOT = initialDraft();

export function useNewCompanyDraft(): NewCompanyDraft {
  return useSyncExternalStore(subscribe, current, () => SERVER_SNAPSHOT);
}

export function updateCompetitorAt(index: number, patch: Partial<CompetitorDraft>) {
  updateDraft((d) => ({ competitors: d.competitors.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
}

// Updates a competitor found by discovery, by name — its index can shift if the founder adds
// or removes rows while discovery is still running.
function updateCompetitorNamed(name: string, patch: Partial<CompetitorDraft>) {
  updateDraft((d) => ({ competitors: d.competitors.map((c) => (c.name === name ? { ...c, ...patch } : c)) }));
}

function toSourceDrafts(found: { source_type: SourceType; url: string }[]): SourceDraft[] {
  const drafts: SourceDraft[] = found.map((s) => ({ source_type: s.source_type, url: s.url }));
  for (const type of SEARCHED_SOURCE_TYPES) {
    if (!found.some((s) => s.source_type === type)) drafts.push({ source_type: type, url: "", notFound: true });
  }
  return drafts;
}

export async function discoverSourcesFor(name: string, website: string) {
  updateCompetitorNamed(name, { sourcesStatus: "searching" });
  try {
    const res = await fetch("/api/discover/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitor_name: name, website: website || null }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const sources = ((await res.json()).sources ?? []) as { source_type: SourceType; url: string }[];
    updateCompetitorNamed(name, { sources: toSourceDrafts(sources), sourcesStatus: "done" });
  } catch {
    updateCompetitorNamed(name, { sourcesStatus: "failed" });
  }
}

export async function runDiscovery() {
  const { companyName, companyWebsite } = current();
  if (!companyName.trim()) {
    updateDraft({ error: "Enter a company name first." });
    return;
  }
  updateDraft({ error: null, discoveryNote: null, discovering: true });

  try {
    const res = await fetch("/api/discover/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName, website: companyWebsite || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      updateDraft({ error: body.error ?? "Competitor discovery failed.", discovering: false });
      return;
    }
    const found = ((await res.json()).competitors ?? []) as { name: string; website: string | null; confidence: string }[];
    if (found.length === 0) {
      updateDraft({ discoveryNote: "No competitors found automatically — add them by hand below.", discovering: false });
      return;
    }

    // Keep anything the founder already entered by hand (or their own company); replace only
    // rows that are still blank.
    updateDraft((d) => ({
      competitors: [
        ...d.competitors.filter((c) => c.name.trim() || c.isSelf),
        ...found.map((c) => ({
          name: c.name,
          website: c.website ?? "",
          confidence: c.confidence,
          sources: [],
          sourcesStatus: "searching" as const,
        })),
      ],
      discoveryNote: `Found ${found.length} competitor${found.length === 1 ? "" : "s"} — finding their pages now…`,
    }));

    // One competitor at a time: each lookup is a burst of LLM tokens, and running them all at
    // once is what tripped the LLM provider's per-minute limit and left competitors without
    // sources. Each card fills in as its lookup finishes.
    for (const c of found) {
      await discoverSourcesFor(c.name, c.website ?? "");
    }

    const failed = current().competitors.filter((c) => c.sourcesStatus === "failed").length;
    updateDraft({
      discoveryNote:
        failed > 0
          ? `Found ${found.length} competitors. Couldn't look up pages for ${failed} of them — use "Find sources again" on those, or add links by hand.`
          : `Found ${found.length} competitor${found.length === 1 ? "" : "s"} — review and edit before you start tracking.`,
    });
  } catch {
    updateDraft({ error: "Could not reach the discovery service." });
  } finally {
    updateDraft({ discovering: false });
  }
}
