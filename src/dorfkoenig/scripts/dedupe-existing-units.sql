-- One-off cleanup of cross-run near-duplicates stored in information_units
-- before the find_similar_units_batch dedup guard existed.
--
-- Dual-signal match (matches production guard): cosine >= 0.93 AND trigram >= 0.75,
-- scoped per (user_id, scout_id, location->>'city'). Keeps earliest-created row
-- per cluster, deletes the rest.
--
-- USAGE:
--   1. Run the PREVIEW block, sanity-check (dup_id, keep_id) pairs.
--   2. If happy, run the DELETE block in the same session.
--   3. Do NOT wrap both in a single psql -f run — you want a human eyeball between.
--
-- Requires: pg_trgm extension (installed by migration 20260423120000).

-- =====================================================================
-- PREVIEW
-- =====================================================================

WITH ordered AS (
  SELECT id, user_id, scout_id, location->>'city' AS city,
         embedding, statement, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id, scout_id, location->>'city'
                            ORDER BY created_at) AS rn
  FROM information_units
),
dupes AS (
  SELECT a.id AS keep_id,
         b.id AS dup_id,
         a.statement AS keep_statement,
         b.statement AS dup_statement,
         (1 - (a.embedding <=> b.embedding))::real AS cosine,
         similarity(a.statement, b.statement)::real AS trgm,
         b.created_at AS dup_created_at
  FROM ordered a
  JOIN ordered b
    ON a.user_id = b.user_id
   AND a.scout_id IS NOT DISTINCT FROM b.scout_id
   AND a.city IS NOT DISTINCT FROM b.city
   AND a.rn < b.rn
  WHERE (1 - (a.embedding <=> b.embedding)) >= 0.93
    AND similarity(a.statement, b.statement) >= 0.75
)
SELECT keep_id,
       dup_id,
       dup_created_at,
       round(cosine::numeric, 3) AS cosine,
       round(trgm::numeric, 3)   AS trgm,
       left(keep_statement, 80)  AS keep_excerpt,
       left(dup_statement, 80)   AS dup_excerpt
FROM dupes
ORDER BY cosine DESC, dup_created_at;

-- =====================================================================
-- DELETE (uncomment after reviewing preview)
-- =====================================================================

-- WITH ordered AS (
--   SELECT id, user_id, scout_id, location->>'city' AS city,
--          embedding, statement, created_at,
--          ROW_NUMBER() OVER (PARTITION BY user_id, scout_id, location->>'city'
--                             ORDER BY created_at) AS rn
--   FROM information_units
-- ),
-- dupes AS (
--   SELECT b.id AS dup_id
--   FROM ordered a
--   JOIN ordered b
--     ON a.user_id = b.user_id
--    AND a.scout_id IS NOT DISTINCT FROM b.scout_id
--    AND a.city IS NOT DISTINCT FROM b.city
--    AND a.rn < b.rn
--   WHERE (1 - (a.embedding <=> b.embedding)) >= 0.93
--     AND similarity(a.statement, b.statement) >= 0.75
-- )
-- DELETE FROM information_units WHERE id IN (SELECT DISTINCT dup_id FROM dupes);
