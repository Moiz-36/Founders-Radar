import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChatScope = "report" | "company";

// Server-side proxy to the FastAPI pipeline's /chat/{scope}/{id} endpoints — same pattern as
// app/api/companies/[id]/run/route.ts. The pipeline endpoints have no auth of their own, so this
// route is what actually enforces "you can only chat about what you can see":
// - report scope: RLS-scoped `reports` select returns a row only for the owner or someone the
//   report is shared with (or anyone, if it's public) — same check the report page itself does.
// - company scope: RLS on target_companies is owner-only (no sharing), so this select returns a
//   row only for the company's own owner.
//
// History is no longer sent from the client (Phase 3 — see docs/decisions.md): the backend
// loads and persists it itself via chat_messages, so a refresh doesn't lose the conversation.
// The response is streamed straight through as plain text (the backend streams tokens as
// they're generated) rather than buffered into JSON.
export async function POST(request: NextRequest) {
  const { scope, id, question } = (await request.json()) as {
    scope?: ChatScope;
    id?: string;
    question?: string;
  };

  if (!scope || !id || !question) {
    return NextResponse.json({ error: "scope, id, and question are required" }, { status: 400 });
  }
  if (scope !== "report" && scope !== "company") {
    return NextResponse.json({ error: "scope must be 'report' or 'company'" }, { status: 400 });
  }

  const supabase = await createClient();
  const table = scope === "report" ? "reports" : "target_companies";
  const { data: row } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: `${scope === "report" ? "Report" : "Company"} not found or not accessible` }, { status: 404 });
  }

  const pipelineBaseUrl = process.env.PIPELINE_API_BASE_URL;
  if (!pipelineBaseUrl) {
    return NextResponse.json(
      { error: "PIPELINE_API_BASE_URL is not configured — chat can't reach the pipeline." },
      { status: 503 }
    );
  }

  let response: Response;
  try {
    response = await fetch(`${pipelineBaseUrl}/chat/${scope}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the pipeline service" }, { status: 502 });
  }

  if (!response.ok) {
    let detail = "Chat request failed";
    try {
      const err = await response.json();
      detail = err.detail ?? detail;
    } catch {
      // response wasn't JSON — keep the default message
    }
    return NextResponse.json({ error: detail }, { status: response.status });
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
