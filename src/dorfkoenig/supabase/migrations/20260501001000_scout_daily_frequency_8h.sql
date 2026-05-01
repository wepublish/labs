-- Reinterpret the existing `daily` scout frequency as an 8-hour cadence.
-- The dispatcher still runs every 15 minutes; this function decides whether a
-- scout is due.

CREATE OR REPLACE FUNCTION should_run_scout(
    p_frequency TEXT,
    p_last_run_at TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
    hours_elapsed REAL;
    threshold_hours REAL;
BEGIN
    IF p_last_run_at IS NULL THEN
        RETURN true;
    END IF;

    hours_elapsed := EXTRACT(EPOCH FROM (NOW() - p_last_run_at)) / 3600;

    threshold_hours := CASE p_frequency
        WHEN 'daily' THEN 8
        WHEN 'weekly' THEN 168
        WHEN 'biweekly' THEN 336
        WHEN 'monthly' THEN 720
        ELSE 8
    END;

    RETURN hours_elapsed >= threshold_hours;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.should_run_scout(text, timestamptz)
  SET search_path = public, extensions;

ALTER TABLE scouts DROP CONSTRAINT IF EXISTS scouts_valid_frequency;
ALTER TABLE scouts
  ADD CONSTRAINT scouts_valid_frequency
  CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly'));
