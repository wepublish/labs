-- Resolve timed-out Bajour draft verifications
-- Can be called by pg_cron or by the webhook function

CREATE OR REPLACE FUNCTION resolve_bajour_timeouts()
RETURNS INTEGER AS $$
DECLARE
  resolved_count INTEGER;
BEGIN
  UPDATE bajour_drafts
  SET
    verification_status = 'bestätigt',
    verification_resolved_at = now()
  WHERE verification_status = 'ausstehend'
    AND verification_timeout_at IS NOT NULL
    AND verification_timeout_at < now()
    AND verification_resolved_at IS NULL;

  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  RETURN resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION resolve_bajour_timeouts IS
  'Bajour-specific: Auto-resolve draft verifications that exceed the 2-hour timeout. Defaults to bestätigt.';
