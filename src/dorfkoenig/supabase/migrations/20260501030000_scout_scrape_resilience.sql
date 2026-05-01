-- Add scrape diagnostics and avoid concurrent same-host web scout dispatches.

SET search_path = public, extensions;

ALTER TABLE scout_executions
  ADD COLUMN IF NOT EXISTS scrape_strategy TEXT,
  ADD COLUMN IF NOT EXISTS scrape_attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scrape_warning TEXT;

COMMENT ON COLUMN scout_executions.scrape_strategy IS
  'Primary scrape path used by execute-scout: combined, combined_retry, split, markdown_only_fallback.';
COMMENT ON COLUMN scout_executions.scrape_attempts IS
  'Number of Firecrawl scrape attempts made for the primary page.';
COMMENT ON COLUMN scout_executions.scrape_warning IS
  'Comma-separated scrape fallback warnings, for example combined_timeout or phase_b_skipped_raw_html_unavailable.';

CREATE OR REPLACE FUNCTION normalize_url_host(p_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(coalesce(p_url, '')), '^https?://(www\.)?', ''),
      '/.*$',
      ''
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION dispatch_due_scouts()
RETURNS INTEGER AS $$
DECLARE
    scout_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
    target_function TEXT;
    stagger_seconds NUMERIC;
    scout_host TEXT;
    dispatched_hosts TEXT[] := '{}'::TEXT[];
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
        RAISE WARNING 'Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'Vault secrets not configured';
        RETURN 0;
    END IF;

    -- Find and dispatch due scouts (web first, then civic)
    FOR scout_record IN
        SELECT id, name, frequency, last_run_at, scout_type, url
        FROM scouts
        WHERE is_active = true
          AND consecutive_failures < 3
          AND should_run_scout(frequency, last_run_at)
        ORDER BY
            CASE WHEN scout_type = 'web' THEN 0 ELSE 1 END,
            last_run_at NULLS FIRST
        LIMIT 20
    LOOP
        -- Check for running execution of the same scout (prevent duplicates)
        IF EXISTS (
            SELECT 1 FROM scout_executions
            WHERE scout_id = scout_record.id
              AND status = 'running'
              AND started_at > NOW() - INTERVAL '10 minutes'
        ) THEN
            CONTINUE;
        END IF;

        scout_host := normalize_url_host(scout_record.url);

        -- Avoid same-host web stampedes within this batch and across currently
        -- running executions. This protects Firecrawl and source sites such as
        -- bzbasel.ch when multiple scouts become due at once.
        IF scout_record.scout_type = 'web' AND scout_host IS NOT NULL THEN
            IF scout_host = ANY(dispatched_hosts) THEN
                CONTINUE;
            END IF;

            IF EXISTS (
                SELECT 1
                FROM scout_executions se
                JOIN scouts running_scout ON running_scout.id = se.scout_id
                WHERE se.status = 'running'
                  AND se.started_at > NOW() - INTERVAL '10 minutes'
                  AND running_scout.scout_type = 'web'
                  AND running_scout.id <> scout_record.id
                  AND normalize_url_host(running_scout.url) = scout_host
            ) THEN
                CONTINUE;
            END IF;
        END IF;

        -- Route to correct execution function, compute jittered stagger
        IF scout_record.scout_type = 'civic' THEN
            target_function := 'execute-civic-scout';
            stagger_seconds := 20 + (RANDOM() * 10);
        ELSE
            target_function := 'execute-scout';
            stagger_seconds := 10 + (RANDOM() * 5);
        END IF;

        -- Dispatch via pg_net
        PERFORM net.http_post(
            url := project_url || '/functions/v1/' || target_function,
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object('scoutId', scout_record.id)
        );

        dispatched_count := dispatched_count + 1;

        IF scout_record.scout_type = 'web' AND scout_host IS NOT NULL THEN
            dispatched_hosts := array_append(dispatched_hosts, scout_host);
        END IF;

        -- Jittered stagger to avoid cross-user synchronisation
        PERFORM pg_sleep(stagger_seconds);
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.dispatch_due_scouts()
  SET search_path = public, extensions;

ALTER FUNCTION public.normalize_url_host(text)
  SET search_path = public, extensions;
