-- Move auto-draft dispatch from 18:00 Europe/Zurich to 17:00 Europe/Zurich.
-- Pilot only has Arlesheim today; shifting cadence earlier so correspondents
-- have more daylight to verify drafts. Timeout resolution (22:00 Zurich)
-- stays put — widens the verification window from 4h to 5h.

-- 1. Update the TZ-safe guard to accept hour 17 instead of 18.
CREATE OR REPLACE FUNCTION public.dispatch_auto_drafts_tz_safe()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Only proceed if it's 17:xx in Zurich
  IF extract(hour FROM now() AT TIME ZONE 'Europe/Zurich') != 17 THEN
    RETURN;
  END IF;
  PERFORM dispatch_auto_drafts();
END;
$function$;

-- 2. Reschedule cron jobs. Dual-scheduled (summer CEST / winter CET) so one
-- of them always matches the 17:xx Zurich window across DST transitions.
--   Summer (CEST, UTC+2): 17:00 Zurich = 15:00 UTC  -> '0 15 * * *'
--   Winter (CET,  UTC+1): 17:00 Zurich = 16:00 UTC  -> '0 16 * * *'
-- The tz_safe guard suppresses the other one outside the correct DST half.

SELECT cron.unschedule('dispatch-auto-drafts-summer');
SELECT cron.unschedule('dispatch-auto-drafts-winter');

SELECT cron.schedule('dispatch-auto-drafts-summer', '0 15 * * *', 'SELECT dispatch_auto_drafts_tz_safe()');
SELECT cron.schedule('dispatch-auto-drafts-winter', '0 16 * * *', 'SELECT dispatch_auto_drafts_tz_safe()');

COMMENT ON FUNCTION public.dispatch_auto_drafts_tz_safe IS
  'pg_cron wrapper: checks if current hour in Europe/Zurich is 17, then calls dispatch_auto_drafts(). Dual-scheduled at 15:00 and 16:00 UTC (summer and winter) to cover both DST states. Moved 2026-04-23 from 18:00 Zurich.';
