import { NextRequest, NextResponse } from "next/server";
import { pipelineHeaders } from "@/lib/pipelineFetch";
import { createClient } from "@/lib/supabase/server";

// PDF rendering (headless Chromium) can take a while on a cold instance.
export const maxDuration = 60;

// Downloads a report as PDF, rendered on demand by the pipeline (GET /reports/{id}/pdf). The
// pipeline endpoint has no per-user auth, so this route enforces access: the RLS-scoped select
// returns the report only to its owner, invited viewers, or anyone if it's public — the same
// rule as the report page itself.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase.from("reports").select("id").eq("id", id).maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found or not accessible" }, { status: 404 });
  }

  const pipelineBaseUrl = process.env.PIPELINE_API_BASE_URL;
  if (!pipelineBaseUrl) {
    return NextResponse.json({ error: "PIPELINE_API_BASE_URL is not configured" }, { status: 503 });
  }

  let response: Response;
  try {
    response = await fetch(`${pipelineBaseUrl}/reports/${id}/pdf`, { headers: pipelineHeaders() });
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }
  if (!response.ok) {
    return NextResponse.json({ error: "Could not generate the PDF" }, { status: 502 });
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="founders-radar-report-${id}.pdf"`,
    },
  });
}
