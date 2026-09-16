export type ReportVisibility = "private" | "public";

export interface Report {
  id: string;
  target_company_id: string;
  week_start: string;
  week_end: string;
  headline: string | null;
  executive_summary: string | null;
  signal_ids: string[] | null;
  chart_data: {
    volume_by_competitor: Record<string, number>;
    category_breakdown: Record<string, number>;
  } | null;
  pdf_url: string | null;
  visibility: ReportVisibility;
  created_at: string;
}

export interface ReportShare {
  id: string;
  report_id: string;
  email: string;
  invited_at: string;
}

export interface TargetCompany {
  id: string;
  owner_id: string | null;
  name: string;
  report_interval_days: number;
  created_at: string;
}

export interface Competitor {
  id: string;
  target_company_id: string;
  name: string;
  website: string | null;
  // Optional "track my own company too": this row is the target company itself, not an
  // actual competitor — same pipeline, purely a UI-facing flag (see docs/decisions.md).
  is_self: boolean;
}

export type SourceType = "pricing" | "feature" | "job_posting" | "news" | "community" | "review" | "general";
export type SourceStatus = "active" | "broken" | "needs_review";

export interface Source {
  id: string;
  competitor_id: string;
  source_type: SourceType;
  url: string;
  last_checked_at: string | null;
  status: SourceStatus;
}

export interface Signal {
  id: string;
  source_id: string;
  old_snapshot_id: string | null;
  new_snapshot_id: string | null;
  similarity_score: number | null;
  what_changed: string | null;
  why_it_matters: string | null;
  suggested_response: string | null;
  priority: "high" | "medium" | "low" | null;
  validated: boolean;
  is_baseline: boolean;
  created_at: string;
}

export interface Snapshot {
  id: string;
  source_id: string;
  content: string;
  fetched_at: string;
}

// Widget Studio's chart-type choice. "feed" is the only non-chart option (a raw signal list);
// everything else visualizes the widget's scoped signals, grouped by `WidgetGroupBy`.
export type WidgetDisplay =
  | "feed"
  | "bar"
  | "column"
  | "line"
  | "area"
  | "stacked_bar"
  | "donut"
  | "table"
  | "stat"
  | "heatmap"
  | "sparklines";

// What to break the chart down by. null = auto (mirrors the pre-2026-09-14 implicit rule:
// source_type when scoped to one competitor, competitor otherwise) — kept for widget rows
// saved before this was a real, persisted choice.
export type WidgetGroupBy = "competitor" | "source_type" | "priority" | "week";

export interface DashboardWidget {
  id: string;
  owner_id: string;
  target_company_id: string;
  // Legacy single-competitor scope (older widget rows). New widgets use competitor_ids
  // instead — see the migration comment in infra/sql/schema.sql.
  competitor_id: string | null;
  // NULL/empty = all competitors. A hand-picked set lets a widget compare specific
  // competitors (and/or "my own company" rows) side by side in one chart.
  competitor_ids: string[] | null;
  source_type: SourceType | null;
  display: WidgetDisplay;
  group_by: WidgetGroupBy | null;
  title: string | null;
  position: number;
  created_at: string;
}
