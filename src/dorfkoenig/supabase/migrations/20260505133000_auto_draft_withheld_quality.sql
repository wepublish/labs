-- Auto-draft quality gating: keep machine-withheld drafts distinct from
-- correspondent rejections and persist structured diagnostics for review.

ALTER TABLE bajour_drafts
  DROP CONSTRAINT IF EXISTS bajour_drafts_verification_status_check;

ALTER TABLE bajour_drafts
  ADD CONSTRAINT bajour_drafts_verification_status_check
  CHECK (verification_status IN ('ausstehend', 'bestätigt', 'abgelehnt', 'withheld'));

ALTER TABLE bajour_drafts
  ADD COLUMN IF NOT EXISTS quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN bajour_drafts.quality_warnings IS
  'Structured auto-draft quality diagnostics. Used when verification_status=withheld and shown in the editor UI.';
