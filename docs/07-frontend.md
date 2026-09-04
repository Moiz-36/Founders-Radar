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
**Verified end-to-end** (2026-09-03) — `npm install`, `npm run dev`, loaded `/report/<real report id>` in a real browser and confirmed the headline/date range/summary render correctly from the live Supabase data (screenshot taken during verification). Bumped `next` from `15.1.4` → `15.5.25` first — the original pinned version had 2 high + 1 critical npm-audit vulnerability (including a named CVE); a residual 1 moderate/1 high remains from a `postcss` dependency bundled inside Next's own toolchain, which only clears on a Next 16 major upgrade (not done — breaking change, needs a deliberate decision, not a side effect of a docs pass). Still not a confirmed requirement over PDF-only delivery — `context.md`/`docs/decisions.md` still flag PDF-vs-web-vs-both as open.

## Gotchas
- Uses the Supabase anon key directly in the browser — fine given `reports`/`signals` have no sensitive data and this is a single-user portfolio project. **Important:** Supabase enables Row Level Security by default on new tables; with RLS on and zero policies, the anon key silently gets zero rows back (no error) instead of being denied loudly — this actually happened and was fixed by adding public read-only `SELECT` policies on `reports` and `signals` (see `infra/sql/schema.sql` and the 2026-09-03 entry in `decisions.md`). Would need real per-user RLS if this ever became multi-tenant (explicitly out of scope per `context.md` for now, see the project's roadmap-pivot notes).
- No loading/error states beyond Next.js's default `notFound()` — acceptable for a v1 demo, not production-grade UX.
- Dev server auto-picks a free port if 3000 is taken (e.g. 3002) — check the actual `next dev` startup log for the real URL rather than assuming 3000.
