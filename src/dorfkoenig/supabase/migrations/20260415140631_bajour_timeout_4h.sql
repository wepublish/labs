-- Bajour verification window: 2h → 4h.
-- Drafts now time out at sent_at + 4h. Resolution cron shifts from 21:00 → 22:00 Zurich.
-- Matches the updated `bajour-send-verification` timeout literal.

CREATE OR REPLACE FUNCTION resolve_bajour_timeouts_tz_safe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only proceed if it's 22:xx in Zurich
  IF extract(hour FROM now() AT TIME ZONE 'Europe/Zurich') != 22 THEN
    RETURN;
  END IF;
  PERFORM resolve_bajour_timeouts();
END;
$$;

-- Reschedule the dual-slot cron entries.
-- Summer (CEST): 22:00 CEST = 20:00 UTC. Winter (CET): 22:00 CET = 21:00 UTC.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'resolve-timeouts-summer'),
  schedule := '0 20 * * *'
);
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'resolve-timeouts-winter'),
  schedule := '0 21 * * *'
);
