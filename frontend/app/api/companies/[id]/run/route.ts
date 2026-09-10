import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Triggers an immediate pipeline run for one company. Runs server-side only — the pipeline's
// own HTTP endpoint (backend/main.py, PIPELINE_API_BASE_URL) has no auth of its own, so this
// route is what actually enforces "only the owner can trigger a run for their company" by
// checking the RLS-scoped Supabase query below before ever calling the pipeline.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase.from("target_companies").select("id").eq("id", id).single();
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const pipelineBaseUrl = process.env.PIPELINE_API_BASE_URL;
  if (!pipelineBaseUrl) {
    return NextResponse.json(
      { error: "PIPELINE_API_BASE_URL is not configured — the pipeline can't be triggered from here." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${pipelineBaseUrl}/run/${id}`, { method: "POST" });
    if (!response.ok) {
      return NextResponse.json({ error: "Pipeline run failed" }, { status: 502 });
    }
    const result = await response.json();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }
}
