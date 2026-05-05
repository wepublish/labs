-- Fix production cron dispatch regressions found on 2026-05-05.
--
-- 1. dispatch_due_scouts ran every 15 minutes but failed after 120s because
--    it slept 10-30s per scout inside the pg_cron statement. pg_net requests
--    are transactional, so the timeout rolled back the queued dispatches.
-- 2. dispatch_auto_drafts reads its bearer from Vault. The Vault secret can
--    drift from the deployed Edge Function secret, so prefer an
--    internal_function_secret when present and keep service_role_key fallback.

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION dispatch_due_scouts()
RETURNS INTEGER AS $$
DECLARE
    scout_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
    target_function TEXT;
    scout_host TEXT;
    dispatched_hosts TEXT[] := '{}'::TEXT[];
BEGIN
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets
        WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets
        WHERE name = 'internal_function_secret';

        IF service_key IS NULL THEN
            SELECT decrypted_secret INTO service_key
            FROM vault.decrypted_secrets
            WHERE name = 'service_role_key';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'Vault secrets not configured';
        RETURN 0;
    END IF;

    FOR scout_record IN
        SELECT id, name, frequency, last_run_at, scout_type, url
        FROM scouts
        WHERE is_active = true
          AND consecutive_failures < 3
          AND should_run_scout(frequency, last_run_at)
        ORDER BY
            CASE WHEN scout_type = 'web' THEN 0 ELSE 1 END,
            last_run_at NULLS FIRST
        LIMIT 8
    LOOP
        IF EXISTS (
            SELECT 1
            FROM scout_executions
            WHERE scout_id = scout_record.id
              AND status = 'running'
              AND started_at > NOW() - INTERVAL '10 minutes'
        ) THEN
            CONTINUE;
        END IF;

        scout_host := normalize_url_host(scout_record.url);

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

        IF scout_record.scout_type = 'civic' THEN
            target_function := 'execute-civic-scout';
        ELSE
            target_function := 'execute-scout';
        END IF;

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
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.dispatch_due_scouts()
  SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.dispatch_auto_drafts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    village_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
    auto_user_id TEXT;
    pilot_list TEXT[];
BEGIN
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets WHERE name = 'internal_function_secret';

        IF service_key IS NULL THEN
            SELECT decrypted_secret INTO service_key
            FROM vault.decrypted_secrets WHERE name = 'service_role_key';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'dispatch_auto_drafts: Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'dispatch_auto_drafts: Vault secrets not configured';
        RETURN 0;
    END IF;

    BEGIN
        SELECT decrypted_secret INTO auto_user_id
        FROM vault.decrypted_secrets WHERE name = 'auto_draft_user_id';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'dispatch_auto_drafts: Could not retrieve auto_draft_user_id: %', SQLERRM;
        RETURN 0;
    END;

    IF auto_user_id IS NULL THEN
        RAISE WARNING 'dispatch_auto_drafts: auto_draft_user_id not configured in Vault';
        RETURN 0;
    END IF;

    SELECT COALESCE(ARRAY_AGG(village_id), ARRAY[]::TEXT[])
      INTO pilot_list
      FROM bajour_pilot_villages_list;

    FOR village_record IN
        SELECT *
        FROM (VALUES
            ('aesch',          'Aesch'),
            ('allschwil',      'Allschwil'),
            ('arlesheim',      'Arlesheim'),
            ('binningen',      'Binningen'),
            ('bottmingen',     'Bottmingen'),
            ('muenchenstein',  'Münchenstein'),
            ('muttenz',        'Muttenz'),
            ('pratteln',       'Pratteln'),
            ('reinach',        'Reinach'),
            ('riehen',         'Riehen')
        ) AS v(village_id, village_name)
        WHERE v.village_id = ANY(pilot_list)
    LOOP
        PERFORM net.http_post(
            url := project_url || '/functions/v1/bajour-auto-draft',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'village_id', village_record.village_id,
                'village_name', village_record.village_name,
                'user_id', auto_user_id
            )
        );

        dispatched_count := dispatched_count + 1;
    END LOOP;

    RETURN dispatched_count;
END;
$function$;
