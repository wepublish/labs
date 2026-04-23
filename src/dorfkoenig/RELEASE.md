# Dorfkoenig Internal V1 Release Notes

This is the operational baseline for internal releases. The goal is simple:

- function deploys always bundle from `./src/dorfkoenig`
- schema deploys stop when migration history is dirty
- every internal release follows the same short checklist

## Commands

Run everything from the repo root:

```bash
npm run release:dorfkoenig:preflight
npm run supabase:dorfkoenig:check
npm run deploy:dorfkoenig:schema
npm run deploy:dorfkoenig:function -- manual-upload bajour-auto-draft
npm run smoke:dorfkoenig
```

Useful wrappers:

```bash
npm run supabase:dorfkoenig -- migration list
npm run deploy:dorfkoenig:schema
npm run supabase:dorfkoenig -- functions deploy scouts --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb
```

## Rules

1. Do not run `db push` when `npm run supabase:dorfkoenig:check` fails.
2. Do not make dashboard SQL changes without creating a matching local migration immediately after.
3. Do not deploy functions from repo root with ad-hoc `--workdir` guesses. Use the wrapper scripts.
4. Run live smokes after backend deploys that touch scouts, unit extraction, draft generation, or dedup.

## Migration Status

Migration history was normalized on 2026-04-23.

Current expected state:

- `npm run supabase:dorfkoenig:check` passes
- `npm run deploy:dorfkoenig:schema` is allowed to proceed
- local migration versions are unique

Historical note:

- the duplicate local migration version at `20260423120000` was resolved by renaming the unit-dedup migration to `20260423120002`
- previously remote-only history entries were repaired to `reverted`
- previously local-only history entries that were already live in production were repaired to `applied`

## Repair Runbook

This should be done once, on a dedicated branch, before the next schema rollout.

1. Pull a remote schema snapshot:

```bash
npm run supabase:dorfkoenig -- db pull remote_baseline_20260423
```

2. For each remote-only version, decide whether it is:

- a manual/dashboard change that should stay remote-only and be marked `reverted` locally
- the same logical change as an existing local migration, in which case the local version should be marked `applied`

3. Repair the history table explicitly:

```bash
npm run supabase:dorfkoenig -- migration repair <version> --status applied
npm run supabase:dorfkoenig -- migration repair <version> --status reverted
```

4. Re-run:

```bash
npm run supabase:dorfkoenig:check
```

5. Only after that passes, resume `db push`.

## Notes

- Function deploys and schema deploys now use the same Supabase workdir wrapper.
- The migration guard is intended to stay in place permanently, not just for this cleanup.
