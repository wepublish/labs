-- Bajour pilot allow-list. Optional Vault secret `bajour_pilot_villages`
-- (comma-separated lowercase IDs) restricts the daily auto-draft dispatch.
-- Unset/missing = all villages dispatch (post-pilot default).

CREATE OR REPLACE FUNCTION dispatch_auto_drafts()
RETURNS INTEGER AS $$
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
                'scout_id', village_record.scout_id,
                'user_id', auto_user_id
            )
        );

        dispatched_count := dispatched_count + 1;
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
