-- Civic Scout: Add scout_type discriminator, civic-specific columns, and promises table.

-- ============================================================================
-- FIX: Ensure provider/content_hash columns exist (migration recorded but absent)
-- ============================================================================

ALTER TABLE scouts ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE scouts ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- ============================================================================
-- SCOUTS TABLE: Add civic scout support
-- ============================================================================

-- Scout type discriminator (web = existing behavior, civic = council monitoring)
ALTER TABLE scouts ADD COLUMN IF NOT EXISTS scout_type TEXT NOT NULL DEFAULT 'web';
ALTER TABLE scouts ADD CONSTRAINT scouts_valid_type
    CHECK (scout_type IN ('web', 'civic'));

-- Civic-specific columns
ALTER TABLE scouts ADD COLUMN IF NOT EXISTS root_domain TEXT;
ALTER TABLE scouts ADD COLUMN IF NOT EXISTS tracked_urls TEXT[];
ALTER TABLE scouts ADD COLUMN IF NOT EXISTS processed_pdf_urls TEXT[];

-- ============================================================================
-- CONSTRAINT CHANGES
-- ============================================================================

-- Replace criteria constraint with conditional version:
-- civic scouts have optional criteria, web scouts in "any change" mode use empty string
ALTER TABLE scouts DROP CONSTRAINT IF EXISTS scouts_criteria_length;
ALTER TABLE scouts ADD CONSTRAINT scouts_criteria_length CHECK (
    scout_type = 'civic'
    OR criteria = ''
    OR char_length(criteria) BETWEEN 10 AND 1000
);

-- Make url nullable, conditional on scout_type
ALTER TABLE scouts ALTER COLUMN url DROP NOT NULL;
ALTER TABLE scouts DROP CONSTRAINT IF EXISTS scouts_valid_url;
ALTER TABLE scouts ADD CONSTRAINT scouts_valid_url CHECK (
    scout_type != 'web' OR url ~ '^https?://'
);

-- Civic-specific requirements
ALTER TABLE scouts ADD CONSTRAINT scouts_civic_requires_root_domain
    CHECK (scout_type != 'civic' OR root_domain IS NOT NULL);
ALTER TABLE scouts ADD CONSTRAINT scouts_civic_requires_tracked_urls
    CHECK (scout_type != 'civic' OR tracked_urls IS NOT NULL);

-- Defensive bounds on array columns
ALTER TABLE scouts ADD CONSTRAINT scouts_tracked_urls_max
    CHECK (tracked_urls IS NULL OR array_length(tracked_urls, 1) <= 2);
ALTER TABLE scouts ADD CONSTRAINT scouts_processed_urls_max
    CHECK (processed_pdf_urls IS NULL OR array_length(processed_pdf_urls, 1) <= 200);

-- ============================================================================
-- PROMISES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS promises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,

    -- Content
    promise_text TEXT NOT NULL,
    context TEXT,
    source_url TEXT,
    source_title TEXT,

    -- Dates
    -- meeting_date: extracted from document URL (maps from coJournalist's source_date)
    -- due_date: LLM-extracted future deadline for the promise
    meeting_date DATE,
    due_date DATE,
    date_confidence TEXT DEFAULT 'low',

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'new',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT promises_valid_status
        CHECK (status IN ('new', 'in_progress', 'fulfilled', 'broken', 'notified')),
    CONSTRAINT promises_valid_confidence
        CHECK (date_confidence IN ('high', 'medium', 'low'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promises_scout ON promises(scout_id);
CREATE INDEX IF NOT EXISTS idx_promises_user ON promises(user_id);
CREATE INDEX IF NOT EXISTS idx_promises_due_date ON promises(due_date)
    WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promises_status ON promises(user_id, status);

-- ============================================================================
-- RLS for promises
-- ============================================================================

ALTER TABLE promises ENABLE ROW LEVEL SECURITY;

-- Users can view their own promises
CREATE POLICY "Users can view their own promises"
    ON promises FOR SELECT
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

-- Users can update their own promises (status changes)
CREATE POLICY "Users can update their own promises"
    ON promises FOR UPDATE
    USING (
        user_id = COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.headers', true)::json->>'x-user-id'
        )
        OR current_setting('role', true) = 'service_role'
    );

-- Service role can manage all promises (INSERT from execution pipeline, bulk operations)
CREATE POLICY "Service role can manage promises"
    ON promises FOR ALL
    USING (current_setting('role', true) = 'service_role');

-- ============================================================================
-- TRIGGER: updated_at on promises (reuse existing function)
-- ============================================================================

CREATE TRIGGER promises_updated_at
    BEFORE UPDATE ON promises
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
