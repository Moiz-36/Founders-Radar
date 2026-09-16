-- Founder's Radar database schema (Supabase / Postgres + pgvector)
-- Matches backend/db/models.py. Run once against a fresh Supabase project.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE target_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_company_id UUID REFERENCES target_companies(id),
    name TEXT NOT NULL,
    website TEXT
);

CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES competitors(id),
    source_type TEXT CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community')),
    url TEXT NOT NULL,
    last_content_hash TEXT,
    last_checked_at TIMESTAMPTZ
);

CREATE TABLE snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id),
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    embedding VECTOR(384),  -- local sentence-transformers all-MiniLM-L6-v2 (see backend/detection/change_detector.py)
    fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id),
    old_snapshot_id UUID REFERENCES snapshots(id),
    new_snapshot_id UUID REFERENCES snapshots(id),
    similarity_score FLOAT,
    what_changed TEXT,
    why_it_matters TEXT,
    suggested_response TEXT,
    priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
    validated BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_company_id UUID REFERENCES target_companies(id),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    headline TEXT,
    executive_summary TEXT,
    signal_ids UUID[],
    chart_data JSONB,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- No approximate index (ivfflat/HNSW) on `embedding` for now — an ivfflat index built with a
-- `lists` count sized for a large table (the original `lists = 100` here) badly under-recalls
-- on a small one: with only a handful of rows spread across 100 near-empty clusters, similarity
-- search silently returned ZERO matches for every query (found 2026-09-15 debugging
-- backend/chat/qa.py's company-scoped chat — the same bug was already silently starving
-- analysis/analyst.py's retrieve_related_context() of its "related historical context" input).
-- A plain sequential scan is exact and effectively free at current row counts (verified:
-- `SET enable_indexscan = off` immediately fixed retrieval). Add an ivfflat/HNSW index back
-- once `snapshots` has enough rows (thousands+) for an approximate index to actually pay off —
-- size `lists` to roughly sqrt(row count) at that point, not a fixed guess.

-- The frontend reads reports/signals with the public anon key (see docs/07-frontend.md) —
-- Supabase enables RLS by default with zero policies, which silently returns no rows
-- rather than erroring. Single-user portfolio project, no sensitive data, so a public
-- read-only policy is enough; all writes go through the pipeline's direct DB connection
-- (DATABASE_URL), not the anon key, so anon gets SELECT only.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read access" ON reports FOR SELECT USING (true);
CREATE POLICY "public read access" ON signals FOR SELECT USING (true);

-- v2 multi-tenancy (docs/09-v2-plan.md, Phase 1). Run against the existing live project —
-- this file stays append-only/cumulative rather than a separate migrations folder, matching
-- how the RLS section above was added.

ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE sources ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'broken', 'needs_review'));

-- reports/signals deliberately KEEP the public-read policy above — a report link is meant to
-- be shareable without an account (and this is how the ComplyDo pilot report stays viewable
-- as a portfolio demo, since it has no owner). Only the account-management surface
-- (target_companies/competitors/sources: who tracks what) is owner-scoped, since that reveals
-- a user's competitive-intelligence strategy and must not be readable or writable by others.
ALTER TABLE target_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner full access" ON target_companies;
CREATE POLICY "owner full access" ON target_companies
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "owner full access" ON competitors;
CREATE POLICY "owner full access" ON competitors
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM target_companies tc
            WHERE tc.id = competitors.target_company_id AND tc.owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM target_companies tc
            WHERE tc.id = competitors.target_company_id AND tc.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "owner full access" ON sources;
CREATE POLICY "owner full access" ON sources
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM competitors c
            JOIN target_companies tc ON tc.id = c.target_company_id
            WHERE c.id = sources.competitor_id AND tc.owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM competitors c
            JOIN target_companies tc ON tc.id = c.target_company_id
            WHERE c.id = sources.competitor_id AND tc.owner_id = auth.uid()
        )
    );

-- User-configurable report cadence (docs/09-v2-plan.md). Default 7 matches the original
-- hardcoded weekly schedule. See _is_report_due() in backend/main.py.
ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS report_interval_days INTEGER NOT NULL DEFAULT 7
    CHECK (report_interval_days > 0);

-- Marks the one-time "here's what we found" baseline summary generated the first time a
-- source is ever collected, instead of an empty first report. See summarize_baseline() in
-- backend/analysis/analyst.py.
ALTER TABLE signals ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT false;

-- snapshots already has RLS enabled (Supabase's default for new tables) but had zero
-- policies, meaning nobody could read it via the anon key — not a leak, but it also silently
-- blocked the "see what was actually captured" snapshot view added in docs/09-v2-plan.md.
-- Owner-scoped read, same join pattern as the sources policy above.
DROP POLICY IF EXISTS "owner read access" ON snapshots;
CREATE POLICY "owner read access" ON snapshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sources s
            JOIN competitors c ON c.id = s.competitor_id
            JOIN target_companies tc ON tc.id = c.target_company_id
            WHERE s.id = snapshots.source_id AND tc.owner_id = auth.uid()
        )
    );

-- Private bucket for rendered report PDFs (backend/report/storage.py). Not public: these are
-- per-tenant competitive-intelligence reports. The backend uploads and signs URLs using the
-- service role key, which bypasses RLS entirely, so no storage.objects policies are needed
-- here — only the service role can ever read/write this bucket directly.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

-- Account-holder profile info (company name, job title) collected at signup — not the
-- TargetCompany being tracked, which is a separate concept added later in the add-company
-- flow. Populated via a trigger on auth.users rather than an app-level insert after signUp(),
-- so it's filled in immediately even when email confirmation is pending (no session yet at
-- that point) and works the same for Google OAuth signups (no signup form at all there).
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name TEXT,
    job_title TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner full access" ON profiles;
CREATE POLICY "owner full access" ON profiles
    FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Uses $tag$ dollar-quoting throughout (function body AND the two JSON key literals) instead
-- of single quotes — copy-pasting this through a chat UI/terminal previously mangled straight
-- quotes into smart quotes, breaking the string literal. Dollar-quoting has nothing to corrupt.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $func$
BEGIN
    INSERT INTO public.profiles (id, company_name, job_title)
    VALUES (
        new.id,
        new.raw_user_meta_data->>$$company_name$$,
        new.raw_user_meta_data->>$$job_title$$
    );
    RETURN new;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Custom dashboard (widget builder): a user picks a company, optionally narrows to one
-- competitor and/or one signal type, and a display mode — the widget then pulls live from
-- the same signals/sources data the company page already shows, just filtered/aggregated
-- differently. Unlike reports/signals, this table stores owner_id directly (like
-- target_companies) since a widget has no existing owner-scoped parent row to join through.
CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    target_company_id UUID NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,
    -- NULL = "all competitors" for this company. ON DELETE SET NULL rather than CASCADE:
    -- removing one competitor shouldn't delete a widget that also covers its siblings.
    competitor_id UUID REFERENCES competitors(id) ON DELETE SET NULL,
    -- NULL = "all signal types".
    source_type TEXT CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community')),
    display TEXT NOT NULL CHECK (display IN ('feed', 'bar', 'line')),
    title TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner full access" ON dashboard_widgets;
CREATE POLICY "owner full access" ON dashboard_widgets
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Report sharing (Google-Drive style): a report is private by default (owner only); the
-- owner can flip it public (anyone with the link) or invite specific people by email. This
-- replaces the old "public read access using (true)" policy on reports/signals, which made
-- every report world-readable via the anon key regardless of link possession — harmless for
-- the single-tenant ComplyDo pilot, a real gap once real users' competitive data is at stake.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public'));

-- Backfill: the ComplyDo pilot report has no owner (owner_id IS NULL on its target_company)
-- and must stay viewable as a public portfolio demo; every other existing report defaults
-- to private, matching a real tenant's expectation that their competitive intel isn't public.
UPDATE reports SET visibility = 'public'
WHERE target_company_id IN (SELECT id FROM target_companies WHERE owner_id IS NULL);

CREATE TABLE IF NOT EXISTS report_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (report_id, email)
);

-- SECURITY DEFINER: called by the reports/signals policies below instead of querying
-- report_shares inline. A policy's subquery runs as the CURRENT viewer, and report_shares is
-- locked to the report's owner (policy further down) — an invited (non-owner) viewer has no
-- SELECT grant on report_shares, so an inline EXISTS against it would silently evaluate to
-- false for exactly the person it's supposed to admit. This function runs with its owner's
-- privileges, bypassing that restriction internally, and only ever returns a boolean — it
-- never exposes the invite list itself to the caller.
CREATE OR REPLACE FUNCTION is_report_shared_with_me(target_report_id UUID)
RETURNS BOOLEAN AS $func$
    SELECT EXISTS (
        SELECT 1 FROM report_shares
        WHERE report_id = target_report_id
        AND lower(email) = lower(auth.jwt()->>'email')
    );
$func$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report owner manages shares" ON report_shares;
CREATE POLICY "report owner manages shares" ON report_shares
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM reports r
            JOIN target_companies tc ON tc.id = r.target_company_id
            WHERE r.id = report_shares.report_id AND tc.owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM reports r
            JOIN target_companies tc ON tc.id = r.target_company_id
            WHERE r.id = report_shares.report_id AND tc.owner_id = auth.uid()
        )
    );

-- Two permissive SELECT policies on reports (Postgres ORs them): the owner always sees their
-- own reports; everyone else needs the report to be public or themselves invited.
DROP POLICY IF EXISTS "public read access" ON reports;

DROP POLICY IF EXISTS "owner read access" ON reports;
CREATE POLICY "owner read access" ON reports
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM target_companies tc WHERE tc.id = reports.target_company_id AND tc.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "shared read access" ON reports;
CREATE POLICY "shared read access" ON reports
    FOR SELECT USING (
        visibility = 'public' OR is_report_shared_with_me(reports.id)
    );

-- Needed so the owner can toggle visibility (and, later, other report fields) from the
-- frontend via the anon key + session — previously reports had no UPDATE policy at all since
-- every write went through the pipeline's direct DATABASE_URL connection, which bypasses RLS.
DROP POLICY IF EXISTS "owner can update report" ON reports;
CREATE POLICY "owner can update report" ON reports
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM target_companies tc WHERE tc.id = reports.target_company_id AND tc.owner_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM target_companies tc WHERE tc.id = reports.target_company_id AND tc.owner_id = auth.uid())
    );

-- signals: same shape as reports above, but ownership is reached through
-- sources -> competitors -> target_companies (signals have no owner_id of their own — same
-- join the existing snapshots "owner read access" policy already uses), and the
-- "visible via a shared report" check looks up which report(s) bundle this signal via
-- reports.signal_ids (an array of signal ids, not a foreign key on signals).
DROP POLICY IF EXISTS "public read access" ON signals;

DROP POLICY IF EXISTS "owner read access" ON signals;
CREATE POLICY "owner read access" ON signals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sources s
            JOIN competitors c ON c.id = s.competitor_id
            JOIN target_companies tc ON tc.id = c.target_company_id
            WHERE s.id = signals.source_id AND tc.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "shared read access" ON signals;
CREATE POLICY "shared read access" ON signals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reports r
            WHERE r.signal_ids @> ARRAY[signals.id]
            AND (r.visibility = 'public' OR is_report_shared_with_me(r.id))
        )
    );

-- Social/community signal tracking (docs/10-competitive-feature-research.md, quick win #5):
-- a new source_type scanning HN + Reddit for buying-intent chatter about a competitor
-- ("alternative to X", "switching from X"), via backend/collectors/community_collector.py.
-- The two CHECK constraints that enumerate source types were created inline (unnamed) above,
-- so Postgres auto-named them — drop by the generated name and recreate with 'community' added.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_source_type_check
    CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community'));

ALTER TABLE dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_source_type_check;
ALTER TABLE dashboard_widgets ADD CONSTRAINT dashboard_widgets_source_type_check
    CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community'));

-- Review-site monitoring (docs/10-competitive-feature-research.md quick win #1): a new
-- source_type for a competitor's G2/Capterra/Trustpilot profile page, via
-- backend/collectors/review_collector.py.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_source_type_check
    CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community', 'review'));

ALTER TABLE dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_source_type_check;
ALTER TABLE dashboard_widgets ADD CONSTRAINT dashboard_widgets_source_type_check
    CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community', 'review'));

-- Raw diff view (docs/10-competitive-feature-research.md quick win #2): the report page shows
-- a signal's old/new snapshot content next to the LLM summary. snapshots previously had only
-- the owner-scoped "owner read access" policy above, which would silently return nothing for
-- anyone viewing a report via a public link or an email invite — the same class of RLS gap
-- docs/decisions.md's 2026-09-10 entry already found and fixed once for reports/signals, so
-- fixed the same way here rather than repeat it: mirror signals' "shared read access" policy,
-- reached via the signal that references this snapshot as its old or new side.
DROP POLICY IF EXISTS "shared read access" ON snapshots;
CREATE POLICY "shared read access" ON snapshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM signals sig
            JOIN reports r ON r.signal_ids @> ARRAY[sig.id]
            WHERE (sig.old_snapshot_id = snapshots.id OR sig.new_snapshot_id = snapshots.id)
            AND (r.visibility = 'public' OR is_report_shared_with_me(r.id))
        )
    );

-- Widget Studio expansion (2026-09-14, user request): more than a feed/bar/line choice, and
-- an explicit "what to break the chart down by" control instead of the old implicit rule
-- (frontend/components/WidgetCard.tsx used to always group by source_type when a single
-- competitor was picked, else by competitor — group_by makes that a real, visible choice).
-- `display`'s CHECK constraint was created inline (unnamed) in the original CREATE TABLE, so
-- Postgres auto-named it — drop by the generated name and recreate with the wider set.
ALTER TABLE dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_display_check;
ALTER TABLE dashboard_widgets ADD CONSTRAINT dashboard_widgets_display_check
    CHECK (display IN ('feed', 'bar', 'column', 'line', 'area', 'stacked_bar', 'donut', 'table', 'stat', 'heatmap', 'sparklines'));

-- NULL = auto (mirrors the old implicit rule, for any widget row saved before this column
-- existed): source_type when scoped to one competitor, competitor otherwise.
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS group_by TEXT
    CHECK (group_by IN ('competitor', 'source_type', 'priority', 'week'));

-- "General / full overview" source type (user request, 2026-09-14): a catch-all source for
-- founders who want the whole competitor tracked, not one specific page category — same
-- generic whole-page-text collector as pricing/feature (backend/collectors/general_collector.py),
-- left for the analyst LLM to describe whatever actually changed rather than being scoped to
-- one topic.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_source_type_check
    CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community', 'review', 'general'));

ALTER TABLE dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_source_type_check;
ALTER TABLE dashboard_widgets ADD CONSTRAINT dashboard_widgets_source_type_check
    CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news', 'community', 'review', 'general'));

-- Optional "track my own company too" (user request, 2026-09-14): a competitor row can
-- represent the target company itself rather than an actual competitor — same pipeline,
-- same sources/signals shape, purely a UI-facing flag (a "Your company" badge, and a
-- distinguishable entry in the widget comparison picker) so it never gets confused for a
-- real threat in report language. Opt-in per company; most rows stay false.
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT false;

-- Multi-competitor comparison widgets (user request, 2026-09-14): a widget used to scope to
-- exactly one competitor (or all). competitor_ids lets it scope to a hand-picked set (e.g.
-- "my own company" + "Competitor 1" + "Competitor 2") for real side-by-side comparison charts.
-- NULL/empty = all competitors, same as before. The old singular `competitor_id` column is
-- left as-is for any pre-existing rows; new widgets are written via competitor_ids only.
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS competitor_ids UUID[];

-- Delete-company support (user request, 2026-09-14): none of these FKs cascaded (only
-- dashboard_widgets did, from the original schema), so deleting a target_company row failed
-- with a foreign-key violation the moment it had any competitors/reports. Widened the whole
-- chain so one delete on target_companies actually removes everything under it. Constraint
-- names below are Postgres's own default naming (`<table>_<column>_fkey`) for the inline
-- REFERENCES clauses in the original CREATE TABLE statements — dropped and recreated the
-- same way the CHECK-constraint migrations above do.
ALTER TABLE competitors DROP CONSTRAINT IF EXISTS competitors_target_company_id_fkey;
ALTER TABLE competitors ADD CONSTRAINT competitors_target_company_id_fkey
    FOREIGN KEY (target_company_id) REFERENCES target_companies(id) ON DELETE CASCADE;

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_competitor_id_fkey;
ALTER TABLE sources ADD CONSTRAINT sources_competitor_id_fkey
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE;

ALTER TABLE snapshots DROP CONSTRAINT IF EXISTS snapshots_source_id_fkey;
ALTER TABLE snapshots ADD CONSTRAINT snapshots_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_id_fkey;
ALTER TABLE signals ADD CONSTRAINT signals_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;

-- old/new snapshot references: SET NULL rather than CASCADE. A signal's own row is already
-- removed via the source_id cascade above whenever its source goes away, so this only matters
-- if a snapshot is ever deleted independently of its signal — not something the app does
-- today, but SET NULL is the semantically correct default regardless: losing a snapshot
-- shouldn't be able to cascade-delete a signal that merely references it.
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_old_snapshot_id_fkey;
ALTER TABLE signals ADD CONSTRAINT signals_old_snapshot_id_fkey
    FOREIGN KEY (old_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL;

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_new_snapshot_id_fkey;
ALTER TABLE signals ADD CONSTRAINT signals_new_snapshot_id_fkey
    FOREIGN KEY (new_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_company_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_target_company_id_fkey
    FOREIGN KEY (target_company_id) REFERENCES target_companies(id) ON DELETE CASCADE;
-- report_shares already cascades off reports.id (see its own CREATE TABLE above), so this
-- chain reaches it transitively — no separate change needed there.

-- Chat history persistence (Phase 3 of the chat feature, 2026-09-15): survives a page refresh
-- and gives the rate limit below something durable to count. `subject_id` is a report_id or a
-- target_company_id depending on `scope` — not a real FK, since it points to two different
-- tables, same tradeoff docs/decisions.md already accepted for other polymorphic-ish lookups.
-- Only the backend (its own DATABASE_URL connection, bypassing RLS — same as how it writes
-- reports/signals) ever INSERTs here; the RLS policy below only needs to cover SELECT.
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL CHECK (scope IN ('report', 'company')),
    subject_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON chat_messages (scope, subject_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Mirrors each scope's own visibility rule exactly: report scope reuses the owner/shared/public
-- check from reports' and snapshots' own policies (see is_report_shared_with_me above); company
-- scope reuses target_companies' owner-only rule (no sharing for companies).
CREATE POLICY "owner or shared read access" ON chat_messages
    FOR SELECT USING (
        (scope = 'report' AND EXISTS (
            SELECT 1 FROM reports r
            JOIN target_companies tc ON tc.id = r.target_company_id
            WHERE r.id = chat_messages.subject_id
            AND (r.visibility = 'public' OR is_report_shared_with_me(r.id) OR tc.owner_id = auth.uid())
        ))
        OR
        (scope = 'company' AND EXISTS (
            SELECT 1 FROM target_companies tc
            WHERE tc.id = chat_messages.subject_id AND tc.owner_id = auth.uid()
        ))
    );

-- chat_messages.subject_id isn't a real FK (it points to reports OR target_companies
-- depending on scope — can't be one column with one FK), so the ON DELETE CASCADE chain above
-- never reaches it: deleting a company/report used to leave its chat history behind as orphan
-- rows forever (found 2026-09-15, right after shipping chat persistence). Triggers close that
-- gap the same way the FK cascades close it for every other table, regardless of whether the
-- delete comes from the frontend's direct Supabase call (DeleteCompanyButton.tsx) or anywhere else.
-- Bug found in QA (2026-09-15): these two functions were originally declared without SECURITY
-- DEFINER, so they ran as SECURITY INVOKER — the privileges of whoever triggered the parent
-- DELETE. Since chat_messages has RLS enabled with only a SELECT policy (no DELETE policy), the
-- DELETE inside each trigger silently matched zero rows under RLS whenever the parent delete came
-- through the normal owner-authenticated/anon-key path (i.e. every real delete from the app) —
-- no error, just orphaned rows left behind forever. Same class of bypass-RLS-internally problem
-- is_report_shared_with_me() above already had to solve; fixed the same way.
CREATE OR REPLACE FUNCTION delete_chat_messages_for_company() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM chat_messages WHERE scope = 'company' AND subject_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_delete_chat_messages_for_company ON target_companies;
CREATE TRIGGER trg_delete_chat_messages_for_company
    AFTER DELETE ON target_companies
    FOR EACH ROW EXECUTE FUNCTION delete_chat_messages_for_company();

CREATE OR REPLACE FUNCTION delete_chat_messages_for_report() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM chat_messages WHERE scope = 'report' AND subject_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_delete_chat_messages_for_report ON reports;
CREATE TRIGGER trg_delete_chat_messages_for_report
    AFTER DELETE ON reports
    FOR EACH ROW EXECUTE FUNCTION delete_chat_messages_for_report();
