-- Make newsletter unit selection ranking editor-visible and persist its audit
-- trail on drafts.

ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS user_settings_valid_key;

ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_valid_key
  CHECK (key IN ('max_units_per_compose', 'selection_ranking'));

ALTER TABLE bajour_drafts
  ADD COLUMN IF NOT EXISTS selection_diagnostics JSONB;

COMMENT ON COLUMN bajour_drafts.selection_diagnostics IS
  'Compact selection audit: ranked candidates, final selected units, rejected units, model response preview, and ranking config used.';

UPDATE bajour_drafts d
SET selection_diagnostics = jsonb_build_object(
  'candidate_snapshot', r.candidate_snapshot,
  'selected_unit_ids', COALESCE(r.selected_unit_ids, to_jsonb(d.selected_unit_ids)),
  'mandatory_kept_ids', r.mandatory_kept_ids,
  'rejected_top_units', r.rejected_top_units,
  'selection_response_preview', r.selection_response_preview
)
FROM (
  SELECT DISTINCT ON (draft_id)
    draft_id,
    candidate_snapshot,
    selected_unit_ids,
    mandatory_kept_ids,
    rejected_top_units,
    selection_response_preview
  FROM auto_draft_runs
  WHERE draft_id IS NOT NULL
    AND (
      candidate_snapshot IS NOT NULL
      OR selected_unit_ids IS NOT NULL
      OR rejected_top_units IS NOT NULL
    )
  ORDER BY draft_id, started_at DESC
) r
WHERE d.id = r.draft_id
  AND d.selection_diagnostics IS NULL;
