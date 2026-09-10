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
}

export type SourceType = "pricing" | "feature" | "job_posting" | "news" | "community";
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

export type WidgetDisplay = "feed" | "bar" | "line";

export interface DashboardWidget {
  id: string;
  owner_id: string;
  target_company_id: string;
  competitor_id: string | null;
  source_type: SourceType | null;
  display: WidgetDisplay;
  title: string | null;
  position: number;
  created_at: string;
}
