-- Civic Scout: Daily promise due-date notification via pg_cron + pg_net.
-- Dispatches to civic-notify-promises Edge Function at 08:00 UTC daily.

CREATE OR REPLACE FUNCTION check_due_promises()
RETURNS INTEGER AS $$
DECLARE
    project_url TEXT;
    service_key TEXT;
    due_count INTEGER;
BEGIN
    -- Check if there are any promises due today or in 7 days
    SELECT COUNT(*) INTO due_count
    FROM promises
    WHERE due_date IN (CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days')
      AND status NOT IN ('notified', 'fulfilled');

    IF due_count = 0 THEN
        RETURN 0;
    END IF;

    -- Get secrets from Vault
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets
        WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'check_due_promises: Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'check_due_promises: Vault secrets not configured';
        RETURN 0;
    END IF;

    -- Dispatch to Edge Function
    PERFORM net.http_post(
        url := project_url || '/functions/v1/civic-notify-promises',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || service_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );

    RETURN due_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: daily at 08:00 UTC
-- Note: Must be executed after pg_cron is enabled via Dashboard
--
-- SELECT cron.schedule(
--     'check-due-promises',
--     '0 8 * * *',
--     'SELECT check_due_promises()'
-- );
