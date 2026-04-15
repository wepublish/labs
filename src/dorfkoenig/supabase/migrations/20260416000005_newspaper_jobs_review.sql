-- Preview-and-confirm for manual PDF uploads.
--
-- process-newspaper used to extract → embed → dedup → INSERT in one run and
-- leave the user with nothing to review. Now it stops after extraction, stores
-- the resolved units on the job, and hands off to the UI. The finalize handler
-- in manual-upload then runs embed/dedup/insert on just the user-selected units.
--
-- Status lifecycle:
--   processing    → extraction in flight (Firecrawl + LLM)
--   review_pending → extraction done, awaiting user's selection
--   storing       → idempotency guard for pdf_finalize (atomic transition from
--                   review_pending so concurrent retries become no-ops)
--   completed     → units stored in information_units
--   cancelled     → user pressed Abbrechen (distinct from 'failed' for metrics)
--   failed        → pipeline error

-- Constraint name verified on live DB via:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'newspaper_jobs'::regclass AND contype='c' AND conname LIKE '%status%';
-- → 'newspaper_jobs_status_check'

ALTER TABLE newspaper_jobs DROP CONSTRAINT IF EXISTS newspaper_jobs_status_check;
ALTER TABLE newspaper_jobs ADD CONSTRAINT newspaper_jobs_status_check
  CHECK (status IN ('processing', 'review_pending', 'storing', 'completed', 'cancelled', 'failed'));

-- Staged units awaiting the user's keep/drop decision. Each element is a
-- ResolvedUnit with an added `uid` so the UI can submit selection by UID
-- rather than array index (keeps edit-in-place etc. unblocked later).
-- NOT populated today; the edge function writes it at the end of extraction.
-- Embeddings are NOT stored here — regenerated at finalize time to keep the
-- payload small (~25 KB typical, ~80 KB worst case).
ALTER TABLE newspaper_jobs
  ADD COLUMN extracted_units JSONB;

-- Retention note: review_pending / cancelled rows are NOT swept automatically
-- in v1. At current volume (~5 abandoned/week) the DB cost is ~20 MB/year —
-- fine. When we add a sweep to cleanup_expired_data(), remember the function
-- return-signature trap from 2026-04-16 and DROP FUNCTION first before CREATE.
