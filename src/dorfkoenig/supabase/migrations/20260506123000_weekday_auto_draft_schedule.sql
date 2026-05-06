-- Auto drafts are prepared at 17:00 Zurich for the next morning.
-- Since Dorfkoenig publishes Monday-Friday only, the dispatcher must run
-- Sunday-Thursday only: Sunday -> Monday, Thursday -> Friday.

CREATE OR REPLACE FUNCTION public.dispatch_auto_drafts_tz_safe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  zurich_now timestamp;
  zurich_dow integer;
BEGIN
  zurich_now := now() AT TIME ZONE 'Europe/Zurich';
  zurich_dow := extract(dow FROM zurich_now);

  IF extract(hour FROM zurich_now) != 17 THEN
    RETURN;
  END IF;

  IF zurich_dow NOT BETWEEN 0 AND 4 THEN
    RETURN;
  END IF;

  PERFORM dispatch_auto_drafts();
END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-auto-drafts-summer');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-auto-drafts-winter');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('dispatch-auto-drafts-summer', '0 15 * * 0-4', 'SELECT dispatch_auto_drafts_tz_safe()');
SELECT cron.schedule('dispatch-auto-drafts-winter', '0 16 * * 0-4', 'SELECT dispatch_auto_drafts_tz_safe()');

COMMENT ON FUNCTION public.dispatch_auto_drafts_tz_safe IS
  'pg_cron wrapper: checks 17:xx Europe/Zurich and Sunday-Thursday only, then calls dispatch_auto_drafts(). Drafts are generated for next-morning Monday-Friday issues.';
