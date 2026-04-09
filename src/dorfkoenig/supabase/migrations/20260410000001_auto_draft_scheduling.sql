-- Auto-draft scheduling: daily automated newsletter generation per village.
-- Dispatched by pg_cron at 18:00 Europe/Zurich, one edge function call per village.

-- 1. Run log table for monitoring
CREATE TABLE auto_draft_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    village_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    error_message TEXT,
    draft_id UUID REFERENCES bajour_drafts(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_auto_draft_runs_village_started
    ON auto_draft_runs (village_id, started_at);
CREATE INDEX idx_auto_draft_runs_status
    ON auto_draft_runs (status) WHERE status IN ('running', 'failed');

-- RLS: service role writes, authenticated users can read
ALTER TABLE auto_draft_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on auto_draft_runs"
    ON auto_draft_runs FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read auto_draft_runs"
    ON auto_draft_runs FOR SELECT
    USING (auth.role() = 'authenticated');

-- 2. Dispatch function: loops villages, fires pg_net per village with 10s stagger
CREATE OR REPLACE FUNCTION dispatch_auto_drafts()
RETURNS INTEGER AS $$
DECLARE
    village_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
    -- Hardcoded user ID for automated drafts (matches existing dev user)
    auto_user_id TEXT := 'tom';
BEGIN
    -- Get secrets from Vault
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets
        WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'dispatch_auto_drafts: Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'dispatch_auto_drafts: Vault secrets not configured';
        RETURN 0;
    END IF;

    -- Loop through villages (hardcoded list matching gemeinden.json)
    FOR village_record IN
        SELECT *
        FROM (VALUES
            ('aesch',          'Aesch',          'ba000000-000b-4000-a000-00000000000b'),
            ('allschwil',      'Allschwil',      'ba000000-0003-4000-a000-000000000003'),
            ('arlesheim',      'Arlesheim',      'ba000000-0005-4000-a000-000000000005'),
            ('binningen',      'Binningen',      'ba000000-0004-4000-a000-000000000004'),
            ('bottmingen',     'Bottmingen',     'ba000000-000c-4000-a000-000000000c00'),
            ('muenchenstein',  'Münchenstein',    'ba000000-0007-4000-a000-000000000007'),
            ('muttenz',        'Muttenz',        'ba000000-0006-4000-a000-000000000006'),
            ('pratteln',       'Pratteln',       'ba000000-000d-4000-a000-000000000d00'),
            ('reinach',        'Reinach',        'ba000000-0008-4000-a000-000000000008'),
            ('riehen',         'Riehen',         'ba000000-0001-4000-a000-000000000001')
        ) AS v(village_id, village_name, scout_id)
    LOOP
        -- Dispatch via pg_net
        PERFORM net.http_post(
            url := project_url || '/functions/v1/bajour-auto-draft',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'village_id', village_record.village_id,
                'village_name', village_record.village_name,
                'scout_id', village_record.scout_id,
                'user_id', auto_user_id
            )
        );

        dispatched_count := dispatched_count + 1;

        -- Stagger dispatches (10s between villages for LLM rate limits)
        IF dispatched_count < 10 THEN
            PERFORM pg_sleep(10);
        END IF;
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. pg_cron schedules (must be run separately after enabling pg_cron in Dashboard)
-- Requires pg_cron >= 1.6 for timezone parameter.
--
-- SELECT cron.schedule(
--     job_name   := 'dispatch-auto-drafts',
--     schedule   := '0 18 * * *',
--     command    := 'SELECT dispatch_auto_drafts()',
--     database   := 'postgres',
--     timezone   := 'Europe/Zurich'
-- );
--
-- SELECT cron.schedule(
--     job_name   := 'resolve-bajour-timeouts-daily',
--     schedule   := '0 21 * * *',
--     command    := 'SELECT resolve_bajour_timeouts()',
--     database   := 'postgres',
--     timezone   := 'Europe/Zurich'
-- );
