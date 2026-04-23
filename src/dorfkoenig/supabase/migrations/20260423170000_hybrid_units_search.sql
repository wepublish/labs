-- Upgrade compose search from semantic-only ranking to true hybrid retrieval.
-- Strategy:
--   1. vector candidates from the existing HNSW embedding index
--   2. lexical candidates from trigram + full-text matches
--   3. weighted merge so exact terms can outrank semantically-near noise

SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION normalize_search_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      replace(
        replace(
          replace(
            replace(lower(COALESCE(p_text, '')), 'ä', 'ae'),
            'ö', 'oe'
          ),
          'ü', 'ue'
        ),
        'ß', 'ss'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION unit_search_document(
  p_statement TEXT,
  p_source_title TEXT,
  p_topic TEXT,
  p_entities TEXT[]
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_search_text(
    concat_ws(
      ' ',
      COALESCE(p_statement, ''),
      COALESCE(p_source_title, ''),
      COALESCE(p_topic, ''),
      array_to_string(COALESCE(p_entities, '{}'::TEXT[]), ' ')
    )
  );
$$;

CREATE OR REPLACE FUNCTION unit_search_vector(
  p_statement TEXT,
  p_source_title TEXT,
  p_topic TEXT,
  p_entities TEXT[]
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_tsvector(
    'simple',
    public.unit_search_document(p_statement, p_source_title, p_topic, p_entities)
  );
$$;

CREATE INDEX IF NOT EXISTS idx_units_hybrid_search_document_trgm
  ON information_units
  USING gin (public.unit_search_document(statement, source_title, topic, entities) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_units_hybrid_search_vector
  ON information_units
  USING gin (public.unit_search_vector(statement, source_title, topic, entities));

DROP FUNCTION IF EXISTS search_units_semantic(TEXT, vector, TEXT, TEXT, TEXT, BOOLEAN, REAL, INTEGER, UUID);

CREATE FUNCTION search_units_semantic(
  p_user_id TEXT,
  p_query_embedding vector(1536),
  p_query_text TEXT,
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
DECLARE
  v_query_text TEXT := public.normalize_search_text(p_query_text);
  v_tsquery tsquery;
  v_candidate_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50) * 5, 50), 250);
BEGIN
  IF v_query_text = '' THEN
    RAISE EXCEPTION 'p_query_text is required';
  END IF;

  v_tsquery := plainto_tsquery('simple', v_query_text);

  RETURN QUERY
  WITH semantic_candidates AS (
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
      (1 - (u.embedding <=> p_query_embedding))::REAL AS semantic_similarity
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
    LIMIT v_candidate_limit
  ),
  lexical_candidates AS (
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
      (1 - (u.embedding <=> p_query_embedding))::REAL AS semantic_similarity
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
      AND (
        public.unit_search_vector(u.statement, u.source_title, u.topic, u.entities) @@ v_tsquery
        OR public.unit_search_document(u.statement, u.source_title, u.topic, u.entities) % v_query_text
        OR strpos(public.unit_search_document(u.statement, u.source_title, u.topic, u.entities), v_query_text) > 0
      )
    ORDER BY GREATEST(
      similarity(public.unit_search_document(u.statement, u.source_title, u.topic, u.entities), v_query_text),
      CASE
        WHEN public.unit_search_vector(u.statement, u.source_title, u.topic, u.entities) @@ v_tsquery
          THEN LEAST(1.0::REAL, ts_rank_cd(public.unit_search_vector(u.statement, u.source_title, u.topic, u.entities), v_tsquery) * 4.0)::REAL
        ELSE 0.0::REAL
      END,
      CASE
        WHEN strpos(public.unit_search_document(u.statement, u.source_title, u.topic, u.entities), v_query_text) > 0
          THEN 1.0::REAL
        ELSE 0.0::REAL
      END
    ) DESC,
    u.created_at DESC
    LIMIT v_candidate_limit
  ),
  candidate_pool AS (
    SELECT * FROM semantic_candidates
    UNION ALL
    SELECT * FROM lexical_candidates
  ),
  deduped AS (
    SELECT
      cp.id,
      cp.statement,
      cp.unit_type,
      cp.entities,
      cp.source_url,
      cp.source_domain,
      cp.source_title,
      cp.location,
      cp.topic,
      cp.source_type,
      cp.file_path,
      cp.created_at,
      cp.event_date,
      cp.used_in_article,
      cp.occurrence_count,
      MAX(cp.semantic_similarity) AS semantic_similarity
    FROM candidate_pool cp
    GROUP BY
      cp.id,
      cp.statement,
      cp.unit_type,
      cp.entities,
      cp.source_url,
      cp.source_domain,
      cp.source_title,
      cp.location,
      cp.topic,
      cp.source_type,
      cp.file_path,
      cp.created_at,
      cp.event_date,
      cp.used_in_article,
      cp.occurrence_count
  ),
  scored AS (
    SELECT
      d.*,
      GREATEST(
        similarity(public.unit_search_document(d.statement, d.source_title, d.topic, d.entities), v_query_text),
        CASE
          WHEN public.unit_search_vector(d.statement, d.source_title, d.topic, d.entities) @@ v_tsquery
            THEN LEAST(1.0::REAL, ts_rank_cd(public.unit_search_vector(d.statement, d.source_title, d.topic, d.entities), v_tsquery) * 4.0)::REAL
          ELSE 0.0::REAL
        END
      )::REAL AS lexical_similarity,
      CASE
        WHEN strpos(public.unit_search_document(d.statement, d.source_title, d.topic, d.entities), v_query_text) > 0
          THEN 1.0::REAL
        ELSE 0.0::REAL
      END AS exact_phrase_match
    FROM deduped d
  )
  SELECT
    s.id,
    s.statement,
    s.unit_type,
    s.entities,
    s.source_url,
    s.source_domain,
    s.source_title,
    s.location,
    s.topic,
    s.source_type,
    s.file_path,
    s.created_at,
    s.event_date,
    s.used_in_article,
    s.occurrence_count,
    LEAST(
      1.0::REAL,
      GREATEST(
        (COALESCE(s.semantic_similarity, 0.0::REAL) * 0.55)
          + (s.lexical_similarity * 0.45)
          + (s.exact_phrase_match * 0.08),
        (s.lexical_similarity * 0.85)
          + (COALESCE(s.semantic_similarity, 0.0::REAL) * 0.15)
      )
    )::REAL AS similarity
  FROM scored s
  ORDER BY
    similarity DESC,
    s.lexical_similarity DESC,
    s.semantic_similarity DESC,
    s.occurrence_count DESC,
    s.event_date DESC NULLS LAST,
    s.created_at DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;
