-- Drop the fake, hardcoded scout_id from dispatch_auto_drafts.
-- The edge function now filters units by location->>city = village_name,
-- so scout_id in the payload is no longer used.

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
    pilot_list TEXT[] := NULL;
BEGIN
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key';
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

    SELECT string_to_array(decrypted_secret, ',') INTO pilot_list
    FROM vault.decrypted_secrets WHERE name = 'bajour_pilot_villages';

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
        WHERE pilot_list IS NULL OR v.village_id = ANY(pilot_list)
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
