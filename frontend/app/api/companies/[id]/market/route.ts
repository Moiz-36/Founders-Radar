import { NextRequest, NextResponse } from "next/server";
import { pipelineHeaders } from "@/lib/pipelineFetch";
import { createClient } from "@/lib/supabase/server";

// Stock price history for a company's publicly traded competitors (backend GET
// /market/{id}/stocks). The backend has no per-user auth, so this route enforces ownership:
// the RLS-scoped select returns the company only to its owner.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase.from("target_companies").select("id").eq("id", id).maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const pipelineBaseUrl = process.env.PIPELINE_API_BASE_URL;
  if (!pipelineBaseUrl) {
    return NextResponse.json({ error: "PIPELINE_API_BASE_URL is not configured" }, { status: 503 });
  }

  try {
    const response = await fetch(`${pipelineBaseUrl}/market/${id}/stocks`, { headers: pipelineHeaders() });
    if (!response.ok) {
      return NextResponse.json({ error: "Could not load stock prices" }, { status: 502 });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }
}
