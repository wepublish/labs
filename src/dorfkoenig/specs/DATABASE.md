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

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_frequency CHECK (frequency IN ('daily', 'weekly', 'monthly')),
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
    scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
    execution_id UUID NOT NULL REFERENCES scout_executions(id) ON DELETE CASCADE,

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

    -- Location (inherited from scout)
    location JSONB,

    -- Topic (inherited from scout, comma-separated)
    topic TEXT,

    -- Embedding for semantic search
    embedding vector(1536) NOT NULL,

    -- Usage tracking
    used_in_article BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),

    -- Constraints
    CONSTRAINT valid_unit_type CHECK (unit_type IN ('fact', 'event', 'entity_update'))
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
        WHEN 'daily' THEN 24
        WHEN 'weekly' THEN 168
        WHEN 'monthly' THEN 720
        ELSE 24
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

## pg_cron Jobs

```sql
-- Dispatch due scouts every 15 minutes
SELECT cron.schedule(
    'dispatch-due-scouts',
    '*/15 * * * *',
    'SELECT dispatch_due_scouts()'
);

-- Cleanup expired data daily at 3 AM
SELECT cron.schedule(
    'cleanup-expired-data',
    '0 3 * * *',
    'SELECT cleanup_expired_data()'
);
```

## Vault Secrets

Required secrets in Supabase Vault:

```sql
-- Create secrets (run in SQL Editor with service role)
SELECT vault.create_secret('project_url', 'https://xxxx.supabase.co');
SELECT vault.create_secret('service_role_key', 'eyJ...');
```

## Sample Data

```sql
-- Insert test scout
INSERT INTO scouts (user_id, name, url, criteria, location, frequency)
VALUES (
    'tester-1',
    'Berlin News Monitor',
    'https://www.berlin.de/aktuelles/',
    'Neuigkeiten zu Bauvorhaben oder Stadtplanung in Berlin',
    '{"city": "Berlin", "state": "Berlin", "country": "Germany", "latitude": 52.52, "longitude": 13.405}',
    'daily'
);
```
