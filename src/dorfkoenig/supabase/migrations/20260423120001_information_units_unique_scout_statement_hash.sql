-- UNIQUE race guard. Separated from 20260423120000 because existing duplicate
-- rows (441 near-dups across 161 clusters, plus md5-exact collisions) had to
-- be cleaned via scripts/dedupe-existing-units.sql before the index could build.
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_scout_statement_hash
  ON information_units (user_id, scout_id, md5(statement))
  WHERE scout_id IS NOT NULL;
