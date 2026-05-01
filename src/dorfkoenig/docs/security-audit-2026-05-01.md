# Security Audit 2026-05-01

Scope: page-monitor unit provenance, scout dispatch, upload storage pipeline, and deployed Edge Function surface for project `ayksajwtwyjhvpqngvcb`.

## Findings

### Cross-scout contamination

Two debug canonical units were linked to later real scout occurrences:

- `9decd3d3-2fb5-41ef-9d62-df951ed62b5c`
- `7657b574-831c-48c6-be54-4d5391f70905`

The immediate hardening is `20260501020000_harden_canonical_unit_location_merge.sql`, which prevents exact and semantic canonical merges when both sides have incompatible normalized `location.city` values.

Cleanup is staged in `src/dorfkoenig/scripts/cleanup-debug-contamination.sql`. It starts with verification SELECTs and ends in `ROLLBACK`; switch to `COMMIT` only after reviewing production output.

### Scout dispatch stall

As of the audit, all active scouts were due and no scout execution had been created since `2026-04-29T15:08:11Z`, while auto-draft cron still ran on `2026-04-30`. This points at the `dispatch-due-scouts` job or its pg_net path, not a blanket cron outage.

`20260501021000_ensure_scout_dispatch_cron.sql` idempotently reschedules the `dispatch-due-scouts` cron job via `cron.unschedule` and `cron.schedule`, avoiding direct writes to `cron.job`.

After deploy, confirm by checking that active scouts are no longer all due and that recent `scout_executions` rows have been created:

```sql
SELECT status, count(*)
FROM scout_executions
WHERE created_at > now() - interval '2 hours'
GROUP BY status;
```

### Storage pipeline

The `uploads` bucket was private with expected MIME and size restrictions. The two `uniqueIndices.map is not a function` failures were from `2026-04-13` and predate the current review/finalize path, which now treats `uniqueIndices` as an array from `deduplicateSimilarStatements`.

Additional hardening in this change: `process-newspaper` now verifies that the requested `job_id`, `user_id`, and `storage_path` match before creating a signed URL.

### Edge Function surface

The following internal/scheduled functions now require an internal bearer token:

- `execute-scout`
- `execute-civic-scout`
- `process-newspaper`
- `bajour-auto-draft`
- `civic-notify-promises`

The helper accepts either `INTERNAL_FUNCTION_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`, so existing pg_net and service-role function-to-function calls continue to work. Prefer setting `INTERNAL_FUNCTION_SECRET` and updating pg_net dispatch headers in a later rotation.

Remote functions present but absent from local config should be decommissioned after confirming no external caller remains:

```bash
supabase --workdir ./src/dorfkoenig functions delete debug-path --project-ref ayksajwtwyjhvpqngvcb
supabase --workdir ./src/dorfkoenig functions delete send-test-email --project-ref ayksajwtwyjhvpqngvcb
supabase --workdir ./src/dorfkoenig functions delete bajour-generate-draft --project-ref ayksajwtwyjhvpqngvcb
```
