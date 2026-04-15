-- Any-reject-wins verification:
--   • Any `abgelehnt` response → draft status = abgelehnt
--   • Any `bestätigt` with zero rejects → draft status = bestätigt
--   • No response (timeout) → abgelehnt (was: bestätigt)
--
-- Also replaces the previous edge-function read-modify-write on verification_responses
-- with an atomic RPC (SELECT ... FOR UPDATE) so simultaneous webhook hits cannot clobber
-- each other.

-- ── Timeout default: abgelehnt instead of bestätigt ──

CREATE OR REPLACE FUNCTION resolve_bajour_timeouts()
RETURNS INTEGER AS $$
DECLARE
  resolved_count INTEGER;
BEGIN
  UPDATE bajour_drafts
  SET
    verification_status = 'abgelehnt',
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
  'Bajour: auto-resolve draft verifications past the 2-hour timeout window as abgelehnt (silence = rejection).';

-- ── Atomic response append ──

CREATE OR REPLACE FUNCTION append_bajour_response(
  p_draft_id UUID,
  p_response JSONB
) RETURNS TABLE(
  draft_id UUID,
  previous_status TEXT,
  new_status TEXT,
  verification_responses JSONB,
  already_responded BOOLEAN,
  status_transitioned BOOLEAN
) AS $$
DECLARE
  v_draft bajour_drafts%ROWTYPE;
  v_phone TEXT := p_response->>'phone';
  v_new_status TEXT;
  v_rejects INT;
  v_confirms INT;
  v_already BOOLEAN;
  v_previous_status TEXT;
  v_updated_responses JSONB;
BEGIN
  SELECT * INTO v_draft
  FROM bajour_drafts
  WHERE bajour_drafts.id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % not found', p_draft_id;
  END IF;

  v_previous_status := v_draft.verification_status;

  v_already := EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_draft.verification_responses, '[]'::jsonb)) r
    WHERE regexp_replace(r->>'phone', '^\+', '') = regexp_replace(v_phone, '^\+', '')
  );

  IF v_already THEN
    RETURN QUERY SELECT
      v_draft.id,
      v_previous_status,
      v_previous_status,
      COALESCE(v_draft.verification_responses, '[]'::jsonb),
      TRUE,
      FALSE;
    RETURN;
  END IF;

  v_updated_responses :=
    COALESCE(v_draft.verification_responses, '[]'::jsonb) || jsonb_build_array(p_response);

  SELECT
    COUNT(*) FILTER (WHERE r->>'response' = 'abgelehnt'),
    COUNT(*) FILTER (WHERE r->>'response' = 'bestätigt')
  INTO v_rejects, v_confirms
  FROM jsonb_array_elements(v_updated_responses) r;

  v_new_status := CASE
    WHEN v_rejects > 0 THEN 'abgelehnt'
    WHEN v_confirms > 0 THEN 'bestätigt'
    ELSE 'ausstehend'
  END;

  UPDATE bajour_drafts
  SET
    verification_responses = v_updated_responses,
    verification_status = v_new_status,
    verification_resolved_at = CASE
      WHEN v_new_status <> 'ausstehend' AND verification_resolved_at IS NULL THEN now()
      ELSE verification_resolved_at
    END
  WHERE bajour_drafts.id = p_draft_id;

  RETURN QUERY SELECT
    p_draft_id,
    v_previous_status,
    v_new_status,
    v_updated_responses,
    FALSE,
    (v_previous_status <> v_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION append_bajour_response(UUID, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION append_bajour_response(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION append_bajour_response IS
  'Bajour: atomically append a correspondent response and resolve verification_status. Any abgelehnt wins; single bestätigt wins when no rejects present.';
