-- Canonical unit layer + provenance table for cross-run and cross-scout dedup.
-- Keeps information_units as the canonical fact table and stores per-hit provenance
-- in unit_occurrences. All future unit creation routes through upsert_canonical_unit().

SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE scout_executions
  ADD COLUMN IF NOT EXISTS merged_existing_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE information_units
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS context_excerpt TEXT;

ALTER TABLE information_units
  DROP CONSTRAINT IF EXISTS information_units_scout_id_fkey;

ALTER TABLE information_units
  ADD CONSTRAINT information_units_scout_id_fkey
  FOREIGN KEY (scout_id) REFERENCES scouts(id) ON DELETE SET NULL;

ALTER TABLE information_units
  DROP CONSTRAINT IF EXISTS information_units_execution_id_fkey;

ALTER TABLE information_units
  ADD CONSTRAINT information_units_execution_id_fkey
  FOREIGN KEY (execution_id) REFERENCES scout_executions(id) ON DELETE SET NULL;

UPDATE information_units
SET first_seen_at = COALESCE(first_seen_at, created_at),
    last_seen_at = COALESCE(last_seen_at, created_at),
    occurrence_count = COALESCE(occurrence_count, 1),
    source_count = COALESCE(source_count, 1)
WHERE first_seen_at IS NULL
   OR last_seen_at IS NULL;

ALTER TABLE information_units
  DROP CONSTRAINT IF EXISTS units_valid_type;

ALTER TABLE information_units
  ADD CONSTRAINT units_valid_type
  CHECK (unit_type = ANY (ARRAY['fact'::text, 'event'::text, 'entity_update'::text, 'promise'::text]));

CREATE TABLE IF NOT EXISTS unit_occurrences (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES information_units(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  scout_id UUID NULL REFERENCES scouts(id) ON DELETE CASCADE,
  execution_id UUID NULL REFERENCES scout_executions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL CHECK (source_url ~ '^(https?://|manual://)'),
  normalized_source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_title TEXT NULL,
  source_type TEXT NOT NULL DEFAULT 'scout'
    CHECK (source_type = ANY (ARRAY['scout'::text, 'manual_text'::text, 'manual_photo'::text, 'manual_pdf'::text])),
  file_path TEXT NULL CHECK (file_path IS NULL OR char_length(file_path) <= 500),
  article_url TEXT NULL,
  content_sha256 TEXT NULL,
  statement_hash TEXT NOT NULL,
  context_excerpt TEXT NULL,
  entities TEXT[] NOT NULL DEFAULT '{}'::text[],
  event_date DATE NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_occurrences_unit_extracted
  ON unit_occurrences (unit_id, extracted_at DESC);

CREATE INDEX IF NOT EXISTS idx_unit_occurrences_scout_extracted
  ON unit_occurrences (scout_id, extracted_at DESC);

CREATE INDEX IF NOT EXISTS idx_unit_occurrences_user_normalized_source_url
  ON unit_occurrences (user_id, normalized_source_url);

CREATE INDEX IF NOT EXISTS idx_unit_occurrences_user_content_sha256
  ON unit_occurrences (user_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unit_occurrences_user_statement_hash
  ON unit_occurrences (user_id, statement_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_occurrences_raw_capture_guard
  ON unit_occurrences (
    user_id,
    COALESCE(scout_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(execution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_source_url,
    COALESCE(content_sha256, ''),
    statement_hash
  );

CREATE INDEX IF NOT EXISTS idx_unit_occurrences_execution_extracted
  ON unit_occurrences (execution_id, extracted_at DESC);

ALTER TABLE unit_occurrences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'unit_occurrences'
      AND policyname = 'Users can view their own unit occurrences'
  ) THEN
    CREATE POLICY "Users can view their own unit occurrences"
      ON unit_occurrences FOR SELECT
      USING (
        user_id = COALESCE(
          current_setting('request.jwt.claims', true)::json->>'sub',
          current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'unit_occurrences'
      AND policyname = 'Service role can manage unit occurrences'
  ) THEN
    CREATE POLICY "Service role can manage unit occurrences"
      ON unit_occurrences FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END;
$$;

ALTER TABLE promises
  ADD COLUMN IF NOT EXISTS unit_id UUID NULL REFERENCES information_units(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_promises_user_unit_id
  ON promises (user_id, unit_id)
  WHERE unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION normalize_source_url(p_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_url IS NULL THEN NULL
    WHEN p_url ~ '^manual://' THEN lower(trim(p_url))
    ELSE regexp_replace(
      regexp_replace(lower(trim(p_url)), '#.*$', ''),
      '/+$',
      ''
    )
  END;
$$;

CREATE OR REPLACE FUNCTION normalize_statement(p_statement TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(btrim(COALESCE(p_statement, ''))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION unit_type_rank(p_unit_type TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_unit_type
    WHEN 'promise' THEN 4
    WHEN 'event' THEN 3
    WHEN 'fact' THEN 2
    WHEN 'entity_update' THEN 1
    ELSE 0
  END;
$$;

INSERT INTO unit_occurrences (
  unit_id,
  user_id,
  scout_id,
  execution_id,
  source_url,
  normalized_source_url,
  source_domain,
  source_title,
  source_type,
  file_path,
  article_url,
  content_sha256,
  statement_hash,
  context_excerpt,
  entities,
  event_date,
  extracted_at,
  created_at
)
SELECT
  iu.id,
  iu.user_id,
  iu.scout_id,
  iu.execution_id,
  iu.source_url,
  normalize_source_url(iu.source_url),
  iu.source_domain,
  iu.source_title,
  COALESCE(iu.source_type, 'scout'),
  iu.file_path,
  iu.article_url,
  NULL,
  encode(digest(normalize_statement(iu.statement), 'sha256'), 'hex'),
  iu.context_excerpt,
  COALESCE(iu.entities, '{}'::text[]),
  iu.event_date,
  COALESCE(iu.first_seen_at, iu.created_at),
  COALESCE(iu.first_seen_at, iu.created_at)
FROM information_units iu
WHERE NOT EXISTS (
  SELECT 1
  FROM unit_occurrences uo
  WHERE uo.unit_id = iu.id
);

CREATE OR REPLACE FUNCTION upsert_canonical_unit(
  p_user_id TEXT,
  p_statement TEXT,
  p_unit_type TEXT,
  p_source_url TEXT,
  p_embedding vector(1536),
  p_scout_id UUID DEFAULT NULL,
  p_execution_id UUID DEFAULT NULL,
  p_entities TEXT[] DEFAULT NULL,
  p_source_domain TEXT DEFAULT NULL,
  p_source_title TEXT DEFAULT NULL,
  p_location JSONB DEFAULT NULL,
  p_topic TEXT DEFAULT NULL,
  p_event_date DATE DEFAULT NULL,
  p_village_confidence TEXT DEFAULT NULL,
  p_review_required BOOLEAN DEFAULT FALSE,
  p_assignment_path TEXT DEFAULT NULL,
  p_publication_date DATE DEFAULT NULL,
  p_sensitivity TEXT DEFAULT NULL,
  p_is_listing_page BOOLEAN DEFAULT FALSE,
  p_article_url TEXT DEFAULT NULL,
  p_quality_score INTEGER DEFAULT NULL,
  p_source_type TEXT DEFAULT 'scout',
  p_file_path TEXT DEFAULT NULL,
  p_content_sha256 TEXT DEFAULT NULL,
  p_statement_hash TEXT DEFAULT NULL,
  p_context_excerpt TEXT DEFAULT NULL,
  p_extracted_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(unit_id UUID, occurrence_id UUID, merged_existing BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_now TIMESTAMPTZ := COALESCE(p_extracted_at, NOW());
  v_unit_id UUID;
  v_occurrence_id UUID;
  v_merged BOOLEAN := FALSE;
  v_normalized_source_url TEXT := normalize_source_url(p_source_url);
  v_statement_hash TEXT := COALESCE(
    p_statement_hash,
    encode(digest(normalize_statement(p_statement), 'sha256'), 'hex')
  );
  v_source_domain TEXT := COALESCE(
    NULLIF(trim(p_source_domain), ''),
    NULLIF(regexp_replace(regexp_replace(lower(COALESCE(p_source_url, '')), '^https?://', ''), '/.*$', ''), '')
  );
  v_entities TEXT[] := COALESCE(p_entities, '{}'::text[]);
  v_context_excerpt TEXT := NULLIF(trim(COALESCE(p_context_excerpt, '')), '');
  v_source_is_new BOOLEAN := TRUE;
  v_match_cosine REAL;
  v_same_domain BOOLEAN;
  v_near_date BOOLEAN;
  v_shared_entity BOOLEAN;
BEGIN
  IF p_statement IS NULL OR btrim(p_statement) = '' THEN
    RAISE EXCEPTION 'upsert_canonical_unit requires a non-empty statement';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || v_statement_hash, 0));

  IF p_scout_id IS NOT NULL THEN
    SELECT iu.id
      INTO v_unit_id
    FROM unit_occurrences uo
    JOIN information_units iu ON iu.id = uo.unit_id
    WHERE uo.user_id = p_user_id
      AND uo.scout_id = p_scout_id
      AND (
        (uo.normalized_source_url = v_normalized_source_url AND uo.statement_hash = v_statement_hash)
        OR (p_content_sha256 IS NOT NULL AND uo.content_sha256 = p_content_sha256 AND uo.statement_hash = v_statement_hash)
        OR uo.statement_hash = v_statement_hash
      )
    ORDER BY uo.extracted_at DESC
    LIMIT 1;
  END IF;

  IF v_unit_id IS NULL THEN
    SELECT iu.id
      INTO v_unit_id
    FROM unit_occurrences uo
    JOIN information_units iu ON iu.id = uo.unit_id
    WHERE uo.user_id = p_user_id
      AND (
        (uo.normalized_source_url = v_normalized_source_url AND uo.statement_hash = v_statement_hash)
        OR (p_content_sha256 IS NOT NULL AND uo.content_sha256 = p_content_sha256 AND uo.statement_hash = v_statement_hash)
        OR uo.statement_hash = v_statement_hash
      )
    ORDER BY uo.extracted_at DESC
    LIMIT 1;
  END IF;

  IF v_unit_id IS NULL THEN
    SELECT iu.id,
           (1 - (iu.embedding <=> p_embedding))::REAL AS cosine,
           (COALESCE(iu.source_domain, '') = COALESCE(v_source_domain, '')) AS same_domain,
           (
             iu.event_date IS NOT NULL
             AND p_event_date IS NOT NULL
             AND ABS(iu.event_date - p_event_date) <= 7
           ) AS near_date,
           (COALESCE(iu.entities, '{}'::text[]) && v_entities) AS shared_entity
      INTO v_unit_id, v_match_cosine, v_same_domain, v_near_date, v_shared_entity
    FROM information_units iu
    WHERE iu.user_id = p_user_id
      AND (1 - (iu.embedding <=> p_embedding)) >= 0.88
    ORDER BY iu.embedding <=> p_embedding
    LIMIT 1;

    IF v_unit_id IS NOT NULL AND NOT (
      v_match_cosine >= 0.93
      OR (
        v_match_cosine >= 0.88
        AND (COALESCE(v_same_domain, FALSE) OR COALESCE(v_near_date, FALSE) OR COALESCE(v_shared_entity, FALSE))
      )
    ) THEN
      v_unit_id := NULL;
    END IF;
  END IF;

  IF v_unit_id IS NULL THEN
    INSERT INTO information_units (
      user_id,
      scout_id,
      execution_id,
      statement,
      unit_type,
      entities,
      source_url,
      source_domain,
      source_title,
      location,
      embedding,
      used_in_article,
      topic,
      source_type,
      file_path,
      event_date,
      review_required,
      village_confidence,
      assignment_path,
      quality_score,
      publication_date,
      sensitivity,
      is_listing_page,
      article_url,
      first_seen_at,
      last_seen_at,
      occurrence_count,
      source_count,
      context_excerpt,
      created_at
    ) VALUES (
      p_user_id,
      p_scout_id,
      p_execution_id,
      p_statement,
      p_unit_type,
      v_entities,
      p_source_url,
      COALESCE(v_source_domain, 'unknown'),
      p_source_title,
      p_location,
      p_embedding,
      FALSE,
      p_topic,
      p_source_type,
      p_file_path,
      p_event_date,
      COALESCE(p_review_required, FALSE),
      p_village_confidence,
      p_assignment_path,
      p_quality_score,
      p_publication_date,
      p_sensitivity,
      COALESCE(p_is_listing_page, FALSE),
      p_article_url,
      v_now,
      v_now,
      1,
      1,
      v_context_excerpt,
      v_now
    )
    RETURNING id INTO v_unit_id;
  ELSE
    v_merged := TRUE;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM unit_occurrences uo
    WHERE uo.unit_id = v_unit_id
      AND uo.normalized_source_url = v_normalized_source_url
  )
  INTO v_source_is_new;

  INSERT INTO unit_occurrences (
    unit_id,
    user_id,
    scout_id,
    execution_id,
    source_url,
    normalized_source_url,
    source_domain,
    source_title,
    source_type,
    file_path,
    article_url,
    content_sha256,
    statement_hash,
    context_excerpt,
    entities,
    event_date,
    extracted_at,
    created_at
  ) VALUES (
    v_unit_id,
    p_user_id,
    p_scout_id,
    p_execution_id,
    p_source_url,
    v_normalized_source_url,
    COALESCE(v_source_domain, 'unknown'),
    p_source_title,
    p_source_type,
    p_file_path,
    p_article_url,
    p_content_sha256,
    v_statement_hash,
    v_context_excerpt,
    v_entities,
    p_event_date,
    v_now,
    v_now
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_occurrence_id;

  IF v_occurrence_id IS NOT NULL AND v_merged THEN
    UPDATE information_units iu
    SET last_seen_at = GREATEST(COALESCE(iu.last_seen_at, v_now), v_now),
        occurrence_count = COALESCE(iu.occurrence_count, 1) + 1,
        source_count = COALESCE(iu.source_count, 1) + CASE WHEN v_source_is_new THEN 1 ELSE 0 END,
        event_date = COALESCE(iu.event_date, p_event_date),
        context_excerpt = COALESCE(iu.context_excerpt, v_context_excerpt),
        source_title = COALESCE(iu.source_title, p_source_title),
        source_domain = COALESCE(iu.source_domain, v_source_domain),
        unit_type = CASE
          WHEN unit_type_rank(p_unit_type) > unit_type_rank(iu.unit_type) THEN p_unit_type
          ELSE iu.unit_type
        END,
        entities = (
          SELECT COALESCE(array_agg(DISTINCT e) FILTER (WHERE e IS NOT NULL AND e <> ''), '{}'::text[])
          FROM unnest(COALESCE(iu.entities, '{}'::text[]) || v_entities) AS e
        ),
        village_confidence = COALESCE(iu.village_confidence, p_village_confidence),
        review_required = COALESCE(iu.review_required, FALSE) OR COALESCE(p_review_required, FALSE),
        assignment_path = COALESCE(iu.assignment_path, p_assignment_path),
        publication_date = COALESCE(iu.publication_date, p_publication_date),
        sensitivity = COALESCE(iu.sensitivity, p_sensitivity),
        quality_score = GREATEST(COALESCE(iu.quality_score, 0), COALESCE(p_quality_score, 0))
    WHERE iu.id = v_unit_id;
  END IF;

  RETURN QUERY SELECT v_unit_id, v_occurrence_id, v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_canonical_unit(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  vector,
  UUID,
  UUID,
  TEXT[],
  TEXT,
  TEXT,
  JSONB,
  TEXT,
  DATE,
  TEXT,
  BOOLEAN,
  TEXT,
  DATE,
  TEXT,
  BOOLEAN,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) TO service_role;

DROP FUNCTION IF EXISTS search_units_semantic(TEXT, vector, TEXT, TEXT, BOOLEAN, REAL, INTEGER);
DROP FUNCTION IF EXISTS search_units_semantic(TEXT, vector, TEXT, TEXT, BOOLEAN, REAL, INTEGER, UUID);

CREATE FUNCTION search_units_semantic(
  p_user_id TEXT,
  p_query_embedding vector(1536),
  p_location_city TEXT DEFAULT NULL,
  p_topic TEXT DEFAULT NULL,
  p_unused_only BOOLEAN DEFAULT true,
  p_min_similarity REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 50,
  p_scout_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  statement TEXT,
  unit_type TEXT,
  entities TEXT[],
  source_url TEXT,
  source_domain TEXT,
  source_title TEXT,
  location JSONB,
  topic TEXT,
  source_type TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ,
  event_date DATE,
  used_in_article BOOLEAN,
  occurrence_count INTEGER,
  similarity REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.statement,
    u.unit_type,
    u.entities,
    u.source_url,
    u.source_domain,
    u.source_title,
    u.location,
    u.topic,
    u.source_type,
    u.file_path,
    u.created_at,
    u.event_date,
    u.used_in_article,
    u.occurrence_count,
    (1 - (u.embedding <=> p_query_embedding))::REAL AS similarity
  FROM information_units u
  WHERE u.user_id = p_user_id
    AND (p_location_city IS NULL OR u.location->>'city' = p_location_city)
    AND (p_topic IS NULL OR u.topic ILIKE '%' || replace(replace(p_topic, '%', '\%'), '_', '\_') || '%')
    AND (NOT p_unused_only OR u.used_in_article = false)
    AND (p_scout_id IS NULL OR EXISTS (
      SELECT 1
      FROM unit_occurrences uo
      WHERE uo.unit_id = u.id
        AND uo.scout_id = p_scout_id
    ))
    AND (1 - (u.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY u.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;
