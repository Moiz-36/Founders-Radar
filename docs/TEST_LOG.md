# Founder's Radar — QA Test Log

Manual + browser-automated QA pass, 2026-09-15. Frontend at `localhost:3100`, backend at `localhost:8000`. Per `docs/test.md`'s rules — testing and any fixes are kept separate.

## Summary

Broad coverage across the marketing site, full auth'd app (add-company/discovery, real pipeline run, report + chat, sharing, custom widgets, notifications, delete-company), and edge cases. Most of the app passed cleanly and at genuinely high quality (LLM output throughout is specific and accurate, not generic filler).

**Bugs found — fixed (2):**
1. Report-scoped chat failed 100% of the time on any report with enough signal content (Groq 8,000 TPM limit exceeded) — `backend/chat/qa.py`, hard-capped the prompt's signals block.
2. Deleting a company/report silently left `chat_messages` orphaned forever (RLS silently blocked the cleanup trigger) — `infra/sql/schema.sql`, added `SECURITY DEFINER` to both trigger functions, applied live.

**Bugs found — fixed in a follow-up pass, 2026-09-15 (4):**
1. Whitespace-only company name passed client validation and created an unnamed, hard-to-manage company — `frontend/app/company/new/page.tsx` now validates the trimmed name and trims name/URL fields before insert.
2. A competitor whose discovered source URL comes back empty silently ended up with zero sources on submit, with no warning — same file now blocks submit with a named list of which competitor(s) need at least one source.
3. Broken sources showed contradictory status text ("BROKEN" + "Not checked yet" at once) — `frontend/app/company/[id]/page.tsx` now shows "Check failed — no content captured" for a broken source with no snapshot, distinct from the "not checked yet" case.
4. **The significant one:** the very first pipeline run for a new company could silently fail to produce a report (`run_pipeline_for_target` had no error handling around report/PDF assembly). Fixed in `backend/main.py`: report generation now re-queries this company's not-yet-reported signals (rather than only the current run's `new_signals`) and wraps the assemble→render→upload chain in try/except with a rollback and loud logging on failure — so any signals lost to a failed report generation are automatically recovered and included in the next run's report, instead of lost for good. See the entry below for what's still a known gap after this fix.

See per-section entries below for full detail, repro steps, and reasoning on each.

## Marketing site (signed out)

<details>
<summary>Landing page (/)</summary>

| Scenario | Status | Notes |
|---|---|---|
| Renders hero, feature cards, analyst section, strip, final CTA — dark mode | ✅ Pass | All copy matches source, illustrative-preview caption present |
| Light mode toggle | ✅ Pass | Clean contrast, no stray hardcoded-white/black elements spotted |
| Footer renders 3 columns + legal row | ✅ Pass | Platform (4), Resources (3), Company (5), legal row (4) — matches spec |
| Footer "Platform" link → /login | ✅ Pass | Spot-checked "Pricing & feature tracking" |
| Footer "Company" link → real page | ✅ Pass | Spot-checked "Security" → /security |
| Footer legal link → real page | ✅ Pass | Spot-checked "Cookie Preferences" → /cookies |

</details>

<details>
<summary>Legal / company pages</summary>

| Page | Status | Notes |
|---|---|---|
| /about | ✅ Pass | Founder section renders; LinkedIn/GitHub/Email buttons present, href verified correct (linkedin.com/in/moiz-mansoor-489b232b7) |
| /careers | ✅ Pass | |
| /press | ✅ Pass | Real email (mmoizmaredia@gmail.com) wired in, no placeholder left |
| /security | ✅ Pass | |
| /security-disclosure | ✅ Pass | |
| /contact | ✅ Pass | |
| /privacy | ✅ Pass | |
| /terms | ✅ Pass | |
| /cookies | ✅ Pass | |

</details>

<details>
<summary>404 handling</summary>

| Scenario | Status | Notes |
|---|---|---|
| Navigate to nonsense path | ✅ Pass | Standard Next.js 404 page, no crash. Minor: unstyled default (not matching app's design system) — cosmetic, not a functional bug, not fixed |

</details>

## Authenticated — Add company / discovery (the previously-never-verified flow)

<details>
<summary>Form validation edge cases</summary>

| Scenario | Status | Notes |
|---|---|---|
| Submit with all fields empty | ✅ Pass | Native HTML5 `required` blocks submit, focuses company name field |
| Company name = whitespace only ("   ") | ❌→✅ **Bug, fixed** | `required` only checks non-empty, doesn't trim — form submitted with a blank-looking name. Company was created with no visible name (header showed only a "?" avatar) and the delete-confirm banner read "Delete ? This removes..." with the name missing. Fixed: `handleSubmit` now validates `companyName.trim()` before submitting and uses the trimmed value for the insert (competitor name and source URL trimmed the same way for consistency) |

</details>

<details>
<summary>Real discovery + real pipeline run (company: "Linear", https://linear.app)</summary>

| Scenario | Status | Notes |
|---|---|---|
| "Find competitors automatically" (real Tavily+Groq call) | ✅ Pass | ~36s. Found 5 real, correct competitors: Jira Software (high), Shortcut (high), ClickUp (high), ZenHub (medium), Asana (medium) — all genuinely accurate for Linear |
| Per-competitor source auto-population | ⚠️ Partial | 4/5 competitors got 4-6 fully populated real source URLs (pricing/feature/job/news/community/general). Jira Software got only 1 source row with an **empty URL** — degrades gracefully (editable empty field, not a crash) but is inconsistent with the other 4. Not fixed — likely LLM/search variance, worth a future look |
| Submitting with an empty source URL for a competitor | ❌→✅ **Bug, fixed** | Jira ended up with **zero** sources at all (the empty-URL row was silently dropped on submit) — a competitor with 0 sources is not useful and nothing warned the user. Fixed: `handleSubmit` now blocks submit with a named error ("Jira Software — add at least one source URL...") when any competitor with a name has no non-empty source URL |
| Full pipeline run (5 competitors, 16 sources, real scraping + Groq analysis) | ✅ Mostly pass | ~75s real run. 13/16 sources succeeded (ACTIVE, real timestamps), 13 signals generated, 2 high priority. **All 3 `job_posting` sources failed** (Asana/ClickUp/Shortcut careers pages) — marked BROKEN |
| Broken-source status label | ❌→✅ **Bug, fixed** | Failed sources showed status "BROKEN" *and* "Not checked yet" simultaneously — contradictory copy. Fixed in `frontend/app/company/[id]/page.tsx`: a broken source with no snapshot now shows "Check failed — no content captured" instead, distinct from the genuine not-yet-attempted case |
| First report generation ("We'll generate your first report right away") | ❌→✅ **Bug, root-caused, and fixed** | Despite 13 real signals being generated and committed, **no `reports` row was created** — company page showed "No reports yet" indefinitely. Root cause: `run_pipeline_for_target` (`backend/main.py`) commits per-source results, then calls `assemble_report` → `render_report_charts` → `render_pdf` → `upload_report_pdf` → `session.commit()` with **no try/except around any of it**, unlike the per-source loop which does catch and isolate failures. Any transient failure in that chain (this run took ~75s total, single-threaded, real network calls to Supabase Storage) silently lost the entire report — signals were already paid for (LLM calls already made) but nothing was persisted, and the frontend's own fetch to `/api/companies/[id]/run` is deliberately fire-and-forget (`frontend/app/company/new/page.tsx`, "fail quietly" by design — left as-is, out of scope for this fix) so there was zero user-facing error either. **Fix (2026-09-15 follow-up):** `run_pipeline_for_target` now computes `report_signals` by re-querying for every signal belonging to this company's sources that isn't yet part of any existing report's `signal_ids` (via `Report.signal_ids` array containment), instead of using only the current run's in-memory `new_signals` — so a signal only ever counts as "spent" once a report is actually persisted with it. The assemble→render→upload chain is now wrapped in try/except: on failure it rolls back the half-built `Report` row, logs loudly (`logger.exception`, includes how many signals are pending), and re-raises. Net effect: the *next* run (whether the next scheduled one or a manual "Run Now") automatically recovers and reports on whatever was lost, with no duplicate-signal risk, instead of losing it forever. Verified via a read-only dry-run of the new query directly against the live DB (compiles and executes correctly) and by re-importing `backend.main` cleanly; not re-verified through a fresh live failure-and-recovery cycle end-to-end (would require deliberately breaking Supabase Storage or Groq mid-run to reproduce the original failure, which the original bug was caught by transient real-world conditions rather than a repeatable trigger). |

</details>

## Authenticated — Report page + chat

<details>
<summary>Report rendering</summary>

| Scenario | Status | Notes |
|---|---|---|
| Executive summary, signals-by-category/competitor charts | ✅ Pass | Genuinely high-quality, specific LLM output (real $ figures, real product names) |
| Signal cards (What we found / Why it matters / Suggested response) | ✅ Pass | All 13 baseline signals render correctly with priority badges |
| Raw diff expand/collapse | ⚪ Untestable with this data | All signals are BASELINE (first-ever run has no old snapshot to diff against) — by design, not a bug |

</details>

<details>
<summary>Report-scoped chat — found and fixed a real, deterministic bug</summary>

| Scenario | Status | Notes |
|---|---|---|
| Empty message submit | ✅ Pass | No-ops correctly, no error |
| Ask a real question | ❌→✅ **Bug found, root-caused, and fixed** | See below |

**Bug:** every single chat attempt on this report failed with "Sorry, something went wrong answering that." — not intermittent, 100% reproducible.

**Root cause (confirmed via direct reproduction):** `backend/chat/qa.py`'s `build_report_system_prompt` includes every signal in the report with up to 800 chars of old+new snapshot content each, unbounded. This report's 13 signals (several with long community/news content) produced a 38,524-char (~8,548-token) system prompt, exceeding Groq's `openai/gpt-oss-120b` on-demand tier limit of 8,000 TPM — confirmed via direct `openai.APIStatusError: 413 ... tokens per minute (TPM): Limit 8000, Requested 8548`. This isn't transient — it fails identically on every retry for any report with a similar signal load, silently (`_stream_chat_answer`'s except-branch yields a generic message into the already-200 stream, so the frontend has no way to distinguish this from a real transient error).

**Fix applied** (`backend/chat/qa.py`): added `MAX_SIGNALS_BLOCK_CHARS = 12_000` hard cap on the assembled signals block in `build_report_system_prompt`, truncating with a note if exceeded. Reduced this report's prompt from 38,524 → 13,858 chars. Verified fixed three ways: (1) direct Python reproduction of the full call succeeds and returns a correct answer, (2) direct HTTP call to `backend`'s `/chat/report/{id}` endpoint succeeds, (3) confirmed working end-to-end through the actual browser UI after the dev server's `--reload` picked up the change.

**Known trade-off from the fix, not further addressed:** the hard truncation can cut off legitimate signals that fall past the character budget. Observed once: after the fix, asking "What did the community signal about Asana say?" got "The report does not include any community signal about Asana" — incorrect, there is one, it's just far enough into the signal list to have been truncated out for this test. A smarter fix (prioritize by priority/recency rather than truncating in list order, or use a real tokenizer-based budget) would close this gap; not attempted here to keep the fix minimal and in-scope for a QA pass.

**Side finding, not fixed:** every failed chat attempt persists the user's question to `chat_messages` but never an assistant reply (correct behavior — no fake answer is saved), but this does mean a report chat that fails repeatedly accumulates orphaned user-only turns in its history forever with no cleanup. Not a crash risk (verified Groq tolerates consecutive same-role history messages fine) but worth a look for chat-history hygiene.

**Side finding, not fixed:** occasional ` ` (narrow no-break space) / `�` (replacement character) corruption spotted in streamed answer text around smart quotes/spaces — appears to be a chunk-boundary UTF-8 decoding issue somewhere in the Groq streaming client, not this app's own code. Cosmetic, rare, not investigated further.

</details>

<details>
<summary>Report sharing</summary>

| Scenario | Status | Notes |
|---|---|---|
| Toggle Private → Public | ✅ Pass | Badge updates live, no reload needed |
| Invite by email | ✅ Pass | Added to list with a working "remove" link |
| Toggle back to Private | ✅ Pass | |

</details>

## Authenticated — Custom widgets, notifications, edge-case URLs

<details>
<summary>Custom dashboard widget builder</summary>

| Scenario | Status | Notes |
|---|---|---|
| Add widget (company + 2 competitors toggle-picked + display mode + title) | ✅ Pass | Renders real signal content immediately |
| Persistence after full page reload | ✅ Pass | Widget and its content survive a fresh navigation |
| Pre-existing widget (real user's own, untouched) | ✅ Pass | Confirmed not to interfere with or get overwritten by the new one |

</details>

<details>
<summary>Notifications page</summary>

| Scenario | Status | Notes |
|---|---|---|
| Stat tiles (Last 7 days / High priority / Total shown) | ✅ Pass | Correct real counts |
| Signal feed with source attribution + relative timestamps | ✅ Pass | |
| Bell badge count clears after visiting the page | ✅ Pass | Went from 21 → cleared |

</details>

<details>
<summary>Edge-case URLs</summary>

| Scenario | Status | Notes |
|---|---|---|
| `/company/<all-zero UUID>` (doesn't exist) | ✅ Pass | Clean Next.js 404, no crash |
| `/report/<all-zero UUID>` (doesn't exist) | ✅ Pass | Handled by the same RLS-based "Not shared with you" message used for a real-but-private report. Slightly imprecise copy for a genuinely nonexistent report vs. one that exists but is private, but safe (no data leak, no crash) — not fixed, purely cosmetic |

</details>

## Cleanup — Delete-company flow, and one more real bug found in the process

<details>
<summary>Delete company (test cleanup, doubles as a real test)</summary>

| Scenario | Status | Notes |
|---|---|---|
| Delete-confirm banner shows the real company name | ✅ Pass | ("Delete Linear? This removes...") — contrast with the earlier whitespace-name bug where this showed "Delete ? This removes..." |
| Confirm delete | ✅ Pass | Redirects cleanly to dashboard |
| Cascade: `target_companies`, `competitors`, `dashboard_widgets`, `reports` | ✅ Pass | Verified 0 rows remaining in all four for the deleted company, directly against the live DB |
| Cascade: `chat_messages` | ❌ **Bug found, root-caused, and fixed** | See below |

**Bug:** deleting the company (and its cascade-deleted report) left 6 orphaned `chat_messages` rows behind — the `ON DELETE CASCADE` FK chain doesn't reach `chat_messages` since its `subject_id` is polymorphic (points at either `reports` or `target_companies` depending on `scope`, so it can't be a real FK). Two dedicated AFTER-DELETE triggers (`trg_delete_chat_messages_for_company`/`_for_report`, added this same session for the chat feature) exist specifically to cover this gap — but had never been exercised end-to-end before this QA pass.

**Root cause:** both trigger functions were declared without `SECURITY DEFINER`, so they ran as `SECURITY INVOKER` — the privileges of whoever triggered the parent DELETE. `chat_messages` has RLS enabled with only a SELECT policy (no DELETE policy), so the trigger's internal `DELETE FROM chat_messages WHERE ...` silently matched zero rows under RLS every time the parent delete came through the app's normal owner-authenticated path (i.e. every real delete). No error — just silent, permanent orphaning. Confirmed by checking `pg_trigger` (both triggers present and enabled) and `pg_proc.prosecdef` (both `false` before the fix).

**Fix applied** (`infra/sql/schema.sql` + applied live): added `SECURITY DEFINER SET search_path = public` to both functions — the exact same pattern this schema already uses for `is_report_shared_with_me()` to solve the identical class of problem. Verified via `pg_proc.prosecdef` now `true` for both, matching the known-working reference function. The 6 orphaned rows from this test session were cleaned up manually as a one-time fix (not something the trigger itself needed to do, since their parent rows were already gone).

</details>


