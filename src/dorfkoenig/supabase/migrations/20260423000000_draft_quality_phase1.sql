-- Phase 1 of the Dorfkönig draft-quality overhaul.
-- See src/dorfkoenig/specs/DRAFT_QUALITY.md for the full plan.
--
-- All changes are additive:
--   * bajour_drafts gains schema_version + bullets_json (v2 bullet schema lives here)
--   * information_units gains quality_score + publication_date + sensitivity +
--     is_listing_page + article_url (all nullable/defaulted for backfill-free rollout)
--   * user_prompts gains based_on_version (§3.6 hygiene)
--   * bajour_feedback_examples table (capture-only — retrieval is deferred per §8)
--   * draft_quality_metrics table + weekly_quality_summary() function (§5)
--
-- Feature flags gate runtime use of every new column/table:
--   VITE_FEATURE_BULLET_SCHEMA     — writes bullets_json on new drafts
--   use_quality_gating             — bajour-auto-draft filter applies quality_score
--   draft_validation               — post-validation chain runs
--   feedback_capture_enabled       — whatsapp webhook harvests rejected bullets
--   feature_empty_path_email       — admin emails on no-draft days
--
-- Rollback: flag off + the additive columns remain harmless.

BEGIN;

-- ── bajour_drafts: v2 bullet schema support ────────────────────────────────

ALTER TABLE bajour_drafts
  ADD COLUMN IF NOT EXISTS schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bullets_json JSONB;

COMMENT ON COLUMN bajour_drafts.schema_version IS
  'DRAFT_QUALITY.md §3.1. 1 = legacy markdown body; 2 = bullets_json (bullet-only schema).';
COMMENT ON COLUMN bajour_drafts.bullets_json IS
  'DRAFT_QUALITY.md §3.1. { title, bullets: [{emoji,kind,text,article_url,source_domain,source_unit_ids}], notes_for_editor: [...] }';

-- ── information_units: enrichment fields ──────────────────────────────────

ALTER TABLE information_units
  ADD COLUMN IF NOT EXISTS quality_score INT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS sensitivity TEXT
    CHECK (sensitivity IS NULL OR sensitivity IN ('none','death','accident','crime','minor_safety')),
  ADD COLUMN IF NOT EXISTS is_listing_page BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS article_url TEXT;

COMMENT ON COLUMN information_units.quality_score IS
  'DRAFT_QUALITY.md §3.2.2. Deterministic 0-100 score computed at ingest.';
COMMENT ON COLUMN information_units.publication_date IS
  'DRAFT_QUALITY.md §3.3. Date the article was published (distinct from scrape/ingest time).';
COMMENT ON COLUMN information_units.sensitivity IS
  'DRAFT_QUALITY.md §3.3.2. Drives handling rules for deaths/accidents/crime.';
COMMENT ON COLUMN information_units.is_listing_page IS
  'DRAFT_QUALITY.md §3.3.1. True when the extractor read an index/listing page, not an article body.';
COMMENT ON COLUMN information_units.article_url IS
  'DRAFT_QUALITY.md §3.3. URL of the specific article (may differ from source_url when scraping listings).';

-- Index to support bajour-auto-draft compound filter (§3.2.1).
CREATE INDEX IF NOT EXISTS idx_units_village_quality_dates
  ON information_units (((location->>'city')), quality_score DESC, event_date, created_at DESC)
  WHERE used_in_article = FALSE;

-- ── user_prompts: version hygiene ──────────────────────────────────────────

ALTER TABLE user_prompts
  ADD COLUMN IF NOT EXISTS based_on_version INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN user_prompts.based_on_version IS
  'DRAFT_QUALITY.md §3.6. Version of the default prompt this override was derived from.';

-- ── bajour_feedback_examples: capture-only (retrieval deferred §8) ─────────

CREATE TABLE IF NOT EXISTS bajour_feedback_examples (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id        UUID REFERENCES bajour_drafts(id) ON DELETE SET NULL,
  village_id      TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('positive','negative')),
  bullet_text     TEXT NOT NULL,
  editor_reason   TEXT,
  source_unit_ids UUID[] NOT NULL DEFAULT '{}',
  edition_date    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bajour_feedback_examples IS
  'DRAFT_QUALITY.md §3.7. Capture-only in current scope; retrieval lives in specs/followups/self-learning-system.md.';

CREATE INDEX IF NOT EXISTS idx_feedback_village_kind
  ON bajour_feedback_examples (village_id, kind, created_at DESC);

ALTER TABLE bajour_feedback_examples ENABLE ROW LEVEL SECURITY;

-- service_role has implicit bypass; authenticated users read own-village rows.
DROP POLICY IF EXISTS "bajour_feedback_examples_select" ON bajour_feedback_examples;
CREATE POLICY "bajour_feedback_examples_select"
  ON bajour_feedback_examples FOR SELECT
  TO authenticated
  USING (
    village_id IN (SELECT village_id FROM bajour_pilot_villages_list)
  );

-- ── draft_quality_metrics: per-draft scoring log (§5.1) ────────────────────

CREATE TABLE IF NOT EXISTS draft_quality_metrics (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id        UUID NOT NULL REFERENCES bajour_drafts(id) ON DELETE CASCADE,
  village_id      TEXT NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics         JSONB NOT NULL,
  aggregate_score INT NOT NULL,
  warnings        TEXT[] NOT NULL DEFAULT '{}',
  schema_version  INT NOT NULL
);

COMMENT ON TABLE draft_quality_metrics IS
  'DRAFT_QUALITY.md §5.1. Per-draft metric snapshot written at end of compose. Consumed by weekly_quality_summary().';

CREATE INDEX IF NOT EXISTS idx_quality_village_date
  ON draft_quality_metrics (village_id, computed_at DESC);

ALTER TABLE draft_quality_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "draft_quality_metrics_select" ON draft_quality_metrics;
CREATE POLICY "draft_quality_metrics_select"
  ON draft_quality_metrics FOR SELECT
  TO authenticated
  USING (
    village_id IN (SELECT village_id FROM bajour_pilot_villages_list)
  );

-- ── weekly_quality_summary(): one row per village (§5.2) ───────────────────

CREATE OR REPLACE FUNCTION weekly_quality_summary()
RETURNS TABLE (
  village_id            TEXT,
  drafts_last_7d        INT,
  drafts_last_28d       INT,
  empty_drafts_last_7d  INT,
  mean_score_7d         NUMERIC,
  mean_score_28d        NUMERIC,
  stddev_score_28d      NUMERIC,
  delta_sigma           NUMERIC,
  top_warning           TEXT,
  pilot_fixture_missing BOOLEAN
)
LANGUAGE SQL
STABLE
AS $$
  WITH win AS (
    SELECT
      bd.village_id,
      dqm.aggregate_score,
      bd.bullets_json,
      dqm.warnings,
      dqm.computed_at
    FROM draft_quality_metrics dqm
    JOIN bajour_drafts bd ON bd.id = dqm.draft_id
    WHERE dqm.computed_at >= NOW() - INTERVAL '28 days'
  ),
  agg AS (
    SELECT
      village_id,
      COUNT(*) FILTER (WHERE computed_at >= NOW() - INTERVAL '7 days') AS drafts_last_7d,
      COUNT(*)                                                          AS drafts_last_28d,
      COUNT(*) FILTER (
        WHERE computed_at >= NOW() - INTERVAL '7 days'
          AND (bullets_json IS NULL OR jsonb_array_length(COALESCE(bullets_json->'bullets', '[]'::jsonb)) = 0)
      ) AS empty_drafts_last_7d,
      AVG(aggregate_score) FILTER (WHERE computed_at >= NOW() - INTERVAL '7 days') AS mean_score_7d,
      AVG(aggregate_score)                                                          AS mean_score_28d,
      STDDEV_SAMP(aggregate_score)                                                  AS stddev_score_28d
    FROM win
    GROUP BY village_id
  ),
  warn AS (
    SELECT
      village_id,
      w AS warning,
      COUNT(*) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY village_id ORDER BY COUNT(*) DESC) AS rn
    FROM win, LATERAL UNNEST(warnings) AS w
    WHERE computed_at >= NOW() - INTERVAL '7 days'
    GROUP BY village_id, w
  )
  SELECT
    a.village_id,
    COALESCE(a.drafts_last_7d, 0)::INT,
    a.drafts_last_28d::INT,
    COALESCE(a.empty_drafts_last_7d, 0)::INT,
    ROUND(a.mean_score_7d, 1),
    ROUND(a.mean_score_28d, 1),
    ROUND(a.stddev_score_28d, 2),
    CASE
      WHEN a.stddev_score_28d IS NULL OR a.stddev_score_28d = 0 THEN NULL
      WHEN a.drafts_last_28d < 10 THEN NULL
      ELSE ROUND((a.mean_score_7d - a.mean_score_28d) / a.stddev_score_28d, 2)
    END AS delta_sigma,
    (SELECT warning FROM warn w WHERE w.village_id = a.village_id AND w.rn = 1) AS top_warning,
    -- Pilot-coverage check placeholder: flip to TRUE if you add a fixtures catalogue table
    -- and a village has no fixture within 7 days of joining the pilot.
    FALSE AS pilot_fixture_missing
  FROM agg a
  ORDER BY a.village_id;
$$;

COMMENT ON FUNCTION weekly_quality_summary IS
  'DRAFT_QUALITY.md §5.2. Advisory metrics — Tom flags rows himself. abs(delta_sigma) > 2 AND drafts_last_28d >= 10 is the alert threshold.';

-- ── Positive-example seed backfill (§3.7.4) ────────────────────────────────
-- Source: /Users/tomvaillant/buried_signals/wepublish/Feedback Dorfkönig.md
-- Gold bullets the manual editor published across three Arlesheim editions.
-- Inserted only on first apply (idempotent via draft_id IS NULL guard).

INSERT INTO bajour_feedback_examples (village_id, kind, bullet_text, editor_reason, edition_date)
SELECT * FROM (VALUES
  ('arlesheim'::TEXT, 'positive'::TEXT,
   '🏠 Die Villa Kaelin, erbaut 1930 von einem Schüler Rudolf Steiners, darf abgerissen werden, wie die bz Basel berichtet. Nachbar*innen reichten Beschwerde ein, diese wies das Bundesgericht nun ab.'::TEXT,
   'Goldstandard — Row 1, 20. Apr 2026'::TEXT,
   '2026-04-20'::DATE),
  ('arlesheim', 'positive',
   '🏗️ Die Bauarbeiten am Kindergarten «Im Lee» liegen gut im Zeitplan, meldet die Gemeinde. Momentan würden lärmintensive Abbrucharbeiten ausgeführt, welche unter anderem den Rückbau der bestehenden Bodenbeläge und Sanitäranlagen umfassen.',
   'Goldstandard — Row 1, 20. Apr 2026',
   '2026-04-20'),
  ('arlesheim', 'positive',
   '🚗 Der neue Straumann-Hauptsitz in Uptown Basel bringt ab 2027 rund 700 zusätzliche Mitarbeitende — und damit neuen Druck auf Strasse und Schiene, wie die bz Basel berichtet.',
   'Goldstandard — Row 2',
   NULL),
  ('arlesheim', 'positive',
   '🗳️ «Ochsen»-Wirtin Barbara Jenzer meldet sich mit einem deutlichen Appell zur aktuellen Abstimmungsdebatte zu Wort. In einem Leserbrief in der gedruckten Ausgabe der «bz Basel» warnt sie vor der sogenannten «Chaos-Initiative».',
   'Goldstandard — Row 2, Print-only Leserbrief',
   NULL),
  ('arlesheim', 'positive',
   '🐈 Der vermisste 2-jährige Kater Silvester aus Arlesheim, der seit dem 5. April fehlte, ist wieder Zuhause. Er sei leicht abgemagert und sehr hungrig gewesen, als er nach Hause kam.',
   'Goldstandard — Row 2, good_news from Facebook group',
   NULL),
  ('arlesheim', 'positive',
   '🚧 Endspurt am Bärenbrunnenweg: Heute beginnen erste Vorarbeiten für den Belageinbau, der am Freitag durchgeführt wird und zu einer Sperrung für private Zufahren führt, wie die Gemeinde mitteilt. Wer sein Auto braucht, sollte es rechtzeitig aus der Bauzone umparkieren.',
   'Goldstandard — Row 3, lead bullet',
   NULL),
  ('arlesheim', 'positive',
   '📚 Gleich zwei Veranstaltungen locken heute ins Dorf: Den Anfang macht die «Gschichtezyt» für Kinder ab vier Jahren in der Gemeindebibliothek. Ab 14 Uhr nimmt Annette Biel die Kleinen mit auf grosse Abenteuer — der Eintritt ist frei und eine Anmeldung nicht nötig.',
   'Goldstandard — Row 3',
   NULL),
  ('arlesheim', 'positive',
   '🎶 Heute Abend um 18:30 Uhr erklärt die Klinik Arlesheim im Setzwerk, wie Musik direkt auf unsere Gesundheit und Psyche wirkt. Chefarzt Philipp Busche zeigt im kostenlosen Fachvortrag das spannende Zusammenspiel von Klängen und Körperfunktionen auf. Eine Anmeldung ist nicht erforderlich.',
   'Goldstandard — Row 3',
   NULL)
) AS seed(village_id, kind, bullet_text, editor_reason, edition_date)
WHERE NOT EXISTS (
  SELECT 1 FROM bajour_feedback_examples
  WHERE village_id = seed.village_id AND bullet_text = seed.bullet_text
);

COMMIT;
