-- Review-only cleanup for the two debug canonical units found in the
-- 2026-05-01 page-monitor audit.
--
-- Do not run blindly. Review the SELECT output first, then replace ROLLBACK
-- with COMMIT in an approved maintenance window.

BEGIN;

WITH target_units(id) AS (
  VALUES
    ('9decd3d3-2fb5-41ef-9d62-df951ed62b5c'::uuid),
    ('7657b574-831c-48c6-be54-4d5391f70905'::uuid)
)
SELECT
  iu.id,
  iu.statement,
  iu.location,
  iu.source_url,
  iu.occurrence_count,
  iu.source_count,
  COUNT(uo.id) AS occurrence_rows
FROM information_units iu
LEFT JOIN unit_occurrences uo ON uo.unit_id = iu.id
JOIN target_units tu ON tu.id = iu.id
GROUP BY iu.id;

WITH target_units(id) AS (
  VALUES
    ('9decd3d3-2fb5-41ef-9d62-df951ed62b5c'::uuid),
    ('7657b574-831c-48c6-be54-4d5391f70905'::uuid)
)
UPDATE bajour_drafts bd
SET selected_unit_ids = (
  SELECT COALESCE(array_agg(unit_id), ARRAY[]::uuid[])
  FROM unnest(bd.selected_unit_ids) AS unit_id
  WHERE unit_id NOT IN (SELECT id FROM target_units)
)
WHERE bd.selected_unit_ids && (SELECT array_agg(id) FROM target_units);

WITH target_units(id) AS (
  VALUES
    ('9decd3d3-2fb5-41ef-9d62-df951ed62b5c'::uuid),
    ('7657b574-831c-48c6-be54-4d5391f70905'::uuid)
)
DELETE FROM information_units iu
USING target_units tu
WHERE iu.id = tu.id
  AND iu.statement ILIKE '[DEBUG]%'
  AND iu.source_domain = 'example.invalid';

ROLLBACK;
