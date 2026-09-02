# Frontend

## Purpose
Read a finished report from Supabase and render it as a webpage — no scraping, no pipeline logic here at all, purely a viewer.

## File structure
```
frontend/app/layout.tsx              # root layout
frontend/app/globals.css             # styling, matches the PDF template's look
frontend/app/report/[id]/page.tsx    # fetches report + signals from Supabase, renders them
frontend/components/SignalCard.tsx   # one signal card component
frontend/lib/supabase.ts             # Supabase client
frontend/lib/types.ts                # Report/Signal TypeScript interfaces, matching db/models.py
```

## Build steps
1. `npm install` in `frontend/`.
2. `cp .env.local.example .env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `npm run dev`, visit `/report/<a real report id>`.
4. `getReport()` in `page.tsx` does two Supabase queries: fetch the report row by id, then fetch its signals via the `signal_ids` array column.

## Status
Scaffolded, never run. Not yet a confirmed requirement — `context.md` flags PDF-vs-web-vs-both as an open decision. Lower priority than getting the pipeline producing a real PDF first.

## Gotchas
- Uses the Supabase anon key directly in the browser — fine given `reports`/`signals` have no sensitive data and this is a single-user portfolio project, but would need row-level security if this ever became multi-tenant (explicitly out of scope per `context.md`).
- No loading/error states beyond Next.js's default `notFound()` — acceptable for a v1 demo, not production-grade UX.
