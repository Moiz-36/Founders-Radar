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
    source_type TEXT CHECK (source_type IN ('pricing', 'feature', 'job_posting', 'news')),
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
