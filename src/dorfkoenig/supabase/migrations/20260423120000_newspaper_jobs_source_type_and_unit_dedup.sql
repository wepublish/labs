-- Cross-run unit dedup infra + manual-text upload job support.
-- Reasoning: specs/followups/draft-quality decision log, plus Alfred's review.

-- 1. newspaper_jobs now hosts both PDF and text extraction jobs.
ALTER TABLE newspaper_jobs
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual_pdf'
    CHECK (source_type IN ('manual_pdf', 'manual_text'));

-- 2. pg_trgm enables fuzzy-text as the second dedup signal (paired with cosine).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Trigram GIN on statement for fuzzy-text lookup. HNSW on embedding and
-- composite btree on (user_id, city, created_at) already exist in schema.sql.
CREATE INDEX IF NOT EXISTS idx_units_statement_trgm
  ON information_units USING gin (statement gin_trgm_ops);

-- 4. Concurrency guard: two scout runs racing past the semantic check land
-- identical statements milliseconds apart. Catch via md5 hash; manual uploads
-- (scout_id IS NULL) are excluded — editors may legitimately repeat text.
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_scout_statement_hash
  ON information_units (user_id, scout_id, md5(statement))
  WHERE scout_id IS NOT NULL;

-- 5. Dual-signal batch dedup: one RPC per extraction (not one per unit).
-- Caller passes JSONB array; function returns matched candidates.
-- Thresholds chosen after paraphrase testing: 0.93 cosine + 0.75 trigram
-- catches the wolf-event duplicates without conflating distinct predicates
-- about the same event ("Tickets ausverkauft" vs "verschoben").
CREATE OR REPLACE FUNCTION find_similar_units_batch(
  p_user_id TEXT,
  p_candidates JSONB,
  p_cosine_threshold REAL DEFAULT 0.93,
  p_trgm_threshold REAL DEFAULT 0.75,
  p_lookback_days INT DEFAULT 30
) RETURNS TABLE(candidate_idx INT, matched_id UUID, cosine REAL, trgm REAL)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT (elem->>'idx')::int               AS idx,
           (elem->>'embedding')::vector(1536) AS emb,
            elem->>'city'                    AS city,
            elem->>'statement'               AS statement
    FROM jsonb_array_elements(p_candidates) elem
  )
  SELECT c.idx,
         u.id,
         (1 - (u.embedding <=> c.emb))::real               AS cosine,
         similarity(u.statement, c.statement)::real        AS trgm
  FROM c
  JOIN LATERAL (
    SELECT id, embedding, statement
    FROM information_units
    WHERE user_id = p_user_id
      AND created_at > NOW() - (p_lookback_days || ' days')::interval
      AND (c.city IS NULL OR location->>'city' = c.city)
      AND (1 - (embedding <=> c.emb)) >= p_cosine_threshold
      AND similarity(statement, c.statement) >= p_trgm_threshold
    ORDER BY embedding <=> c.emb
    LIMIT 1
  ) u ON TRUE;
$$;

GRANT EXECUTE ON FUNCTION find_similar_units_batch(TEXT, JSONB, REAL, REAL, INT) TO service_role;
