-- Extend cleanup_expired_data() to fail stuck newspaper_jobs.
-- Mirrors the scout_executions 10-min timeout pattern but uses 8 min so the job
-- is surfaced as failed before the platform edge-function hard timeout hides it.
--
-- The RETURNS TABLE signature grows by one column, so CREATE OR REPLACE FUNCTION
-- would fail with "cannot change return type of existing function". Drop first.

DROP FUNCTION IF EXISTS cleanup_expired_data();

CREATE FUNCTION cleanup_expired_data()
RETURNS TABLE (
    units_deleted INTEGER,
    executions_deleted INTEGER,
    stuck_executions_fixed INTEGER,
    stuck_newspaper_jobs_fixed INTEGER
) AS $$
DECLARE
    v_units_deleted INTEGER;
    v_executions_deleted INTEGER;
    v_stuck_fixed INTEGER;
    v_stuck_jobs_fixed INTEGER;
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

    -- Mark stuck newspaper_jobs as failed (edge function was killed before catch{} ran)
    UPDATE newspaper_jobs
    SET status = 'failed',
        error_message = 'Verarbeitung hat das Zeitlimit überschritten',
        completed_at = NOW()
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '8 minutes';
    GET DIAGNOSTICS v_stuck_jobs_fixed = ROW_COUNT;

    RETURN QUERY SELECT v_units_deleted, v_executions_deleted, v_stuck_fixed, v_stuck_jobs_fixed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
