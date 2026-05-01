# Dorfkoenig Database Schema

## Overview

PostgreSQL database with pgvector extension for semantic search and deduplication. All tables use Row Level Security (RLS) with user-scoped policies.

## Required Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS "pg_cron";     -- Scheduled jobs
CREATE EXTENSION IF NOT EXISTS "pg_net";      -- HTTP calls from SQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
```

## Tables

### 1. scouts

Stores web scout configurations for URL monitoring.

```sql
CREATE TABLE scouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,

    -- Configuration
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    criteria TEXT NOT NULL,

    -- Location (from MapTiler)
    location JSONB,
    -- Example: {
    --   "city": "Berlin",
    --   "state": "Berlin",
    --   "country": "Germany",
    --   "latitude": 52.52,
    --   "longitude": 13.405
    -- }

    -- Topic (comma-separated, e.g. "Stadtentwicklung, Verkehr")
    -- At least one of location or topic is required
    topic TEXT,

    -- Scheduling
    frequency TEXT NOT NULL DEFAULT 'daily',
    -- Values: 'daily' | 'weekly' | 'monthly'

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,

    -- Email notification
    notification_email TEXT,

    -- Provider detection (set by double-probe on first test)
    provider TEXT,
    -- Values: 'firecrawl' (baseline persisted, use changeTracking) |
    --         'firecrawl_plain' (baseline dropped, use hash comparison)

    -- Content hash for hash-based change detection (firecrawl_plain provider)
    content_hash TEXT,
    -- SHA-256 of normalized markdown content

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_frequency CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
    CONSTRAINT valid_url CHECK (url ~ '^https?://'),
    CONSTRAINT scouts_criteria_length CHECK (char_length(criteria) <= 1000)
);

-- Indexes
CREATE INDEX idx_scouts_user_id ON scouts(user_id);
CREATE INDEX idx_scouts_user_active ON scouts(user_id, is_active);
CREATE INDEX idx_scouts_next_run ON scouts(is_active, last_run_at, frequency)
    WHERE is_active = true AND consecutive_failures < 3;
```

### 2. scout_executions

Records individual scout execution runs with deduplication embeddings.

```sql
CREATE TABLE scout_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,

    -- Execution status
    status TEXT NOT NULL DEFAULT 'running',
    -- Values: 'running' | 'completed' | 'failed'

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Results
    change_status TEXT,
    -- Values: 'changed' | 'same' | 'error' | 'first_run'

    criteria_matched BOOLEAN,

    -- Summary for deduplication
    summary_text TEXT,
    -- Max 150 chars, German, one sentence

    summary_embedding vector(1536),
    -- OpenAI text-embedding-3-small

    -- Deduplication
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_similarity REAL,
    -- Cosine similarity if duplicate (>= 0.85)

    -- Notification
    notification_sent BOOLEAN DEFAULT false,
    notification_error TEXT,

    -- Error tracking
    error_message TEXT,

    -- Metadata
    units_extracted INTEGER DEFAULT 0,
    scrape_duration_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('running', 'completed', 'failed')),
    CONSTRAINT valid_change_status CHECK (
        change_status IS NULL OR
        change_status IN ('changed', 'same', 'error', 'first_run')
    )
);

-- Indexes
CREATE INDEX idx_executions_scout ON scout_executions(scout_id);
CREATE INDEX idx_executions_user ON scout_executions(user_id);
CREATE INDEX idx_executions_created ON scout_executions(created_at DESC);
CREATE INDEX idx_executions_scout_recent ON scout_executions(scout_id, created_at DESC)
    WHERE status = 'completed';

-- HNSW index for vector similarity search (deduplication)
CREATE INDEX idx_executions_embedding ON scout_executions
    USING hnsw (summary_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### 3. information_units

Atomic facts extracted from scout results for the Compose panel.

```sql
CREATE TABLE information_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    scout_id UUID REFERENCES scouts(id) ON DELETE CASCADE,       -- nullable for manual uploads
    execution_id UUID REFERENCES scout_executions(id) ON DELETE CASCADE,  -- nullable for manual uploads

    -- Content
    statement TEXT NOT NULL,
    -- Atomic fact in German, complete sentence

    unit_type TEXT NOT NULL DEFAULT 'fact',
    -- Values: 'fact' | 'event' | 'entity_update'

    -- Entities mentioned
    entities TEXT[] DEFAULT '{}',
    -- Example: ['Angela Merkel', 'Berlin', 'CDU']

    -- Source
    source_url TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    source_title TEXT,

    -- Source type discriminator
    source_type TEXT NOT NULL DEFAULT 'scout',
    -- Values: 'scout' | 'manual_text' | 'manual_photo' | 'manual_pdf'

    -- File storage reference (for manual photo/PDF uploads)
    file_path TEXT,

    -- Location (inherited from scout)
    location JSONB,

    -- Topic (inherited from scout, comma-separated)
    topic TEXT,

    -- Event date (extracted by LLM)
    event_date DATE,

    -- Embedding for semantic search
    embedding vector(1536) NOT NULL,

    -- Usage tracking
    used_in_article BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),

    -- Constraints
    CONSTRAINT valid_unit_type CHECK (unit_type IN ('fact', 'event', 'entity_update')),
    CONSTRAINT valid_source_type CHECK (source_type IN ('scout', 'manual_text', 'manual_photo', 'manual_pdf')),
    CONSTRAINT valid_source_url CHECK (source_url ~ '^(https?://|manual://)'),
    CONSTRAINT file_path_length CHECK (file_path IS NULL OR char_length(file_path) <= 500)
);

-- Indexes
CREATE INDEX idx_units_user ON information_units(user_id);
CREATE INDEX idx_units_scout ON information_units(scout_id);
CREATE INDEX idx_units_execution ON information_units(execution_id);
CREATE INDEX idx_units_created ON information_units(created_at DESC);
CREATE INDEX idx_units_unused ON information_units(user_id, used_in_article, created_at DESC)
    WHERE used_in_article = false;
CREATE INDEX idx_units_location ON information_units USING GIN (location);

-- HNSW index for semantic search
CREATE INDEX idx_units_embedding ON information_units
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Partial index for location-based queries
CREATE INDEX idx_units_location_city ON information_units(
    user_id,
    (location->>'city'),
    created_at DESC
) WHERE location IS NOT NULL;
```

### 3a. Canonical Fact Layer (migration `20260423150000_canonical_unit_occurrences.sql`)

The original `information_units` table now acts as the canonical fact table per user.

- New canonical rollup columns on `information_units`:
  - `first_seen_at`
  - `last_seen_at`
  - `occurrence_count`
  - `source_count`
  - `context_excerpt`
- `unit_type` now also permits `'promise'`
- Legacy `scout_id` / `execution_id` remain for transition reads, but their foreign keys are `ON DELETE SET NULL`; scout scoping now resolves through provenance, not canonical origin.

New provenance table:

```sql
CREATE TABLE unit_occurrences (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES information_units(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    scout_id UUID NULL REFERENCES scouts(id) ON DELETE CASCADE,
    execution_id UUID NULL REFERENCES scout_executions(id) ON DELETE CASCADE,
    -- Set when the occurrence originates from an external published draft
    -- (migration 20260426000000); joined against bajour_drafts.published_at
    -- for the soft-dedup signal in bajour-auto-draft selection.
    draft_id UUID NULL REFERENCES bajour_drafts(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    normalized_source_url TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    source_title TEXT,
    source_type TEXT NOT NULL DEFAULT 'scout',
    file_path TEXT,
    article_url TEXT,
    content_sha256 TEXT,
    statement_hash TEXT NOT NULL,
    context_excerpt TEXT,
    entities TEXT[] NOT NULL DEFAULT '{}'::text[],
    event_date DATE,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Key indexes:

- `(unit_id, extracted_at DESC)`
- `(scout_id, extracted_at DESC)`
- `(execution_id, extracted_at DESC)`
- `(user_id, normalized_source_url)`
- `(user_id, content_sha256)` partial where not null
- `(user_id, statement_hash)`
- unique raw-capture guard on `(user_id, scout_id, execution_id, normalized_source_url, content_sha256, statement_hash)`

Canonical write path:

```sql
upsert_canonical_unit(
  p_user_id,
  p_statement,
  p_unit_type,
  p_source_url,
  p_embedding,
  ...
)
```

The RPC is the only creation path for canonical facts. Matching order:

1. same-scout exact checks (`normalized_source_url`, `content_sha256`, `statement_hash`)
2. exact cross-scout checks across the user corpus
3. semantic match against canonical `information_units` only

Merge thresholds:

- merge at cosine `>= 0.93`
- or merge at cosine `>= 0.88` plus one anchor:
  - same normalized source domain
  - event dates within 7 days
  - shared entity string

On merge, the RPC appends a `unit_occurrences` row and updates canonical rollups without overwriting verification / usage state.

`promises` also gained `unit_id UUID NULL REFERENCES information_units(id) ON DELETE SET NULL`, so civic promises no longer form a separate dedup universe.

### 3b. External Drafts + Soft Dedup (migration `20260426000000_external_drafts_and_dedup.sql`)

Layered on top of 3a. Introduces a "the draft was actually published" signal so subsequent auto-drafts can soft-suppress repetition.

- `bajour_drafts.provider TEXT NOT NULL DEFAULT 'auto' CHECK (provider IN ('auto','external'))` — distinguishes auto-pipeline drafts from drafts pasted in by an editor as the actually-published version.
- `bajour_drafts.published_at TIMESTAMPTZ NULL` — set when the draft is confirmed sent. Today the `bajour-drafts` POST handler sets this when `provider='external'`; long-term an external API webhook will set it on auto drafts too.
- `unit_occurrences.draft_id UUID NULL REFERENCES bajour_drafts(id) ON DELETE SET NULL` — the load-bearing piece for the dedup join. Without it, the lookup falls back to array-contains scans on `bajour_drafts.selected_unit_ids`.
- `upsert_canonical_unit` recreated with a trailing `p_draft_id UUID DEFAULT NULL` parameter that flows into the `unit_occurrences` INSERT. Existing call sites are unaffected (default NULL).

Indexes:

- `idx_bajour_drafts_published_village ON bajour_drafts (village_id, published_at DESC) WHERE published_at IS NOT NULL` — partial index for the per-village dedup-window scan.
- `idx_unit_occurrences_draft_id ON unit_occurrences (draft_id) WHERE draft_id IS NOT NULL` — supports the EXISTS join.

The selection-time dedup query lives in `bajour-auto-draft` and is the EXISTS-form below. It MUST go through `unit_occurrences`, not a derived flag on `information_units`, because canonical merges would silently overwrite cached state:

```sql
EXISTS (
  SELECT 1 FROM unit_occurrences uo
  JOIN bajour_drafts bd ON bd.id = uo.draft_id
  WHERE uo.unit_id = $candidate_id
    AND bd.village_id = $village_id
    AND bd.published_at > now() - interval '14 days'
)
```

The matched candidate gains a `PUBLISHED:YYYY-MM-DD` token in the LLM selection prompt; the prompt rule asks the model to skip unless there's a substantive update.

## Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE scouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE information_units ENABLE ROW LEVEL SECURITY;

-- Scouts policies
CREATE POLICY "Users can view their own scouts"
    ON scouts FOR SELECT
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can create their own scouts"
    ON scouts FOR INSERT
    WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can update their own scouts"
    ON scouts FOR UPDATE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can delete their own scouts"
    ON scouts FOR DELETE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Scout executions policies
CREATE POLICY "Users can view their own executions"
    ON scout_executions FOR SELECT
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Service role can manage executions"
    ON scout_executions FOR ALL
    USING (current_setting('role') = 'service_role');

-- Information units policies
CREATE POLICY "Users can view their own units"
    ON information_units FOR SELECT
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can update their own units"
    ON information_units FOR UPDATE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Service role can manage units"
    ON information_units FOR ALL
    USING (current_setting('role') = 'service_role');
```

## Database Functions

### 1. check_duplicate_execution

Checks if a new execution summary is a duplicate of recent executions.

```sql
CREATE OR REPLACE FUNCTION check_duplicate_execution(
    p_scout_id UUID,
    p_embedding vector(1536),
    p_threshold REAL DEFAULT 0.85,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    is_duplicate BOOLEAN,
    max_similarity REAL,
    similar_execution_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(MAX(1 - (summary_embedding <=> p_embedding)) >= p_threshold, false) AS is_duplicate,
        COALESCE(MAX(1 - (summary_embedding <=> p_embedding)), 0) AS max_similarity,
        (
            SELECT id FROM scout_executions
            WHERE scout_id = p_scout_id
              AND status = 'completed'
              AND summary_embedding IS NOT NULL
              AND created_at > NOW() - (p_lookback_days || ' days')::INTERVAL
            ORDER BY summary_embedding <=> p_embedding
            LIMIT 1
        ) AS similar_execution_id
    FROM scout_executions
    WHERE scout_id = p_scout_id
      AND status = 'completed'
      AND summary_embedding IS NOT NULL
      AND created_at > NOW() - (p_lookback_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;
```

### 2. search_units_semantic

Semantic search for information units in the Compose panel. Supports filtering by location city and/or topic.

```sql
CREATE OR REPLACE FUNCTION search_units_semantic(
    p_user_id TEXT,
    p_query_embedding vector(1536),
    p_location_city TEXT DEFAULT NULL,
    p_topic TEXT DEFAULT NULL,
    p_unused_only BOOLEAN DEFAULT true,
    p_min_similarity REAL DEFAULT 0.3,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    statement TEXT,
    unit_type TEXT,
    entities TEXT[],
    source_url TEXT,
    source_domain TEXT,
    source_title TEXT,
    location JSONB,
    topic TEXT,
    source_type TEXT,
    file_path TEXT,
    created_at TIMESTAMPTZ,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.statement,
        u.unit_type,
        u.entities,
        u.source_url,
        u.source_domain,
        u.source_title,
        u.location,
        u.topic,
        u.source_type,
        u.file_path,
        u.created_at,
        (1 - (u.embedding <=> p_query_embedding))::REAL AS similarity
    FROM information_units u
    WHERE u.user_id = p_user_id
      AND (p_location_city IS NULL OR u.location->>'city' = p_location_city)
      AND (p_topic IS NULL OR u.topic ILIKE '%' || replace(replace(p_topic, '%', '\%'), '_', '\_') || '%')
      AND (NOT p_unused_only OR u.used_in_article = false)
      AND (1 - (u.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY u.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

### 3. should_run_scout

Determines if a scout is due for execution based on frequency.

```sql
CREATE OR REPLACE FUNCTION should_run_scout(
    p_frequency TEXT,
    p_last_run_at TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
    hours_elapsed REAL;
    threshold_hours REAL;
BEGIN
    -- First run
    IF p_last_run_at IS NULL THEN
        RETURN true;
    END IF;

    hours_elapsed := EXTRACT(EPOCH FROM (NOW() - p_last_run_at)) / 3600;

    threshold_hours := CASE p_frequency
        WHEN 'daily' THEN 8
        WHEN 'weekly' THEN 168
        WHEN 'biweekly' THEN 336
        WHEN 'monthly' THEN 720
        ELSE 8
    END;

    RETURN hours_elapsed >= threshold_hours;
END;
$$ LANGUAGE plpgsql;
```

### 4. dispatch_due_scouts

Called by pg_cron to dispatch scouts that are due for execution.

```sql
CREATE OR REPLACE FUNCTION dispatch_due_scouts()
RETURNS INTEGER AS $$
DECLARE
    scout_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
BEGIN
    -- Get secrets from Vault
    SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets
    WHERE name = 'project_url';

    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    -- Find and dispatch due scouts
    FOR scout_record IN
        SELECT id, name, frequency, last_run_at
        FROM scouts
        WHERE is_active = true
          AND consecutive_failures < 3
          AND should_run_scout(frequency, last_run_at)
        ORDER BY last_run_at NULLS FIRST
        LIMIT 20
    LOOP
        -- Check for running execution
        IF EXISTS (
            SELECT 1 FROM scout_executions
            WHERE scout_id = scout_record.id
              AND status = 'running'
              AND started_at > NOW() - INTERVAL '10 minutes'
        ) THEN
            CONTINUE;
        END IF;

        -- Dispatch via pg_net
        PERFORM net.http_post(
            url := project_url || '/functions/v1/execute-scout',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object('scoutId', scout_record.id)
        );

        dispatched_count := dispatched_count + 1;

        -- Stagger dispatches (10 seconds)
        PERFORM pg_sleep(10);
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql;
```

### 5. cleanup_expired_data

Daily cleanup of expired data.

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE (
    units_deleted INTEGER,
    executions_deleted INTEGER
) AS $$
DECLARE
    v_units_deleted INTEGER;
    v_executions_deleted INTEGER;
BEGIN
    -- Delete expired information units
    DELETE FROM information_units
    WHERE expires_at < NOW();
    GET DIAGNOSTICS v_units_deleted = ROW_COUNT;

    -- Delete executions older than 90 days
    DELETE FROM scout_executions
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_executions_deleted = ROW_COUNT;

    -- Mark stuck executions as failed
    UPDATE scout_executions
    SET status = 'failed',
        error_message = 'Execution timed out after 10 minutes',
        completed_at = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '10 minutes';

    RETURN QUERY SELECT v_units_deleted, v_executions_deleted;
END;
$$ LANGUAGE plpgsql;
```

## Triggers

### Updated timestamp trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scouts_updated_at
    BEFORE UPDATE ON scouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
```

### Extend TTL on unit usage

```sql
CREATE OR REPLACE FUNCTION extend_unit_ttl()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.used_in_article = true AND OLD.used_in_article = false THEN
        NEW.used_at = NOW();
        NEW.expires_at = NOW() + INTERVAL '60 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER units_extend_ttl
    BEFORE UPDATE ON information_units
    FOR EACH ROW
    EXECUTE FUNCTION extend_unit_ttl();
```

### dispatch_auto_drafts

Dispatches `bajour-auto-draft` edge function for each active village at 18:00 Europe/Zurich. Staggers calls by 10 seconds to respect rate limits.

```sql
CREATE OR REPLACE FUNCTION dispatch_auto_drafts()
RETURNS INTEGER AS $$
DECLARE
    village_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
BEGIN
    SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';

    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

    FOR village_record IN
        SELECT village_id, village_name, scout_id, user_id
        FROM bajour_village_config  -- logical view / config table
        ORDER BY village_id
    LOOP
        PERFORM net.http_post(
            url := project_url || '/functions/v1/bajour-auto-draft',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'village_id', village_record.village_id,
                'village_name', village_record.village_name,
                'scout_id', village_record.scout_id,
                'user_id', village_record.user_id
            )
        );

        dispatched_count := dispatched_count + 1;
        PERFORM pg_sleep(10);
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## pg_cron Jobs

Seven active jobs. pg_cron schedules in UTC; DST is handled via timezone-safe wrapper functions rather than the 5-parameter `cron.schedule` overload (not available on this Supabase instance).

```sql
-- Dispatch due scouts every 15 minutes
SELECT cron.schedule(
    'dispatch-due-scouts',
    '*/15 * * * *',
    'SELECT dispatch_due_scouts()'
);

-- Cleanup expired data daily at 3 AM UTC
SELECT cron.schedule(
    'cleanup-expired-data',
    '0 3 * * *',
    'SELECT cleanup_expired_data()'
);

-- Dispatch auto-drafts: dual schedule covers both DST states.
-- dispatch_auto_drafts_tz_safe() checks EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Zurich') = 18
-- before calling dispatch_auto_drafts(), so only one of the two fires per day.
SELECT cron.schedule(
    'dispatch-auto-drafts-summer',
    '0 16 * * *',  -- 18:00 CEST (UTC+2, Apr–Oct)
    'SELECT dispatch_auto_drafts_tz_safe()'
);
SELECT cron.schedule(
    'dispatch-auto-drafts-winter',
    '0 17 * * *',  -- 18:00 CET (UTC+1, Nov–Mar)
    'SELECT dispatch_auto_drafts_tz_safe()'
);

-- Resolve bajour verification timeouts: same dual-schedule pattern.
-- resolve_bajour_timeouts_tz_safe() checks Zurich hour = 22 before proceeding.
SELECT cron.schedule(
    'resolve-timeouts-summer',
    '0 20 * * *',  -- 22:00 CEST (UTC+2)
    'SELECT resolve_bajour_timeouts_tz_safe()'
);
SELECT cron.schedule(
    'resolve-timeouts-winter',
    '0 21 * * *',  -- 22:00 CET (UTC+1)
    'SELECT resolve_bajour_timeouts_tz_safe()'
);
```

### Timezone-safe wrapper functions

The `_tz_safe()` wrappers guard against the off-season UTC slot firing. Only one of each pair executes per day:

```sql
CREATE OR REPLACE FUNCTION dispatch_auto_drafts_tz_safe()
RETURNS VOID AS $$
BEGIN
    IF EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Zurich') = 18 THEN
        PERFORM dispatch_auto_drafts();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION resolve_bajour_timeouts_tz_safe()
RETURNS VOID AS $$
BEGIN
    IF EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Zurich') = 21 THEN
        PERFORM resolve_bajour_timeouts();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Vault Secrets

Required secrets in Supabase Vault:

```sql
-- Create secrets (run in SQL Editor with service role)
SELECT vault.create_secret('project_url', 'https://xxxx.supabase.co');
SELECT vault.create_secret('service_role_key', 'eyJ...');
```

## Bajour Tables

### bajour_drafts

Bajour-specific: AI-generated village newsletter drafts with WhatsApp verification workflow. Client-specific table, not part of core schema.

```sql
CREATE TABLE bajour_drafts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    village_id TEXT NOT NULL,
    village_name TEXT NOT NULL,

    -- Draft content
    title TEXT,
    body TEXT NOT NULL,
    selected_unit_ids UUID[] NOT NULL DEFAULT '{}',
    custom_system_prompt TEXT,

    -- Publication scheduling
    publication_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Verification workflow
    verification_status TEXT NOT NULL DEFAULT 'ausstehend'
      CHECK (verification_status IN ('ausstehend', 'bestätigt', 'abgelehnt')),
    verification_responses JSONB NOT NULL DEFAULT '[]',
    verification_sent_at TIMESTAMPTZ,
    verification_resolved_at TIMESTAMPTZ,
    verification_timeout_at TIMESTAMPTZ,

    -- WhatsApp tracking
    whatsapp_message_ids JSONB NOT NULL DEFAULT '[]',

    -- External-drafts + soft-dedup signal (migration 20260426000000)
    provider TEXT NOT NULL DEFAULT 'auto'
      CHECK (provider IN ('auto','external')),
    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE bajour_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own drafts"
  ON bajour_drafts FOR ALL
  USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

-- Indexes
CREATE INDEX idx_bajour_drafts_user_id ON bajour_drafts(user_id);
CREATE INDEX idx_bajour_drafts_village_id ON bajour_drafts(village_id);
CREATE INDEX idx_bajour_drafts_publication_status ON bajour_drafts(publication_date, verification_status);
```

### bajour_correspondents (see supabase/CLAUDE.md for full details)

Village correspondents for WhatsApp verification. Managed via table editor, no redeployment needed.

### auto_draft_runs

Audit log for the automated daily draft pipeline. One row per village per run.

```sql
CREATE TABLE auto_draft_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    village_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    error_message TEXT,
    draft_id UUID REFERENCES bajour_drafts(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- RLS: service_role only
ALTER TABLE auto_draft_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages auto_draft_runs"
  ON auto_draft_runs FOR ALL
  USING (current_setting('role', true) = 'service_role');
```

---

### resolve_bajour_timeouts

Auto-resolves draft verifications that exceed the 4-hour timeout. Defaults to `abgelehnt` (silence = rejection).

```sql
CREATE OR REPLACE FUNCTION resolve_bajour_timeouts()
RETURNS INTEGER AS $$
DECLARE
  resolved_count INTEGER;
BEGIN
  UPDATE bajour_drafts
  SET verification_status = 'bestätigt',
      verification_resolved_at = now()
  WHERE verification_status = 'ausstehend'
    AND verification_timeout_at IS NOT NULL
    AND verification_timeout_at < now()
    AND verification_resolved_at IS NULL;
  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  RETURN resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only callable by service_role
REVOKE EXECUTE ON FUNCTION resolve_bajour_timeouts FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_bajour_timeouts TO service_role;
```

## DRAFT_QUALITY overhaul (2026-04-23, migration `20260423000000_draft_quality_phase1`)

All changes additive; feature flags gate runtime use. See `specs/DRAFT_QUALITY.md` for the full design and `supabase/CLAUDE.md` for module-level notes.

### New columns on `information_units`

```sql
ALTER TABLE information_units
  ADD COLUMN quality_score      INT,
  ADD COLUMN publication_date   DATE,
  ADD COLUMN sensitivity        TEXT CHECK (sensitivity IN ('none','death','accident','crime','minor_safety')),
  ADD COLUMN is_listing_page    BOOLEAN DEFAULT FALSE,
  ADD COLUMN article_url        TEXT;

CREATE INDEX idx_units_village_quality_dates
  ON information_units (((location->>'city')), quality_score DESC, event_date, created_at DESC)
  WHERE used_in_article = FALSE;
```

`quality_score` is computed at ingest via `_shared/quality-scoring.ts`. Historical rows remain NULL; they're filtered out when `FEATURE_QUALITY_GATING=true` (NULL < 40 threshold).

### New columns on `bajour_drafts`

```sql
ALTER TABLE bajour_drafts
  ADD COLUMN schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN bullets_json   JSONB;
```

`schema_version=2` drafts carry bullet-only structure in `bullets_json`; legacy markdown remains in `body`.

### New column on `user_prompts`

```sql
ALTER TABLE user_prompts
  ADD COLUMN based_on_version INT NOT NULL DEFAULT 1;
```

Tracks which `_shared/prompts.ts` `DEFAULT_PROMPT_VERSIONS[*]` a user override was authored against. Spot-check stale overrides:

```sql
SELECT up.user_id, up.prompt_key, up.based_on_version, up.updated_at
FROM user_prompts up
ORDER BY up.prompt_key, up.based_on_version;
```

### `bajour_feedback_examples` (new)

```sql
CREATE TABLE bajour_feedback_examples (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id        UUID REFERENCES bajour_drafts(id) ON DELETE SET NULL,
  village_id      TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('positive','negative')),
  bullet_text     TEXT NOT NULL,
  editor_reason   TEXT,
  source_unit_ids UUID[] NOT NULL DEFAULT '{}',
  edition_date    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_village_kind
  ON bajour_feedback_examples (village_id, kind, created_at DESC);
```

Capture-only. 8 seed rows inserted on migration (positive examples from `Feedback Dorfkönig.md`). RLS: service_role ALL; `authenticated` SELECT scoped to `bajour_pilot_villages_list`.

### `draft_quality_metrics` (new)

```sql
CREATE TABLE draft_quality_metrics (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id        UUID NOT NULL REFERENCES bajour_drafts(id) ON DELETE CASCADE,
  village_id      TEXT NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics         JSONB NOT NULL,
  aggregate_score INT NOT NULL,
  warnings        TEXT[] NOT NULL DEFAULT '{}',
  schema_version  INT NOT NULL
);

CREATE INDEX idx_quality_village_date
  ON draft_quality_metrics (village_id, computed_at DESC);
```

Inline write at end of `bajour-auto-draft` / `compose` when `FEATURE_METRICS_CAPTURE=true`. RLS: service_role ALL; `authenticated` SELECT scoped to `bajour_pilot_villages_list`.

### `weekly_quality_summary()` function (new)

Returns one row per village with rolling 7d / 28d aggregates and a `delta_sigma` advisory value (NULL if `drafts_last_28d < 10`). Designed to be run manually (CLI → Obsidian weekly). See function body in the migration for the full signature.

### Feature flags (Edge Function env vars)

| Flag | Default | Purpose |
|---|---|---|
| `FEATURE_BULLET_SCHEMA` | `false` | `bajour-auto-draft` writes `schema_version=2` + `bullets_json` |
| `FEATURE_QUALITY_GATING` | `false` | Compound date filter + `quality_score >= 40` + low village-confidence drop |
| `FEATURE_EMPTY_PATH_EMAIL` | `false` | Admin emails on the 3 empty-path branches |
| `FEATURE_METRICS_CAPTURE` | `false` | Inline `draft_quality_metrics` writes |
| `FEATURE_FEEDBACK_CAPTURE` | `false` | Webhook harvests rejected bullets into `bajour_feedback_examples` |

---

## Additional Tables

### newspaper_jobs

Tracks manual text/PDF extraction jobs and feeds Realtime progress in the upload
modal.

```sql
CREATE TABLE newspaper_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    publication_date DATE,
    label TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    stage TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual_pdf',
    chunks_total INTEGER NOT NULL DEFAULT 0,
    chunks_processed INTEGER NOT NULL DEFAULT 0,
    units_created INTEGER NOT NULL DEFAULT 0,
    units_merged INTEGER NOT NULL DEFAULT 0,
    dedup_summary JSONB,
    skipped_items TEXT[] NOT NULL DEFAULT '{}',
    extracted_units JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

`extracted_units` stores staged review rows before finalization. `dedup_summary`
stores the editor-facing result of finalization: selected upload units that were
deduplicated either inside the uploaded batch (`in_batch_duplicate`) or by
merging with an existing canonical unit (`merged_existing`).

### upload_rate_limits

Rate limiting table for manual uploads (text, photo, PDF).

```sql
CREATE TABLE upload_rate_limits (
    user_id TEXT NOT NULL,
    upload_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rate_limits_user ON upload_rate_limits(user_id, upload_type, created_at DESC);
```

## Sample Data

```sql
-- Insert test scout
INSERT INTO scouts (user_id, name, url, criteria, location, frequency)
VALUES (
    '493c6d51531c7444365b0ec094bc2d67',
    'Berlin News Monitor',
    'https://www.berlin.de/aktuelles/',
    'Neuigkeiten zu Bauvorhaben oder Stadtplanung in Berlin',
    '{"city": "Berlin", "state": "Berlin", "country": "Germany", "latitude": 52.52, "longitude": 13.405}',
    'daily'
);
```
