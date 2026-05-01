-- Persist per-unit deduplication details for manual text/PDF uploads.
--
-- `units_merged` is useful as a metric, but editors need to see which uploaded
-- facts were deduplicated. The finalize handler stores a compact JSON payload
-- here so the upload success view and recent-upload details can show it later.

ALTER TABLE newspaper_jobs
  ADD COLUMN IF NOT EXISTS dedup_summary JSONB;
