import { NextRequest, NextResponse } from "next/server";
import { pipelineHeaders } from "@/lib/pipelineFetch";
import { createClient } from "@/lib/supabase/server";

// One web search + one LLM call — usually well under this.
export const maxDuration = 60;

// Refreshes one competitor's funding rounds (backend POST /market/competitors/{id}/funding).
// Ownership: competitors' RLS policy returns the row only to the owner of its company.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: competitor } = await supabase.from("competitors").select("id").eq("id", id).maybeSingle();
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
  }

  const pipelineBaseUrl = process.env.PIPELINE_API_BASE_URL;
  if (!pipelineBaseUrl) {
    return NextResponse.json({ error: "PIPELINE_API_BASE_URL is not configured" }, { status: 503 });
  }

  try {
    const response = await fetch(`${pipelineBaseUrl}/market/competitors/${id}/funding`, {
      method: "POST",
      headers: pipelineHeaders(),
      // Explicit empty body: Cloud Run's front end answers 411 to a POST without a length.
      body: "",
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Funding lookup failed" }, { status: 502 });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }
}
