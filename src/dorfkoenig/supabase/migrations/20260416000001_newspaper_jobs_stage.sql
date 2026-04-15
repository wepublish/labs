-- Add stage column to newspaper_jobs so the UI has something meaningful to show
-- before chunks_total is known (PDF parse can take 30-90s on large docs).
--
-- Historical rows stay NULL (not retroactively mislabelled as 'parsing_pdf').
-- The edge function sets 'parsing_pdf' as the first update on new jobs.

ALTER TABLE newspaper_jobs
  ADD COLUMN stage TEXT
    CHECK (stage IS NULL OR stage IN ('parsing_pdf', 'chunking', 'extracting', 'storing'));
