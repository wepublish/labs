-- Add publication_date to bajour_drafts so journalists can set which day a draft is valid for.
-- The news API endpoint filters on (publication_date, verification_status).

ALTER TABLE bajour_drafts
  ADD COLUMN publication_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows: use their creation date instead of migration-run date
UPDATE bajour_drafts
SET publication_date = created_at::date
WHERE publication_date = CURRENT_DATE
  AND created_at::date != CURRENT_DATE;

CREATE INDEX idx_bajour_drafts_publication_status
  ON bajour_drafts(publication_date, verification_status);
