-- Keep the page-monitor dispatcher scheduled.
--
-- The 2026-05-01 audit found all active scouts due while scout executions had
-- stopped advancing, even though auto-draft cron still ran. This migration
-- reschedules the dispatch cron entry without directly updating cron.job,
-- which is not writable by the migration role on this Supabase instance.

SET search_path = public, extensions;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('dispatch-due-scouts');
  EXCEPTION WHEN OTHERS THEN
    -- Job may not exist yet. cron.schedule below is the source of truth.
    NULL;
  END;

  PERFORM cron.schedule(
    'dispatch-due-scouts',
    '*/15 * * * *',
    'SELECT dispatch_due_scouts()'
  );
END;
$$;
