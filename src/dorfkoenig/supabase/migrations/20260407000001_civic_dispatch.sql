-- Update dispatch_due_scouts() to route civic scouts to execute-civic-scout.
-- Web scouts first (cheaper, 10s stagger), then civic scouts (20s stagger).

CREATE OR REPLACE FUNCTION dispatch_due_scouts()
RETURNS INTEGER AS $$
DECLARE
    scout_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
    target_function TEXT;
    stagger_seconds INTEGER;
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
        SELECT id, name, frequency, last_run_at, scout_type
        FROM scouts
        WHERE is_active = true
          AND consecutive_failures < 3
          AND should_run_scout(frequency, last_run_at)
        ORDER BY
            CASE WHEN scout_type = 'web' THEN 0 ELSE 1 END,
            last_run_at NULLS FIRST
        LIMIT 20
    LOOP
        -- Check for running execution (prevent duplicates)
        IF EXISTS (
            SELECT 1 FROM scout_executions
            WHERE scout_id = scout_record.id
              AND status = 'running'
              AND started_at > NOW() - INTERVAL '10 minutes'
        ) THEN
            CONTINUE;
        END IF;

        -- Route to correct execution function
        IF scout_record.scout_type = 'civic' THEN
            target_function := 'execute-civic-scout';
            stagger_seconds := 20;
        ELSE
            target_function := 'execute-scout';
            stagger_seconds := 10;
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

        -- Stagger dispatches (civic scouts need longer due to multi-call Firecrawl usage)
        PERFORM pg_sleep(stagger_seconds);
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
