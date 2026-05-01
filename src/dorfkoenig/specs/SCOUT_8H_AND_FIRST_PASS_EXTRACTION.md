# Scout 8h Cadence + First-Pass Extraction Spec

> **Status:** draft (2026-05-01) · **Owner:** Tom · **Scope:** web scout scheduling cadence and the new-scout creation flow.
>
> This spec must be updated before implementation changes that affect scout scheduling, first-run baseline behaviour, or web scout extraction dispatch.

## Goals

- Change the existing `daily` scout cadence from every 24 hours to every 8 hours.
- Make the UI label match the new cadence.
- Add a new-scout option to run the first page through the normal extraction, deduplication, and canonical ingestion pipeline immediately after creation.
- Keep first-pass extraction filtered the same way as normal scout runs. This is an ingestion accelerator, not a separate lower-quality backfill path.

## Non-Goals

- Do not redesign scout frequency storage. The existing `frequency = 'daily'` value remains the database/API enum value; only its runtime meaning changes to 8 hours.
- Do not add per-scout custom cron times in this change. The current creation wizard shows time/day controls, but the backend does not persist or use them.
- Do not bypass criteria matching, listing-page handling, quality scoring, location assignment, subpage deduplication, or canonical unit upsert.
- Do not send notifications from first-pass extraction.
- Do not alter civic scout execution unless a type check reveals shared typing must move.

## Current System

### Scheduling

- `pg_cron` dispatches `dispatch_due_scouts()` every 15 minutes.
- `dispatch_due_scouts()` calls `should_run_scout(frequency, last_run_at)`.
- `should_run_scout()` currently maps:
  - `daily` -> `24` hours
  - `weekly` -> `168` hours
  - `biweekly` -> `336` hours in some docs/specs, but the live function validation path needs confirmation before touching it
  - `monthly` -> `720` hours
- Therefore the actual scheduling change should be a database function migration, not a pg_cron schedule change.

### New Scout Creation

- `ScoutModal.svelte` creates an inactive draft scout during Step 1 to run the website test.
- Step 2 currently updates that scout with the final name/frequency/provider/content hash and activates it.
- Backend activation initializes a baseline before the scout becomes schedulable.
- Baseline initialization intentionally prevents the first scheduled run from treating existing page content as a new change.

### Manual Run API

- Frontend already supports `scouts.run(id, { skip_notification, extract_units })`.
- `scouts/index.ts` forwards manual runs to `execute-scout`.
- `execute-scout` runs the normal pipeline:
  1. scrape
  2. change detection
  3. criteria analysis or summary
  4. execution summary dedup
  5. execution storage
  6. unit extraction
  7. Phase B subpage follow for listings
  8. notification
  9. scout update/finalize

## Target Behaviour

### 1. 8-Hour Cadence

`frequency = 'daily'` continues to exist, but means "run when at least 8 hours elapsed since `last_run_at`."

UI copy:

- Creation wizard frequency option: `Alle 8 Stunden`
- Scout edit form frequency option: `Alle 8 Stunden`
- Scout card frequency label: `Alle 8 Stunden`

Implementation:

- Add a migration that replaces `should_run_scout()` with:

```sql
threshold_hours := CASE p_frequency
  WHEN 'daily' THEN 8
  WHEN 'weekly' THEN 168
  WHEN 'biweekly' THEN 336
  WHEN 'monthly' THEN 720
  ELSE 8
END;
```

The `ELSE 8` fallback keeps unknown legacy values from silently waiting 24 hours when the UI says 8 hours.

### 2. First-Pass Extraction Toggle

Add a Step 2 toggle in the web scout creation modal:

- Label: `Beim Erstellen Informationen extrahieren`
- Default: `on`
- Helper text: `Startet nach dem Speichern einen ersten Lauf ohne Benachrichtigung und speichert passende Informationseinheiten.`

Submit flow:

1. User confirms Step 2.
2. UI updates the draft scout and activates it as today.
3. If toggle is enabled, UI calls:

```ts
await scouts.run(draftScoutId, {
  skip_notification: true,
  extract_units: true,
  force_extract: true,
});
```

4. UI does not block on full extraction completion beyond the existing run request returning `202`.
5. UI reloads scouts and closes the modal.

If the forced run dispatch fails, the modal should show the dispatch error. The scout should remain created/active because baseline creation already succeeded.

### 3. Forced Extraction Contract

Add `force_extract` to the public run API body and `forceExtract` to the internal worker request.

Frontend/API:

```ts
type ScoutRunOptions = {
  skip_notification?: boolean;
  extract_units?: boolean;
  force_extract?: boolean;
};
```

Edge function `scouts/index.ts`:

- Parse `force_extract`, default `false`.
- Forward to `execute-scout` as `forceExtract`.
- Keep `skipNotification` and `extractUnits` behaviour unchanged.

Edge function `execute-scout/index.ts`:

- Add `forceExtract?: boolean`.
- Forced extraction must bypass only baseline/change early exits.
- Forced extraction must not bypass:
  - criteria analysis
  - `analysis.matches`
  - `hasScope`
  - listing-page detection
  - seen-subpage filtering
  - unit extraction filters
  - canonical dedup/upsert
  - quality scoring
  - notification skip flag

Expected control-flow changes:

- Firecrawl change tracking:
  - If `changeStatus === 'same' && !forceExtract`, keep current early exit.
  - If `changeStatus === 'same' && forceExtract`, continue into criteria analysis/extraction with `change_status = 'same'`.
- `firecrawl_plain` first hash path:
  - If no `content_hash` and `!forceExtract`, keep current first-run baseline early exit.
  - If no `content_hash` and `forceExtract`, continue into criteria analysis/extraction and still write `content_hash` at the end.
- Notifications:
  - First-pass UI sends `skip_notification: true`.
  - Backend should not special-case this; it should honor the option.

## Failure-Mode Audit

| Risk | Why it can fail | Mitigation |
|---|---|---|
| Baseline consumes the first page and forced run extracts nothing | Current baseline setup makes the following run look like `same` for Firecrawl and `firecrawl_plain` scouts | Add `forceExtract` and bypass only the `same`/first-hash early exits |
| First-pass extraction creates noisy units | User wants more data, but not lower-quality data | Reuse normal `analysis.matches`, scope gate, extraction prompts, quality scoring, dedup, and canonical upsert |
| Notifications fire during database backfill | First-pass run is a deliberate ingestion action, not an alert-worthy content change | UI always sends `skip_notification: true`; tests assert forwarding |
| Duplicate information units flood the database | First-pass may process existing content already seen by other scouts or previous runs | Keep `unit_occurrences` seen-URL filtering, in-run embedding/text dedup, and `upsertCanonicalUnit()` |
| Listing pages ingest index boilerplate | Many scouts monitor news index pages | Preserve deterministic listing-page detection and Phase B subpage follow; manual-location listings should still extract subpages in auto mode with a location filter |
| Manual-location listing scouts store wrong village items | Phase B switches to auto extraction for listings, then filters to scout village | Keep `locationFilterCity` on Phase B for manual-location listing pages |
| Auto-location scouts with no manual village are blocked | Existing normal pipeline considers auto mode scoped | Keep `hasScope = locationMode === 'auto' || scout.location || scout.topic` |
| Specific-criteria scouts do not backfill anything | Criteria analysis may return `matches = false` | This is expected; "same filtering as normal pipeline" means criteria still gates extraction |
| First-pass run races with another execution | User may click Run Now or cron may dispatch shortly after activation | Existing `runScout()` checks for a recent running execution; forced run should use the same route |
| Cron dispatch starts immediately after activation before UI forced run | Newly activated scout has `last_run_at = null` until baseline/run updates it, so cron could pick it up | Baseline activation should set enough fields but may not set `last_run_at`; implementation should verify. If needed, activation should set `last_run_at = now()` or the UI forced run should tolerate a 409 and reload |
| `daily` label and backend cadence drift | UI uses constants, backend uses SQL function | Change both in the same PR and add tests/docs references |
| Existing docs/API mention 24h daily | Future agents may reintroduce old behaviour | Update `specs/DATABASE.md`, `specs/API.md`, and any relevant frontend docs after code changes |
| `biweekly` exists in UI/types but backend validation may reject it | Current `scouts/index.ts` validation only allows `daily`, `weekly`, `monthly`; specs mention `biweekly` | Do not mix with this change unless tests fail. Track as a separate bug or include a tiny validation fix if implementation touches frequency validation anyway |
| The creation modal closes while extraction is still running | Run API returns after dispatch, not after completion | Expected. The Scouts panel already shows running status after reload/polling. Do not block the modal for a long Edge Function |
| Forced run fails after scout activation | Network/worker dispatch failure can happen after baseline succeeded | Show dispatch error and leave the scout active. Do not delete an already activated scout |
| Firecrawl/OpenRouter cost spike | Default-on first-pass extraction can process many pages, especially listings | Keep Phase B cap and budgets. Consider a small UI hint for listing pages if usage spikes; do not raise caps in this change |

## Implementation Plan

### A. Database

- Add migration, e.g. `20260501001000_scout_daily_frequency_8h.sql`.
- Replace `should_run_scout()` to map `daily` and fallback to `8`.
- Confirm `dispatch_due_scouts()` does not need changes.

### B. Frontend Copy

- Update `FREQUENCY_OPTIONS_EXTENDED` in `src/dorfkoenig/lib/constants.ts`.
- Ensure Scout card, edit form, and creation wizard inherit the new label.

### C. Frontend First-Pass Toggle

- Add state in `ScoutModal.svelte`:

```ts
let extractOnFirstPass = $state(true);
```

- Reset it to `true` in `resetState()`.
- Pass it to `ScoutWizardStep2.svelte`.
- Add toggle UI in Step 2 near the frequency selector.
- On submit, after successful activation:
  - if enabled, call `scouts.run(draftScoutId, { skip_notification: true, extract_units: true, force_extract: true })`
  - then clear `draftScoutId`, reload scouts, reset, close

### D. API Types

- Add a reusable `ScoutRunOptions` type in `src/dorfkoenig/lib/types.ts`.
- Use it in:
  - `scoutsApi.run`
  - `stores/scouts.ts`
  - tests

### E. Edge Functions

- `scouts/index.ts`
  - Parse `force_extract` from run request.
  - Forward `forceExtract`.
- `execute-scout/index.ts`
  - Extend `ExecuteRequest`.
  - Bypass early exits only when forced.
  - Preserve final scout update and content hash update semantics.

### F. Tests

- Frontend/API tests:
  - `scoutsApi.run()` sends `force_extract`.
  - `ScoutModal` default toggle is on.
  - submit with toggle on dispatches forced run.
  - submit with toggle off does not dispatch forced run.
- Edge tests:
  - `runScout()` forwards `forceExtract`.
  - `execute-scout` keeps early exit for `same` without force.
  - `execute-scout` continues into analysis/extraction for `same` with force.
  - `firecrawl_plain` first hash path still writes content hash when forced.
- Migration/db test if local SQL test harness supports it:
  - `should_run_scout('daily', now() - interval '7 hours 59 minutes') = false`
  - `should_run_scout('daily', now() - interval '8 hours') = true`

## Rollout

1. Ship code and migration together.
2. Deploy Edge Functions touched by the run path:
   - `scouts`
   - `execute-scout`
3. Apply database migration.
4. Create one test scout with first-pass extraction on.
5. Confirm:
   - an execution row is created
   - `skip_notification` suppresses email
   - extracted/merged counts are visible in execution history
   - `unit_occurrences` links units to the scout
   - `last_run_at` is set

## Rollback

- Revert UI label to `Täglich`.
- Replace `should_run_scout()` with `daily -> 24`.
- Leave `force_extract` API support in place if already deployed; it is inert unless the UI sends it.
- If first-pass extraction causes cost or quality issues, disable the UI toggle default first (`false`) before removing backend support.

## Implementation Decisions

- Should first-pass extraction default to `on` for all web scouts, or only when the test result says `would_extract_units = true`?
  - Decision: default `on`. Step 1 already requires a manual scope or auto-location mode before the user can continue.
- Should activating a scout set `last_run_at` during baseline creation?
  - Decision: yes. Baseline activation sets `last_run_at = now()` to prevent cron racing the explicit first-pass run.
- Should `biweekly` validation be fixed in the same change?
  - Decision: yes. The UI/types already expose `biweekly`; the frequency migration also normalizes the database constraint and Edge validation.
