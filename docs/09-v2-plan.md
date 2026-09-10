# Founder's Radar v2 — Plan, User Workflow & Page Map

This document consolidates the v2 (multi-tenant product) plan into one reference: the phased build plan, the end-to-end user workflow, and the full list of frontend pages/screens with a count. It supersedes nothing in `docs/00-overview.md` through `docs/08-infra-scheduling.md` — those describe the v1 pipeline, which v2 builds on top of, not replaces.

Full working notes and open engineering decisions live in `docs/decisions.md`; this file is the user-facing plan summary.

---

## 1. Plan

Four phases, ordered to de-risk the hardest and least certain part (AI-driven competitor discovery) by shipping the boring, safe parts first — the same instinct that shaped v1 ("do ComplyDo first to visualize the product, then expand").

**Confirmed decisions for v2:**
- **Discovery is human-in-the-loop, not autonomous.** The user reviews and edits AI-suggested competitors/sources before anything is tracked. v1 hit real cases (a Cloudflare-blocked careers page, a competitor with no dedicated changelog) that blind automation would have silently turned into broken or empty reports.
- **Delivery is a web dashboard + email notification**, not PDF-only. This resolves the "PDF vs web vs both" question left open since the v1 build.

### Phase 1 — Multi-tenancy foundation
Same pipeline, but any logged-in user can create their own tracked company and manually add competitors/sources through the UI — a self-serve version of what `backend/db/seed.py` does by hand today for ComplyDo. No AI discovery yet.
- Supabase Auth (already on Supabase for the DB — no new vendor).
- `owner_id` added to `target_companies`; real per-owner Row Level Security policies replace the public-read policies added for the single-user v1 portfolio case.
- A `status` field on `sources` (`active` / `broken` / `needs_review`) so scraping failures (like the Drata careers-page block hit in v1) surface in the UI instead of only in logs.
- Cloud Function scheduler changes from "one hardcoded company" to "loop over all active companies," with per-company error isolation.

### Phase 2 — Auto-discovery (human-in-the-loop)
Replaces the manual "add competitors/sources" form with an assisted flow: user types a company name, the system proposes competitors and source URLs (pricing/feature/jobs/news pages), user reviews and edits before confirming.
- New `backend/discovery/` pipeline stage: LLM (Groq, same as today) + Tavily's Search API for web search (**resolved** — Brave Search was the original recommendation but requires a credit card even on its free tier; Tavily's free tier is genuinely cardless, 1,000 requests/month, and is purpose-built for this "agent does a search, gets structured results" use case).
- Nothing is saved to the database until the user confirms the reviewed list.

### Phase 3 — Scale + delivery
The parts that only matter once more than one or two companies are being tracked.
- Broken-source status (from Phase 1) surfaced visibly in the dashboard.
- Re-check scraping rate limits and Groq/embedding cost at real scale — v1's collectors were only tuned for 2 competitors × 4 source types.
- Email notifications on new reports — needs an email provider, **not yet chosen** (Resend or Postmark, both viable).
- Companies staggered across the week rather than all running at once.

### Phase 4 — Monetization (optional, deferred)
Not designed in detail — contingent on Phases 1–3 actually working for real users. Would add Stripe billing, plan-based tracking limits, and pause/cancel tied to company status.

### Still-open decisions
1. Email provider (Phase 3) — Resend vs. Postmark, not yet confirmed.
2. Whether Phase 1 ships for real public signups (needs production auth hardening — email verification, password reset) or stays a local/portfolio demo.

### Status as of 2026-09-10
Phases 1 and 2 are code-complete and verified live (auth incl. Google + GitHub OAuth, owner-scoped RLS, discovery, the full page map below). Deploy target resolved — GCP Cloud Run + Cloud Scheduler (`docs/08-infra-scheduling.md`), not the Render/Cloud Functions options considered earlier. Full detail and verification notes are in `docs/decisions.md`'s dated entries, most recently 2026-09-10.

Beyond the original 4-phase plan, three features were added straight from `docs/10-competitive-feature-research.md`'s research pass rather than waiting for a formal Phase 3/4 slot, since they fit the existing architecture cheaply:
- **Multi-competitor trend chart** (`frontend/components/TrendChart.tsx`) on the company page.
- **Community signal tracking** (`backend/collectors/community_collector.py`) — a new `community` source type scanning HN + Reddit for buying-intent chatter, not just name mentions.
- **A customizable dashboard** (`dashboard_widgets` table + `/dashboard/custom`) — not from the research doc, user-requested: mix feed/chart widgets from any tracked company on one page.

One more fix landed alongside the dashboard work: `reports`/`signals` had kept their v1 single-tenant "public read" policy, which was a real cross-tenant data leak now that real users exist. Replaced with real report-level sharing (private by default, owner-controlled public toggle, or per-email invites) — see `docs/decisions.md`'s 2026-09-10 entry for the full RLS design.

---

## 2. User workflow

End-to-end journey once Phases 1–3 are built:

1. **Land** on the marketing page, click sign up.
2. **Sign up / log in** (Supabase Auth — email/password or magic link).
3. **Land on the dashboard** — empty state on first login ("track your first competitor set").
4. **Add a company**: type the company name (and optionally its website).
5. **Review discovery results**: the system proposes competitors and their pricing/feature/jobs/news source URLs; user edits, removes, or adds entries.
6. **Confirm** — this is the point data is actually written (`target_companies` / `competitors` / `sources` rows created).
7. **Pipeline runs on schedule** (weekly, per company) — collects, detects changes, analyzes, scores, assembles a report. No user action needed here; this is the existing v1 pipeline (`backend/main.py`) run per-tenant.
8. **Email notification** arrives when a new report is ready, linking to the dashboard.
9. **View the report** on the web (existing `/report/[id]` page, reused from v1) — headline, executive summary, signal cards.
10. **Return to the dashboard** anytime to see report history, add another company, or check for `needs_review` source warnings.

```mermaid
flowchart TD
    A[Landing page] --> B[Sign up / Log in]
    B --> C[Dashboard]
    C -->|first time or add another| D[Add company: name + website]
    D --> E[Discovery runs: LLM + web search]
    E --> F[Review screen: edit/remove/confirm candidates]
    F -->|confirm| G[(competitors + sources saved)]
    G --> H[Scheduled pipeline run, weekly per company]
    H --> I[Email: new report ready]
    I --> J[Report page]
    C --> J
    J --> C
```

---

## 3. Frontend page map

All of the following are built and live, except `/billing` (Phase 4, deferred). v1 originally had exactly one page (`/report/[id]`) — everything else here was added across the v2 sessions.

| # | Route | Purpose | Status |
|---|-------|---------|--------|
| 1 | `/` | Landing / marketing page | Built |
| 2 | `/login` | Log in — email/password, Google, GitHub | Built |
| 3 | `/signup` | Sign up — email/password (+ company name, job title), Google, GitHub | Built |
| 4 | `/forgot-password`, `/reset-password` | Password reset flow | Built (not in the original plan; added mid-build) |
| 5 | `/dashboard` | List of the user's tracked companies + report history | Built |
| 6 | `/dashboard/custom` ("My Dashboard") | Customizable widget dashboard — feed/bar/line widgets from any tracked company, drag-to-reorder | Built (not in the original plan; added 2026-09-10) |
| 7 | `/company/new` | Single-page wizard: name/website, discovery, review/edit, confirm | Built (collapsed the planned two-step wizard into one route+form) |
| 8 | `/company/[id]` | Company detail: report history, competitor trend chart, manage sources, `needs_review`/`broken` warnings | Built |
| 9 | `/report/[id]` | Individual report view — headline, summary, signal cards, owner-only Share panel (public/private, per-email invites) | Built, extended from the v1 original |
| 10 | `/settings` | Account settings | Built |

**Core product (Phases 1–3, plus the two additions above): 10 distinct routes.**

**Phase 4 (optional, deferred)** would add one more:

| # | Route | Purpose | Status |
|---|-------|---------|--------|
| 11 | `/billing` | Plan/subscription management | Not built, deferred to Phase 4 |

---

*Plan approved 2026-09-04. Full phase detail with file-level notes lives in the plan file this was generated from; this document is the durable, repo-committed version of it. Status section and page map updated 2026-09-10 to match what's actually built — see `docs/decisions.md` for the verification trail.*
