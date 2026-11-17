import { NextRequest, NextResponse } from "next/server";
import { pipelineHeaders } from "@/lib/pipelineFetch";
import { createClient } from "@/lib/supabase/server";

// Starts a pipeline run for one company. The pipeline's own endpoint has no per-user auth, so
// this route is what enforces "only the owner can trigger a run": the RLS-scoped query below
// returns the company only for its owner.
//
// The backend returns 202 as soon as the run has started (a full run takes minutes, far
// longer than a serverless request may last); the caller then polls
// target_companies.run_status — see components/RunNowButton.tsx.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase.from("target_companies").select("id").eq("id", id).maybeSingle();
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

  let response: Response;
  try {
    response = await fetch(`${pipelineBaseUrl}/run/${id}`, { method: "POST", headers: pipelineHeaders() });
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }

  if (response.status === 409) {
    return NextResponse.json({ status: "running", error: "A report is already being generated." }, { status: 409 });
  }
  if (!response.ok) {
    return NextResponse.json({ error: "Could not start the pipeline run" }, { status: 502 });
  }
  return NextResponse.json({ status: "running" }, { status: 202 });
}
