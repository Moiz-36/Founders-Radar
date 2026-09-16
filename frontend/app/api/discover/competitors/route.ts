import { NextRequest, NextResponse } from "next/server";
import { pipelineHeaders } from "@/lib/pipelineFetch";
import { createClient } from "@/lib/supabase/server";

// Server-side only, same reasoning as app/api/companies/[id]/run: the pipeline's discovery
// endpoints have no auth of their own, so this route is what requires a real logged-in user
// before calling them. There's no target_company_id yet at discovery time (it doesn't exist
// until the user hits "Start tracking"), so this only checks for a session, not ownership.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const pipelineBaseUrl = process.env.PIPELINE_API_BASE_URL;
  if (!pipelineBaseUrl) {
    return NextResponse.json({ error: "PIPELINE_API_BASE_URL is not configured" }, { status: 503 });
  }

  const body = await request.json();

  try {
    const response = await fetch(`${pipelineBaseUrl}/discover/competitors`, {
      method: "POST",
      headers: pipelineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Discovery failed" }, { status: 502 });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }
}
