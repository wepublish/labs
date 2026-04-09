# Auto-Draft Scheduling — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Automated daily newsletter draft generation for 10 Basel-area villages

## Overview

At 6:00 PM daily, the system automatically selects relevant information units, generates a newsletter draft, saves it, and sends it for WhatsApp verification — for each active village. By 10:00 PM the CMS queries the `news` API and retrieves confirmed drafts.

The manual UI flow (KI-Entwurf) continues to work as before, using the same prompts. A new system prompt toggle in the UI lets editors see and test-modify the selection prompt.

## Data Unification

### Problem

Village data is scattered across three locations: `lib/gemeinden.json` (full geo data), `supabase/functions/_shared/gemeinden.json` (stripped id+name only), and `lib/villages.ts` (hardcoded scout ID mapping). Manual sync via comments.

### Solution

**Single canonical file: `src/dorfkoenig/lib/gemeinden.json`**

Each village entry gains a `scout_id` field:

```json
{
  "id": "aesch",
  "name": "Aesch",
  "canton": "BL",
  "latitude": 47.4712,
  "longitude": 7.5947,
  "scout_id": "ba000000-000b-4000-a000-00000000000b"
}
```

**Build-time sync:**
- `package.json` gets a `sync:gemeinden` script: `cp lib/gemeinden.json supabase/functions/_shared/gemeinden.json`
- Wired into `prebuild` and `predev` hooks (automatic on `npm run build` and `npm run dev`)
- CI gets a `diff` check as a safety net

**Frontend `lib/villages.ts`:**
- Remove hardcoded `VILLAGE_SCOUT_IDS` map
- `getScoutIdForVillage()` reads `scout_id` from the JSON entries
- Re-exports typed village list and helpers

**`Village` type** in `bajour/types.ts` gains `scout_id: string`.

**Consumers (no import path changes):**
- Frontend continues importing from `lib/gemeinden.json` or `lib/villages.ts`
- Edge functions continue importing from `../_shared/gemeinden.json`
- Both get the full data, identical content

## Prompt Consolidation

### Problem

Three prompts scattered across two locations: `COMPOSE_GUIDELINES` and `BAJOUR_NEWSLETTER_GUIDELINES` in `_shared/prompts.ts`, plus a hardcoded `buildSystemPrompt()` function inside `bajour-select-units/index.ts`. The `BAJOUR_NEWSLETTER_GUIDELINES` is used only by `bajour-generate-draft` which is dead code (never called from the frontend).

### Solution

**Two prompts in `_shared/prompts.ts`:**

1. **`INFORMATION_SELECT_PROMPT`** — tells the AI which information units to pick for a village newsletter. Extracted from the hardcoded `buildSystemPrompt()` in `bajour-select-units`. Includes placeholders for runtime values (`currentDate`, `recencyDays`). A `buildInformationSelectPrompt(currentDate, recencyDays, override?)` builder function is exported alongside the constant.

2. **`DRAFT_COMPOSE_PROMPT`** — tells the AI how to write the newsletter draft. Replaces both `COMPOSE_GUIDELINES` and `BAJOUR_NEWSLETTER_GUIDELINES`.

**Both flows use the same two prompts in the same order:**

```
Manual (UI):     bajour-select-units (INFORMATION_SELECT_PROMPT) -> compose (DRAFT_COMPOSE_PROMPT)
Automated (6PM): bajour-auto-draft  (INFORMATION_SELECT_PROMPT -> DRAFT_COMPOSE_PROMPT)
```

**Dead code removed:**
- Delete `bajour-generate-draft/` edge function (unused)
- Delete `BAJOUR_NEWSLETTER_GUIDELINES` and `COMPOSE_GUIDELINES`
- Delete `bajourApi.generateDraft` wrapper and its tests

## Backend Automation

### Architecture: Dispatcher Pattern (Approach B)

Matches the existing `dispatch_due_scouts()` pattern. pg_cron dispatches one edge function call per village via pg_net, with stagger delays.

```
pg_cron (6:00 PM Europe/Zurich)
  -> dispatch_auto_drafts()
    -> loops gemeinden.json, 10s stagger via pg_sleep(10)
      -> pg_net.http_post per village to bajour-auto-draft
```

### New Edge Function: `bajour-auto-draft`

One village per invocation. Uses `createServiceClient()` (service role, bypasses RLS).

**Pipeline:**

1. **Idempotency check** — query `bajour_drafts` for `village_id + (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Zurich')::date`. If a draft exists (not `abgelehnt`), skip.
2. **Log run** — insert into `auto_draft_runs` with status `running`.
3. **Select units** — import `INFORMATION_SELECT_PROMPT`, query unused units for the village's `scout_id` with 2-day recency, call LLM. Max 20 units cap. If zero units found, log as `skipped`, done.
4. **Generate draft** — import `DRAFT_COMPOSE_PROMPT`, call LLM with selected units.
5. **Save draft** — insert into `bajour_drafts` with `village_id`, `village_name`, `publication_date` (today Zurich), `user_id` (hardcoded existing user for now).
6. **Send WhatsApp verification** — call correspondents lookup + WhatsApp send. Failure is non-fatal: draft is saved regardless, logged as warning.
7. **Update run log** — set `auto_draft_runs` to `completed` or `failed` with duration and optional `draft_id`.

**Error handling:**
- Each step wrapped in try/catch
- On failure: update `auto_draft_runs` with `failed` status + error message
- Draft save happens before WhatsApp (step 5 before step 6)
- Add `AbortController` timeouts on LLM fetch calls (30s each)

### New pg Function: `dispatch_auto_drafts()`

New migration. Follows `dispatch_due_scouts()` pattern exactly:
- Reads `project_url` and `service_role_key` from vault
- Imports village list from `gemeinden.json` (hardcoded in migration as a literal array, or queried from a lightweight view)
- Loops through villages, fires `pg_net.http_post()` per village
- 10s stagger via `pg_sleep(10)`
- Passes `village_id`, `village_name`, `scout_id`, `user_id` in request body

### New Table: `auto_draft_runs`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT GENERATED ALWAYS AS IDENTITY | PK |
| village_id | TEXT NOT NULL | Village identifier |
| status | TEXT NOT NULL DEFAULT 'pending' | pending/running/completed/failed/skipped |
| error_message | TEXT | Nullable, set on failure |
| draft_id | UUID | Nullable, FK to bajour_drafts |
| started_at | TIMESTAMPTZ DEFAULT now() | Run start |
| completed_at | TIMESTAMPTZ | Set on terminal status |

CHECK constraint: `status IN ('pending', 'running', 'completed', 'failed', 'skipped')`.

RLS: service_role ALL. Authenticated users SELECT for dashboard visibility.

### pg_cron Schedules

| Job | Schedule | Timezone | Command |
|-----|----------|----------|---------|
| `dispatch-auto-drafts` | `0 18 * * *` | Europe/Zurich | `SELECT dispatch_auto_drafts()` |
| `resolve-bajour-timeouts` | `0 21 * * *` | Europe/Zurich | `SELECT resolve_bajour_timeouts()` |

Verify pg_cron version >= 1.6 for timezone parameter support.

### Timeout Handling

- WhatsApp verification sent at ~6:00 PM, 2-hour timeout window
- `resolve_bajour_timeouts()` runs once at 9:00 PM — auto-confirms any drafts still `ausstehend` past their timeout
- By 10:00 PM when the CMS queries, all drafts are resolved

## UI Changes

### System Prompt Toggle in AISelectDropdown

New collapsible section between the editor instructions textarea and the footer:

- **Collapsed by default** — label: "System-Prompt", disclosure triangle
- **When expanded** — textarea pre-filled with `INFORMATION_SELECT_PROMPT`, fetched via a lightweight GET on `bajour-select-units`
- **Editable for that run** — modifications sent as the system prompt override
- **Resets on close/reopen** — no persistence, default always comes from the file

The existing editor instructions textarea ("z.B. Bevorzuge kulturelle Veranstaltungen...") remains separate — it's appended after the system prompt.

### Prompt Retrieval

Add a GET handler to `bajour-select-units`: returns `{ data: { prompt: INFORMATION_SELECT_PROMPT } }`. The frontend fetches this once when the dropdown opens to pre-fill the textarea. No frontend duplication of the prompt constant.

## Cleanup

### Files to Delete
- `supabase/functions/bajour-generate-draft/` (entire directory)

### Code to Remove
- `[functions.bajour-generate-draft]` from `supabase/config.toml`
- `bajourApi.generateDraft` from `bajour/api.ts`
- `generateDraft` tests from `bajour/__tests__/api.test.ts`
- `BAJOUR_NEWSLETTER_GUIDELINES` from `_shared/prompts.ts`
- `COMPOSE_GUIDELINES` from `_shared/prompts.ts`
- "Canonical source: keep in sync" comment from `news/index.ts`

### Renames
- `COMPOSE_GUIDELINES` -> `DRAFT_COMPOSE_PROMPT` (update import in `compose/index.ts`)

## Documentation Updates

| File | Change |
|------|--------|
| `src/dorfkoenig/CLAUDE.md` | Remove bajour-generate-draft from edge function table. Add bajour-auto-draft. Update prompts description. Add auto_draft_runs to store APIs section. |
| `src/dorfkoenig/supabase/CLAUDE.md` | Remove bajour-generate-draft from edge function table. Add bajour-auto-draft with pipeline description. Add auto_draft_runs to schema section. Add dispatch_auto_drafts() and resolve_bajour_timeouts cron to DB functions table. Update prompt constant names. |
| `specs/API.md` | Remove bajour-generate-draft endpoint. Add bajour-auto-draft endpoint. Add GET on bajour-select-units for prompt retrieval. |
| `specs/DATABASE.md` | Add auto_draft_runs table schema. Add dispatch_auto_drafts() function. Add cron schedule documentation. |
| `specs/PIPELINES.md` | Add auto-draft pipeline section (6 PM dispatch -> select -> compose -> save -> verify -> 9 PM timeout sweep -> 10 PM CMS query). |

## CI Changes

Add to GitHub Actions workflow:
```yaml
- run: diff src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/supabase/functions/_shared/gemeinden.json
```

## New Files

- `supabase/functions/bajour-auto-draft/index.ts`
- Migration: `YYYYMMDD_auto_draft_scheduling.sql` (dispatch_auto_drafts function, auto_draft_runs table, cron schedules)

## Modified Files

- `lib/gemeinden.json` (add scout_id per village)
- `lib/villages.ts` (remove hardcoded map, read from JSON)
- `bajour/types.ts` (add scout_id to Village type)
- `_shared/prompts.ts` (two clean prompts, remove old ones)
- `_shared/gemeinden.json` (now a build-time copy, full data)
- `compose/index.ts` (import DRAFT_COMPOSE_PROMPT)
- `bajour-select-units/index.ts` (import shared prompt, add GET handler)
- `components/compose/AISelectDropdown.svelte` (system prompt toggle)
- `supabase/config.toml` (remove bajour-generate-draft, add bajour-auto-draft)
- `package.json` (sync:gemeinden script, prebuild/predev hooks)
- GitHub Actions workflow (CI diff check)
- 5 documentation files
