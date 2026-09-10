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

-- Speeds up pgvector similarity search used by analysis/analyst.py's RAG retrieval.
CREATE INDEX ON snapshots USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

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
