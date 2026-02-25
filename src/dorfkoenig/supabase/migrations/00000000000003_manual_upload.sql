-- Migration: Manual upload support
-- Allows journalists to manually upload text, photos, and PDFs as information units

-- Make scout_id and execution_id nullable for manual uploads
ALTER TABLE information_units ALTER COLUMN scout_id DROP NOT NULL;
ALTER TABLE information_units ALTER COLUMN execution_id DROP NOT NULL;

-- Add source_type discriminator
ALTER TABLE information_units
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'scout';
ALTER TABLE information_units
  ADD CONSTRAINT valid_source_type
    CHECK (source_type IN ('scout', 'manual_text', 'manual_photo', 'manual_pdf'));

-- Add file_path for storage references (photos/PDFs), with length constraint
ALTER TABLE information_units
  ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE information_units
  ADD CONSTRAINT file_path_length CHECK (file_path IS NULL OR char_length(file_path) <= 500);

-- Validate source_url for manual units (prevent stored XSS)
-- NOT VALID: only enforce on new inserts; validate existing rows separately
ALTER TABLE information_units
  ADD CONSTRAINT valid_source_url CHECK (source_url ~ '^(https?://|manual://)')
  NOT VALID;

-- Index for source_type filtering
CREATE INDEX IF NOT EXISTS idx_units_source_type
  ON information_units(user_id, source_type, created_at DESC);

-- RLS: allow users to INSERT their own manual units
CREATE POLICY "Users can insert their own units"
  ON information_units FOR INSERT
  WITH CHECK (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

-- RLS: allow users to DELETE their own units (for mistake removal)
CREATE POLICY "Users can delete their own units"
  ON information_units FOR DELETE
  USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

-- Rate limiting table for manual uploads
CREATE TABLE IF NOT EXISTS upload_rate_limits (
    user_id TEXT NOT NULL,
    upload_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user
  ON upload_rate_limits(user_id, upload_type, created_at DESC);

-- Must DROP first — cannot change return type with CREATE OR REPLACE
DROP FUNCTION IF EXISTS search_units_semantic(TEXT, vector, TEXT, TEXT, BOOLEAN, REAL, INTEGER);

CREATE FUNCTION search_units_semantic(
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
    source_type TEXT,
    file_path TEXT,
    created_at TIMESTAMPTZ,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.statement, u.unit_type, u.entities,
        u.source_url, u.source_domain, u.source_title,
        u.location, u.topic,
        u.source_type, u.file_path,
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
