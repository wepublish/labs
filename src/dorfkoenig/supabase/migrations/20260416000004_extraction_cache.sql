-- Content-hash cache for auto-mode LLM extraction results.
-- Re-runs of an unchanged page (same content_hash + criteria_hash + prompt version)
-- skip the LLM call and reuse the stored units.
--
-- Only populated by auto-mode paths. Manual mode is cheap enough not to need caching.
-- The prompt version is bumped by hand in _shared/web-extraction-prompt.ts to
-- invalidate all entries after a prompt change.

CREATE TABLE extraction_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_hash TEXT NOT NULL,
    criteria_hash TEXT NOT NULL,
    prompt_version INTEGER NOT NULL,
    units JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    UNIQUE (content_hash, criteria_hash, prompt_version)
);

CREATE INDEX idx_extraction_cache_lookup
    ON extraction_cache(content_hash, criteria_hash, prompt_version);

CREATE INDEX idx_extraction_cache_expires
    ON extraction_cache(expires_at);

-- Expired entries get cleaned up by cleanup_expired_data() — add the sweep here
-- rather than yet another migration on the cleanup function.
-- Return signature grows, so drop first (CREATE OR REPLACE can't change return type).
DROP FUNCTION IF EXISTS cleanup_expired_data();

CREATE FUNCTION cleanup_expired_data()
RETURNS TABLE (
    units_deleted INTEGER,
    executions_deleted INTEGER,
    stuck_executions_fixed INTEGER,
    stuck_newspaper_jobs_fixed INTEGER,
    extraction_cache_deleted INTEGER
) AS $$
DECLARE
    v_units_deleted INTEGER;
    v_executions_deleted INTEGER;
    v_stuck_fixed INTEGER;
    v_stuck_jobs_fixed INTEGER;
    v_cache_deleted INTEGER;
BEGIN
    DELETE FROM information_units WHERE expires_at < NOW();
    GET DIAGNOSTICS v_units_deleted = ROW_COUNT;

    DELETE FROM scout_executions WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_executions_deleted = ROW_COUNT;

    UPDATE scout_executions
    SET status = 'failed',
        error_message = 'Execution timed out after 10 minutes',
        completed_at = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '10 minutes';
    GET DIAGNOSTICS v_stuck_fixed = ROW_COUNT;

    UPDATE newspaper_jobs
    SET status = 'failed',
        error_message = 'Verarbeitung hat das Zeitlimit überschritten',
        completed_at = NOW()
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '8 minutes';
    GET DIAGNOSTICS v_stuck_jobs_fixed = ROW_COUNT;

    DELETE FROM extraction_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS v_cache_deleted = ROW_COUNT;

    RETURN QUERY SELECT v_units_deleted, v_executions_deleted, v_stuck_fixed, v_stuck_jobs_fixed, v_cache_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
