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
  created_at: string;
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
  created_at: string;
}
