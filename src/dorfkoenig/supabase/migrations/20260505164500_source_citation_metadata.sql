-- Manual uploads: structured citation metadata for newspaper/PDF-backed facts.
--
-- Keep this JSONB so we can evolve newspaper-specific fields without repeated
-- schema churn. Edge functions populate citation_label for compose/quality.

ALTER TABLE newspaper_jobs
  ADD COLUMN IF NOT EXISTS source_citation JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE information_units
  ADD COLUMN IF NOT EXISTS source_citation JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE unit_occurrences
  ADD COLUMN IF NOT EXISTS source_citation JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN newspaper_jobs.source_citation IS
  'Structured source metadata for manual uploads: publication, issue_date, issue_label, page, article_title, section, citation_label.';

COMMENT ON COLUMN information_units.source_citation IS
  'Best-known structured citation metadata, copied from manual upload jobs or source occurrences.';

COMMENT ON COLUMN unit_occurrences.source_citation IS
  'Occurrence-level structured citation metadata; preserves PDF/page provenance for each extracted fact.';

