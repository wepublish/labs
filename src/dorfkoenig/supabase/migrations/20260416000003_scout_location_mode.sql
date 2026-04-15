-- Scout location_mode toggle (manual vs auto).
-- Auto mode: LLM assigns each extracted unit to a Gemeinde via the hybrid
-- deterministic+LLM pipeline (see _shared/village-assignment.ts).
-- Manual mode (default): existing behaviour — inherit scout.location verbatim.

ALTER TABLE scouts
  ADD COLUMN location_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (location_mode IN ('manual', 'auto'));

-- Additive columns on information_units for auto-mode metadata.
-- PDF pipeline (process-newspaper) ignores these in PR 1 and inserts NULL/false;
-- PR 2 retrofits the PDF pipeline to populate them via the same assignVillage().

ALTER TABLE information_units
  ADD COLUMN review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN village_confidence TEXT
    CHECK (village_confidence IS NULL OR village_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN assignment_path TEXT;

-- Observability view for eval + week-one monitoring.
CREATE OR REPLACE VIEW v_auto_mode_assignment_paths AS
SELECT
    assignment_path,
    COUNT(*) AS n,
    AVG(review_required::int)::numeric(4,3) AS pct_review
FROM information_units
WHERE assignment_path IS NOT NULL
GROUP BY assignment_path
ORDER BY n DESC;
