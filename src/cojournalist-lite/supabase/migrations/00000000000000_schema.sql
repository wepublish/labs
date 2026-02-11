-- coJournalist-Lite Database Schema
-- PostgreSQL with pgvector for semantic search and deduplication

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
-- Note: pg_cron and pg_net must be enabled via Supabase Dashboard first

-- ============================================================================
-- TABLES
-- ============================================================================

-- Scouts: Web scout configurations for URL monitoring
CREATE TABLE IF NOT EXISTS scouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,

    -- Configuration
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    criteria TEXT NOT NULL,

    -- Location (from MapTiler geocoding)
    -- Example: {"city": "Berlin", "state": "Berlin", "country": "Germany", "latitude": 52.52, "longitude": 13.405}
    location JSONB,

    -- Scheduling
    frequency TEXT NOT NULL DEFAULT 'daily',

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
    CONSTRAINT scouts_valid_frequency CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    CONSTRAINT scouts_valid_url CHECK (url ~ '^https?://'),
    CONSTRAINT scouts_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
    CONSTRAINT scouts_criteria_length CHECK (char_length(criteria) BETWEEN 10 AND 1000)
);

-- Indexes for scouts
CREATE INDEX IF NOT EXISTS idx_scouts_user_id ON scouts(user_id);
CREATE INDEX IF NOT EXISTS idx_scouts_user_active ON scouts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_scouts_next_run ON scouts(is_active, last_run_at, frequency)
    WHERE is_active = true AND consecutive_failures < 3;

-- Scout Executions: Individual scout run history with deduplication embeddings
CREATE TABLE IF NOT EXISTS scout_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,

    -- Execution status: running, completed, failed
    status TEXT NOT NULL DEFAULT 'running',

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Results
    -- change_status: changed, same, error, first_run
    change_status TEXT,
    criteria_matched BOOLEAN,

    -- Summary for deduplication (German, max 150 chars)
    summary_text TEXT,

    -- Embedding for cosine similarity deduplication (OpenAI text-embedding-3-small: 1536 dims)
    summary_embedding vector(1536),

    -- Deduplication results
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_similarity REAL,

    -- Notification status
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
    CONSTRAINT executions_valid_status CHECK (status IN ('running', 'completed', 'failed')),
    CONSTRAINT executions_valid_change_status CHECK (
        change_status IS NULL OR
        change_status IN ('changed', 'same', 'error', 'first_run')
    )
);

-- Indexes for scout_executions
CREATE INDEX IF NOT EXISTS idx_executions_scout ON scout_executions(scout_id);
CREATE INDEX IF NOT EXISTS idx_executions_user ON scout_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_executions_created ON scout_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_scout_recent ON scout_executions(scout_id, created_at DESC)
    WHERE status = 'completed';

-- HNSW index for vector similarity search (execution deduplication)
CREATE INDEX IF NOT EXISTS idx_executions_embedding ON scout_executions
    USING hnsw (summary_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Information Units: Atomic facts extracted for Compose panel
CREATE TABLE IF NOT EXISTS information_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
    execution_id UUID NOT NULL REFERENCES scout_executions(id) ON DELETE CASCADE,

    -- Content (atomic fact in German, complete sentence)
    statement TEXT NOT NULL,

    -- Unit type: fact, event, entity_update
    unit_type TEXT NOT NULL DEFAULT 'fact',

    -- Entities mentioned (e.g., ['Angela Merkel', 'Berlin', 'CDU'])
    entities TEXT[] DEFAULT '{}',

    -- Source
    source_url TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    source_title TEXT,

    -- Location (inherited from scout)
    location JSONB,

    -- Embedding for semantic search (OpenAI text-embedding-3-small: 1536 dims)
    embedding vector(1536) NOT NULL,

    -- Usage tracking
    used_in_article BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),

    -- Constraints
    CONSTRAINT units_valid_type CHECK (unit_type IN ('fact', 'event', 'entity_update'))
);

-- Indexes for information_units
CREATE INDEX IF NOT EXISTS idx_units_user ON information_units(user_id);
CREATE INDEX IF NOT EXISTS idx_units_scout ON information_units(scout_id);
CREATE INDEX IF NOT EXISTS idx_units_execution ON information_units(execution_id);
CREATE INDEX IF NOT EXISTS idx_units_created ON information_units(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_units_unused ON information_units(user_id, used_in_article, created_at DESC)
    WHERE used_in_article = false;
CREATE INDEX IF NOT EXISTS idx_units_location ON information_units USING GIN (location);
CREATE INDEX IF NOT EXISTS idx_units_expires ON information_units(expires_at)
    WHERE expires_at IS NOT NULL;

-- HNSW index for semantic search
CREATE INDEX IF NOT EXISTS idx_units_embedding ON information_units
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Partial index for location-based queries
CREATE INDEX IF NOT EXISTS idx_units_location_city ON information_units(
    user_id,
    (location->>'city'),
    created_at DESC
) WHERE location IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE scouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE information_units ENABLE ROW LEVEL SECURITY;

-- Scouts policies
-- Note: Using x-user-id header for mock auth, service role bypasses RLS
CREATE POLICY "Users can view their own scouts"
    ON scouts FOR SELECT
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

CREATE POLICY "Users can create their own scouts"
    ON scouts FOR INSERT
    WITH CHECK (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

CREATE POLICY "Users can update their own scouts"
    ON scouts FOR UPDATE
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

CREATE POLICY "Users can delete their own scouts"
    ON scouts FOR DELETE
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

-- Scout executions policies
CREATE POLICY "Users can view their own executions"
    ON scout_executions FOR SELECT
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

CREATE POLICY "Service role can manage executions"
    ON scout_executions FOR ALL
    USING (current_setting('role', true) = 'service_role');

-- Information units policies
CREATE POLICY "Users can view their own units"
    ON information_units FOR SELECT
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

CREATE POLICY "Users can update their own units"
    ON information_units FOR UPDATE
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

CREATE POLICY "Service role can manage units"
    ON information_units FOR ALL
    USING (current_setting('role', true) = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated timestamp trigger
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

-- Extend TTL when unit is used in article
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

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

-- Check if execution summary is duplicate of recent executions
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
        COALESCE(MAX(1 - (summary_embedding <=> p_embedding)), 0)::REAL AS max_similarity,
        (
            SELECT se.id FROM scout_executions se
            WHERE se.scout_id = p_scout_id
              AND se.status = 'completed'
              AND se.summary_embedding IS NOT NULL
              AND se.created_at > NOW() - (p_lookback_days || ' days')::INTERVAL
            ORDER BY se.summary_embedding <=> p_embedding
            LIMIT 1
        ) AS similar_execution_id
    FROM scout_executions
    WHERE scout_id = p_scout_id
      AND status = 'completed'
      AND summary_embedding IS NOT NULL
      AND created_at > NOW() - (p_lookback_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Semantic search for information units (Compose panel)
CREATE OR REPLACE FUNCTION search_units_semantic(
    p_user_id TEXT,
    p_query_embedding vector(1536),
    p_location_city TEXT DEFAULT NULL,
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
        u.created_at,
        (1 - (u.embedding <=> p_query_embedding))::REAL AS similarity
    FROM information_units u
    WHERE u.user_id = p_user_id
      AND (p_location_city IS NULL OR u.location->>'city' = p_location_city)
      AND (NOT p_unused_only OR u.used_in_article = false)
      AND (1 - (u.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY u.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Check if scout should run based on frequency
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

-- Dispatch due scouts (called by pg_cron every 15 minutes)
CREATE OR REPLACE FUNCTION dispatch_due_scouts()
RETURNS INTEGER AS $$
DECLARE
    scout_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
BEGIN
    -- Get secrets from Vault
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets
        WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'Vault secrets not configured';
        RETURN 0;
    END IF;

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
        -- Check for running execution (prevent duplicates)
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

        -- Stagger dispatches by 10 seconds (Firecrawl rate limits)
        PERFORM pg_sleep(10);
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired data (called by pg_cron daily)
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE (
    units_deleted INTEGER,
    executions_deleted INTEGER,
    stuck_executions_fixed INTEGER
) AS $$
DECLARE
    v_units_deleted INTEGER;
    v_executions_deleted INTEGER;
    v_stuck_fixed INTEGER;
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
    GET DIAGNOSTICS v_stuck_fixed = ROW_COUNT;

    RETURN QUERY SELECT v_units_deleted, v_executions_deleted, v_stuck_fixed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- pg_cron JOBS (run after enabling extension via Dashboard)
-- ============================================================================

-- Note: These must be executed separately after pg_cron is enabled
--
-- SELECT cron.schedule(
--     'dispatch-due-scouts',
--     '*/15 * * * *',
--     'SELECT dispatch_due_scouts()'
-- );
--
-- SELECT cron.schedule(
--     'cleanup-expired-data',
--     '0 3 * * *',
--     'SELECT cleanup_expired_data()'
-- );

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Uncomment to insert test data:
--
-- INSERT INTO scouts (user_id, name, url, criteria, location, frequency, notification_email)
-- VALUES (
--     'tester-1',
--     'Berlin News Monitor',
--     'https://www.berlin.de/aktuelles/',
--     'Neuigkeiten zu Bauvorhaben oder Stadtplanung in Berlin',
--     '{"city": "Berlin", "state": "Berlin", "country": "Germany", "latitude": 52.52, "longitude": 13.405}'::jsonb,
--     'daily',
--     'test@example.com'
-- );
