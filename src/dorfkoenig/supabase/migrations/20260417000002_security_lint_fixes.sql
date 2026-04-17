-- Security lint cleanup (advisors: 2 ERROR, 14 WARN → 0).
--
-- 1. Enable RLS on two tables that only the service role reads/writes.
--    Absent policies = deny-all for anon/authenticated; service_role bypasses.
--    Behaviour-preserving because both tables are only accessed by edge
--    functions via createServiceClient() — see _shared/extraction-cache.ts
--    and manual-upload/index.ts.
-- 2. Flip the observability view to security_invoker so it respects the
--    caller's RLS on information_units instead of bypassing it.
-- 3. Pin search_path on every public function (14 overloads) to close the
--    search-path-hijack vector on SECURITY DEFINER functions.

-- The ALTER FUNCTION statements below reference the `vector` type (pgvector,
-- in the extensions schema), so the migration session itself needs extensions
-- on its search_path to resolve the type in the function signatures. Plain
-- SET (not SET LOCAL) because the CLI runs migrations outside a transaction.
SET search_path = public, extensions;

ALTER TABLE extraction_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER VIEW v_auto_mode_assignment_paths SET (security_invoker = on);

ALTER FUNCTION public.append_bajour_response(uuid, jsonb)                                      SET search_path = public, extensions;
ALTER FUNCTION public.check_due_promises()                                                     SET search_path = public, extensions;
ALTER FUNCTION public.check_duplicate_execution(uuid, vector, real, integer)                   SET search_path = public, extensions;
ALTER FUNCTION public.cleanup_expired_data()                                                   SET search_path = public, extensions;
ALTER FUNCTION public.dispatch_auto_drafts()                                                   SET search_path = public, extensions;
ALTER FUNCTION public.dispatch_auto_drafts_tz_safe()                                           SET search_path = public, extensions;
ALTER FUNCTION public.dispatch_due_scouts()                                                    SET search_path = public, extensions;
ALTER FUNCTION public.extend_unit_ttl()                                                        SET search_path = public, extensions;
ALTER FUNCTION public.resolve_bajour_timeouts()                                                SET search_path = public, extensions;
ALTER FUNCTION public.resolve_bajour_timeouts_tz_safe()                                        SET search_path = public, extensions;
ALTER FUNCTION public.search_units_semantic(text, vector, text, boolean, real, integer)        SET search_path = public, extensions;
ALTER FUNCTION public.search_units_semantic(text, vector, text, text, boolean, real, integer)  SET search_path = public, extensions;
ALTER FUNCTION public.should_run_scout(text, timestamptz)                                      SET search_path = public, extensions;
ALTER FUNCTION public.update_updated_at()                                                      SET search_path = public, extensions;
