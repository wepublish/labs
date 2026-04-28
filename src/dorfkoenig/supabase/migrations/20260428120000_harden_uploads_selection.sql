-- Harden newspaper upload state tracking and auto-draft selection diagnostics.
-- Additive only; no historical units are deleted or rewritten.

ALTER TABLE newspaper_jobs
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT;

COMMENT ON COLUMN newspaper_jobs.last_heartbeat_at IS
  'Updated by manual-upload/process-newspaper on every meaningful job transition.';
COMMENT ON COLUMN newspaper_jobs.processing_attempts IS
  'Number of process-newspaper attempts started for this job.';
COMMENT ON COLUMN newspaper_jobs.file_sha256 IS
  'Optional PDF content hash for future duplicate-upload detection.';

CREATE INDEX IF NOT EXISTS idx_newspaper_jobs_heartbeat
  ON newspaper_jobs (status, last_heartbeat_at);

-- Repair stale UI state left by older pipeline versions.
UPDATE newspaper_jobs
SET stage = NULL
WHERE status IN ('completed', 'failed', 'cancelled');

UPDATE newspaper_jobs
SET
  stage = NULL,
  chunks_processed = GREATEST(COALESCE(chunks_processed, 0), COALESCE(chunks_total, 0)),
  last_heartbeat_at = COALESCE(last_heartbeat_at, completed_at, NOW())
WHERE status = 'review_pending'
  AND extracted_units IS NOT NULL;

UPDATE newspaper_jobs
SET last_heartbeat_at = COALESCE(last_heartbeat_at, completed_at, created_at)
WHERE last_heartbeat_at IS NULL;

ALTER TABLE auto_draft_runs
  ADD COLUMN IF NOT EXISTS candidate_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS selected_unit_ids JSONB,
  ADD COLUMN IF NOT EXISTS mandatory_kept_ids JSONB,
  ADD COLUMN IF NOT EXISTS rejected_top_units JSONB,
  ADD COLUMN IF NOT EXISTS selection_response_preview TEXT;

COMMENT ON COLUMN auto_draft_runs.candidate_snapshot IS
  'Compact snapshot of ranked candidates shown to the selector.';
COMMENT ON COLUMN auto_draft_runs.selected_unit_ids IS
  'IDs returned by the selector after validation/fallback.';
COMMENT ON COLUMN auto_draft_runs.mandatory_kept_ids IS
  'High editorial-value IDs forced into the final selection.';
COMMENT ON COLUMN auto_draft_runs.rejected_top_units IS
  'Top-ranked candidates not selected, for editor/debug diagnostics.';
COMMENT ON COLUMN auto_draft_runs.selection_response_preview IS
  'Truncated raw selector model response or fallback reason.';
