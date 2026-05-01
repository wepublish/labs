-- Harden canonical unit merges against cross-village provenance contamination.
--
-- Exact statement/source matches still merge, but only when both sides either
-- have compatible location.city values or one side has no city. Semantic
-- matches also keep the existing dual embedding + trigram guard and now use the
-- same location compatibility check.

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION normalize_unit_city(p_city TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_city IS NULL OR btrim(p_city) = '' THEN NULL
    ELSE replace(
      replace(
        replace(
          replace(lower(btrim(p_city)), 'ä', 'ae'),
          'ö', 'oe'
        ),
        'ü', 'ue'
      ),
      'ß', 'ss'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION unit_locations_compatible(p_existing JSONB, p_incoming JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    normalize_unit_city(p_existing->>'city') IS NULL
    OR normalize_unit_city(p_incoming->>'city') IS NULL
    OR normalize_unit_city(p_existing->>'city') = normalize_unit_city(p_incoming->>'city'),
    TRUE
  );
$$;

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
  p_extracted_at TIMESTAMPTZ DEFAULT NOW(),
  p_draft_id UUID DEFAULT NULL
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
  v_normalized_statement TEXT := normalize_statement(p_statement);
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
  v_match_trgm REAL;
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
      AND unit_locations_compatible(iu.location, p_location)
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
      AND unit_locations_compatible(iu.location, p_location)
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
           similarity(normalize_statement(iu.statement), v_normalized_statement)::REAL AS trgm,
           (COALESCE(iu.source_domain, '') = COALESCE(v_source_domain, '')) AS same_domain,
           (
             iu.event_date IS NOT NULL
             AND p_event_date IS NOT NULL
             AND ABS(iu.event_date - p_event_date) <= 7
           ) AS near_date,
           (COALESCE(iu.entities, '{}'::text[]) && v_entities) AS shared_entity
      INTO v_unit_id, v_match_cosine, v_match_trgm, v_same_domain, v_near_date, v_shared_entity
    FROM information_units iu
    WHERE iu.user_id = p_user_id
      AND unit_locations_compatible(iu.location, p_location)
      AND (1 - (iu.embedding <=> p_embedding)) >= 0.88
      AND similarity(normalize_statement(iu.statement), v_normalized_statement) >= 0.70
    ORDER BY iu.embedding <=> p_embedding,
             similarity(normalize_statement(iu.statement), v_normalized_statement) DESC
    LIMIT 1;

    IF v_unit_id IS NOT NULL AND NOT (
      (v_match_cosine >= 0.96 AND v_match_trgm >= 0.70)
      OR (
        v_match_cosine >= 0.93
        AND v_match_trgm >= 0.70
        AND (COALESCE(v_same_domain, FALSE) OR COALESCE(v_near_date, FALSE) OR COALESCE(v_shared_entity, FALSE))
      )
      OR (
        v_match_cosine >= 0.88
        AND v_match_trgm >= 0.82
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
    draft_id,
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
    p_draft_id,
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

GRANT EXECUTE ON FUNCTION normalize_unit_city(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION unit_locations_compatible(JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION upsert_canonical_unit(
  TEXT, TEXT, TEXT, TEXT, vector,
  UUID, UUID, TEXT[], TEXT, TEXT, JSONB, TEXT, DATE, TEXT,
  BOOLEAN, TEXT, DATE, TEXT, BOOLEAN, TEXT, INTEGER,
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO service_role;
