-- Add p_topic parameter to search_units_semantic and include topic in results
CREATE OR REPLACE FUNCTION search_units_semantic(
    p_user_id TEXT,
    p_query_embedding vector(1536),
    p_location_city TEXT DEFAULT NULL,
    p_topic TEXT DEFAULT NULL,
    p_unused_only BOOLEAN DEFAULT true,
    p_min_similarity REAL DEFAULT 0.3,
    p_limit INTEGER DEFAULT 50
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
    created_at TIMESTAMPTZ,
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
        u.created_at,
        (1 - (u.embedding <=> p_query_embedding))::REAL AS similarity
    FROM information_units u
    WHERE u.user_id = p_user_id
      AND (p_location_city IS NULL OR u.location->>'city' = p_location_city)
      AND (p_topic IS NULL OR u.topic ILIKE '%' || replace(replace(p_topic, '%', '\%'), '_', '\_') || '%')
      AND (NOT p_unused_only OR u.used_in_article = false)
      AND (1 - (u.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY u.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
