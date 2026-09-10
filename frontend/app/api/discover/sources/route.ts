import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// See app/api/discover/competitors/route.ts for why this only checks auth, not ownership.
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
    const response = await fetch(`${pipelineBaseUrl}/discover/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
