-- Manual newspaper uploads: carry a real source URL through the staging job so
-- finalized units can be cited and scored like article-backed units.

ALTER TABLE newspaper_jobs
  ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE newspaper_jobs
  DROP CONSTRAINT IF EXISTS newspaper_jobs_source_url_check;

ALTER TABLE newspaper_jobs
  ADD CONSTRAINT newspaper_jobs_source_url_check
  CHECK (source_url IS NULL OR source_url ~ '^https?://');

COMMENT ON COLUMN newspaper_jobs.source_url IS
  'Optional/publication source URL supplied during manual text/PDF upload. Required by the PDF upload API for new jobs.';
