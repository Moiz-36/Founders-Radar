# Frontend

## Purpose
v1 was purely a viewer: read a finished report from Supabase and render it. v2 (see `docs/09-v2-plan.md`) turned it into a real multi-tenant app — auth, a dashboard, self-serve company/competitor management, AI-assisted discovery, and a customizable widget dashboard — but the report page's original job is still exactly this: no scraping, no pipeline logic in the frontend at all.

## File structure
Grouped by concern rather than listed flat — see `docs/09-v2-plan.md`'s page map for the full route table.
```
frontend/app/layout.tsx, globals.css        # root layout + styling
frontend/middleware.ts                      # gates /dashboard, /company, /settings behind auth

# Auth
frontend/app/login/, signup/, forgot-password/, reset-password/page.tsx
frontend/app/auth/callback/route.ts         # completes OAuth (Google/GitHub) code exchange
frontend/lib/supabase/client.ts             # browser client
frontend/lib/supabase/server.ts             # cookie-aware server client (Server Components)
frontend/lib/supabase.ts                    # plain anon client — legacy v1, unused as of 2026-09-10

# Company management + discovery
frontend/app/dashboard/page.tsx             # list of tracked companies
frontend/app/company/new/page.tsx           # add-company wizard: name/website -> discovery -> review -> confirm
frontend/app/company/[id]/page.tsx          # company detail: sources, trend chart, report history
frontend/app/api/discover/competitors/, sources/route.ts   # proxy to backend /discover/* endpoints
frontend/app/api/companies/[id]/run/route.ts                # proxy to backend /run/{id}, triggers an immediate report

# Reports
frontend/app/report/[id]/page.tsx           # the original v1 page, extended with owner/shared access + Share panel
frontend/components/SignalCard.tsx, BarChart.tsx, TrendChart.tsx, ShareReportPanel.tsx

# Custom dashboard
frontend/app/dashboard/custom/page.tsx      # "My Dashboard" — widget grid
frontend/components/DashboardBuilder.tsx, WidgetCard.tsx
frontend/lib/widgetData.ts                  # widget signal fetch/aggregation helpers

# Shared
frontend/lib/types.ts                       # TypeScript interfaces matching backend/db/models.py
frontend/components/Nav.tsx, SignOutButton.tsx
```

## Build steps
1. `npm install` in `frontend/`.
2. `cp .env.local.example .env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `npm run dev`. Visit `/` for the landing page, `/signup` to create an account, or `/report/<a real report id>` directly for the original v1 viewer page.
4. Auth-gated routes (`/dashboard`, `/company/*`, `/settings`) require a session — `middleware.ts` redirects to `/login?next=<path>` otherwise. `/report/[id]` is deliberately **not** gated (it needs to work for anonymous public/shared visitors too) — it does its own per-request access check instead (see Gotchas).

## Status
v1's report page **verified end-to-end** (2026-09-03). v2's auth (email/password + Google + GitHub OAuth), dashboard, company management, discovery review flow, trend chart, custom dashboard, and report sharing were built and individually verified across sessions through 2026-09-10 — see `docs/decisions.md`'s dated entries for the verification trail on each. Bumped `next` from `15.1.4` → `15.5.25` early on for 2 high + 1 critical npm-audit CVEs; a residual moderate/high from a `postcss` dependency bundled inside Next's own toolchain only clears on a Next 16 major upgrade (not done).

## Gotchas
- **`frontend/lib/supabase.ts` (plain anon client, no session/cookies) is legacy and unused as of 2026-09-10** — `/report/[id]` was switched to the cookie-aware `lib/supabase/server.ts` client so the owner/shared-report RLS checks can actually see who's viewing (see below). Don't reach for `lib/supabase.ts` in new code; it silently queries as an anonymous session-less user even when the visitor is logged in.
- Supabase enables Row Level Security by default on new tables; with RLS on and zero (or wrong) policies, a query silently gets zero rows back — no error — instead of being denied loudly. This bit twice: once in v1 (fixed with public read policies on `reports`/`signals`, 2026-09-03), and once more seriously in v2 (those same public policies turned out to be a real cross-tenant leak once multiple real tenants existed — replaced with owner/public/invited-by-email logic, 2026-09-10, see `docs/decisions.md`). If a query that should return rows comes back empty, check RLS policies before assuming the query itself is wrong.
- `/report/[id]` intentionally isn't behind `middleware.ts`'s auth gate (a share link must work logged-out), so it does its own access check per request: fetch the report (RLS decides if it's visible), and if not, branch on whether a session exists at all to show "log in" vs. "not shared with you".
- Dev server auto-picks a free port if 3000 is taken (e.g. 3001/3002) — check the actual `next dev` startup log for the real URL rather than assuming 3000.
- The claude-in-chrome browser automation extension has been unreliable across sessions (connection failures on both 2026-09-07 and later) — when it's down, verification falls back to either manual testing by the user or direct API/DB checks (curl, or a script against `DATABASE_URL`).
