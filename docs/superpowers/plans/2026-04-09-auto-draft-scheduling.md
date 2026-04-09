# Auto-Draft Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate daily newsletter draft generation for 10 Basel-area villages at 6 PM, with WhatsApp verification, so the CMS can query confirmed drafts at 10 PM.

**Architecture:** Dispatcher pattern via pg_cron + pg_net (matches existing `dispatch_due_scouts`). One edge function call per village, 10s stagger. Two shared prompts in `_shared/prompts.ts`. Single canonical `gemeinden.json` with build-time copy to edge functions.

**Tech Stack:** Svelte 5, TypeScript, Supabase Edge Functions (Deno), PostgreSQL, pg_cron, pg_net, OpenRouter LLM, WhatsApp Business API.

**Spec:** `docs/superpowers/specs/2026-04-09-auto-draft-scheduling-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/dorfkoenig/lib/gemeinden.json` | Add `scout_id` per village (canonical source) |
| Modify | `src/dorfkoenig/lib/villages.ts` | Remove hardcoded map, read `scout_id` from JSON |
| Modify | `src/dorfkoenig/bajour/types.ts` | Add `scout_id` to `Village` interface |
| Modify | `src/dorfkoenig/supabase/functions/_shared/prompts.ts` | Two prompts: `INFORMATION_SELECT_PROMPT` + `DRAFT_COMPOSE_PROMPT` |
| Modify | `src/dorfkoenig/supabase/functions/bajour-select-units/index.ts` | Import shared prompt, add GET handler |
| Modify | `src/dorfkoenig/supabase/functions/compose/index.ts` | Import `DRAFT_COMPOSE_PROMPT` |
| Modify | `src/dorfkoenig/bajour/api.ts` | Remove `generateDraft`, add `getSelectPrompt` |
| Modify | `src/dorfkoenig/bajour/__tests__/api.test.ts` | Remove `generateDraft` tests, add `getSelectPrompt` test |
| Modify | `src/dorfkoenig/components/compose/AISelectDropdown.svelte` | Add system prompt toggle |
| Modify | `src/dorfkoenig/supabase/config.toml` | Remove `bajour-generate-draft`, add `bajour-auto-draft` |
| Modify | `package.json` | Add `sync:gemeinden`, `prebuild`, `predev` |
| Modify | `.github/workflows/deploy.yml` | Add `gemeinden.json` diff check |
| Create | `src/dorfkoenig/supabase/functions/bajour-auto-draft/index.ts` | Auto-draft pipeline per village |
| Create | `src/dorfkoenig/supabase/migrations/20260410000000_auto_draft_scheduling.sql` | `auto_draft_runs` table, `dispatch_auto_drafts()`, cron jobs |
| Delete | `src/dorfkoenig/supabase/functions/bajour-generate-draft/` | Dead code removal |
| Modify | `src/dorfkoenig/CLAUDE.md` | Update docs |
| Modify | `src/dorfkoenig/supabase/CLAUDE.md` | Update docs |
| Modify | `src/dorfkoenig/specs/API.md` | Update docs |
| Modify | `src/dorfkoenig/specs/DATABASE.md` | Update docs |
| Modify | `src/dorfkoenig/specs/PIPELINES.md` | Update docs |

---

## Task 1: Data Unification — gemeinden.json + Village type

**Files:**
- Modify: `src/dorfkoenig/lib/gemeinden.json`
- Modify: `src/dorfkoenig/bajour/types.ts:3-9`
- Modify: `src/dorfkoenig/lib/villages.ts:1-30`

- [ ] **Step 1: Add `scout_id` to Village type**

In `src/dorfkoenig/bajour/types.ts`, add `scout_id` to the interface:

```typescript
export interface Village {
  id: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
  scout_id: string;
}
```

- [ ] **Step 2: Add `scout_id` to each village in gemeinden.json**

Update `src/dorfkoenig/lib/gemeinden.json` — add the `scout_id` field from the current `VILLAGE_SCOUT_IDS` map in `villages.ts` to each entry:

```json
[
  {
    "id": "aesch",
    "name": "Aesch",
    "canton": "BL",
    "latitude": 47.4712,
    "longitude": 7.5947,
    "scout_id": "ba000000-000b-4000-a000-00000000000b"
  },
  {
    "id": "allschwil",
    "name": "Allschwil",
    "canton": "BL",
    "latitude": 47.5508,
    "longitude": 7.5362,
    "scout_id": "ba000000-0003-4000-a000-000000000003"
  },
  {
    "id": "arlesheim",
    "name": "Arlesheim",
    "canton": "BL",
    "latitude": 47.4949,
    "longitude": 7.6207,
    "scout_id": "ba000000-0005-4000-a000-000000000005"
  },
  {
    "id": "binningen",
    "name": "Binningen",
    "canton": "BL",
    "latitude": 47.5407,
    "longitude": 7.5695,
    "scout_id": "ba000000-0004-4000-a000-000000000004"
  },
  {
    "id": "bottmingen",
    "name": "Bottmingen",
    "canton": "BL",
    "latitude": 47.5228,
    "longitude": 7.5745,
    "scout_id": "ba000000-000c-4000-a000-000000000c00"
  },
  {
    "id": "muenchenstein",
    "name": "Münchenstein",
    "canton": "BL",
    "latitude": 47.5167,
    "longitude": 7.6167,
    "scout_id": "ba000000-0007-4000-a000-000000000007"
  },
  {
    "id": "muttenz",
    "name": "Muttenz",
    "canton": "BL",
    "latitude": 47.5225,
    "longitude": 7.6451,
    "scout_id": "ba000000-0006-4000-a000-000000000006"
  },
  {
    "id": "pratteln",
    "name": "Pratteln",
    "canton": "BL",
    "latitude": 47.5189,
    "longitude": 7.6928,
    "scout_id": "ba000000-000d-4000-a000-000000000d00"
  },
  {
    "id": "reinach",
    "name": "Reinach",
    "canton": "BL",
    "latitude": 47.4935,
    "longitude": 7.5912,
    "scout_id": "ba000000-0008-4000-a000-000000000008"
  },
  {
    "id": "riehen",
    "name": "Riehen",
    "canton": "BS",
    "latitude": 47.5789,
    "longitude": 7.6469,
    "scout_id": "ba000000-0001-4000-a000-000000000001"
  }
]
```

- [ ] **Step 3: Simplify `villages.ts` to read from JSON**

Replace the entire contents of `src/dorfkoenig/lib/villages.ts`:

```typescript
// Village config: shared village list for Bajour integration.
// Canonical source: gemeinden.json — do not duplicate village data elsewhere.

import gemeindenJson from './gemeinden.json';
import type { Village } from '../bajour/types';

export const villages: Village[] = gemeindenJson;

export function getScoutIdForVillage(villageId: string): string | undefined {
  return villages.find(v => v.id === villageId)?.scout_id;
}

export function getVillageByName(name: string): Village | undefined {
  const lower = name.toLowerCase();
  return villages.find(v => v.name.toLowerCase() === lower);
}
```

- [ ] **Step 4: Run typecheck to verify**

Run: `npm run typecheck`
Expected: PASS — no type errors. The `Village` type now includes `scout_id`, and `gemeinden.json` entries match.

- [ ] **Step 5: Commit**

```bash
git add src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/lib/villages.ts src/dorfkoenig/bajour/types.ts
git commit -m "refactor(dorfkoenig): unify village data — add scout_id to gemeinden.json"
```

---

## Task 2: Build-Time Sync + CI Check

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add sync script and hooks to package.json**

Add these three scripts to `package.json`:

```json
"sync:gemeinden": "cp src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/supabase/functions/_shared/gemeinden.json",
"predev": "npm run sync:gemeinden",
"prebuild": "npm run sync:gemeinden",
```

The `scripts` block should look like:

```json
"scripts": {
  "sync:gemeinden": "cp src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/supabase/functions/_shared/gemeinden.json",
  "predev": "npm run sync:gemeinden",
  "prebuild": "npm run sync:gemeinden",
  "dev": "vite",
  "build": "vite build",
  "build:production": "vite build --mode production",
  "preview": "vite preview",
  "typecheck": "svelte-check --tsconfig ./tsconfig.json",
  "lint": "eslint . --max-warnings 0",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "new-app": "node scripts/create-app.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Run sync to update the _shared copy**

Run: `npm run sync:gemeinden`
Expected: `src/dorfkoenig/supabase/functions/_shared/gemeinden.json` now contains the full data with `scout_id` fields.

- [ ] **Step 3: Verify the files match**

Run: `diff src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/supabase/functions/_shared/gemeinden.json`
Expected: No output (files are identical).

- [ ] **Step 4: Add CI diff check to deploy workflow**

In `.github/workflows/deploy.yml`, add after the "Install dependencies" step and before "Type check":

```yaml
      - name: Verify gemeinden.json sync
        run: diff src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/supabase/functions/_shared/gemeinden.json
```

- [ ] **Step 5: Remove stale sync comment from news/index.ts**

In `src/dorfkoenig/supabase/functions/news/index.ts`, remove line 14:

```typescript
// Canonical source: src/dorfkoenig/lib/gemeinden.json — keep in sync
```

The build-time copy makes this comment obsolete.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/deploy.yml src/dorfkoenig/supabase/functions/_shared/gemeinden.json src/dorfkoenig/supabase/functions/news/index.ts
git commit -m "build(dorfkoenig): add gemeinden.json sync script + CI diff check"
```

---

## Task 3: Prompt Consolidation

**Files:**
- Modify: `src/dorfkoenig/supabase/functions/_shared/prompts.ts`
- Modify: `src/dorfkoenig/supabase/functions/compose/index.ts:12,94`
- Modify: `src/dorfkoenig/supabase/functions/bajour-select-units/index.ts:18-48`

- [ ] **Step 1: Replace prompts.ts with two clean prompts**

Replace the entire contents of `src/dorfkoenig/supabase/functions/_shared/prompts.ts`:

```typescript
// Shared LLM prompt templates for Dorfkoenig edge functions.
// Two prompts, two jobs:
//   INFORMATION_SELECT_PROMPT — which units to pick
//   DRAFT_COMPOSE_PROMPT      — how to write the draft

/** System prompt for AI-powered unit selection. Used by bajour-select-units and bajour-auto-draft. */
export const INFORMATION_SELECT_PROMPT = `Du bist ein erfahrener Redakteur für einen wöchentlichen lokalen Newsletter.
Deine Aufgabe: Wähle die relevantesten Informationseinheiten für die nächste Ausgabe.

AUSWAHLKRITERIEN (nach Priorität):
1. AKTUALITÄT: {{recencyInstruction}}
2. RELEVANZ: Was interessiert die Einwohner dieses Dorfes JETZT?
3. VIELFALT: Decke verschiedene Themen ab (Politik, Kultur, Infrastruktur, Gesellschaft).
4. NEUIGKEITSWERT: Priorisiere Erstmeldungen über laufende Entwicklungen.

Wähle 5-15 Einheiten. Gib die IDs als JSON-Array zurück.
Heute ist: {{currentDate}}

AUSGABEFORMAT (JSON):
{
  "selected_unit_ids": ["uuid-1", "uuid-2", ...]
}`;

/**
 * Build the final selection prompt with runtime values.
 * If `override` is provided, it replaces the entire prompt (UI editor override).
 */
export function buildInformationSelectPrompt(
  currentDate: string,
  recencyDays: number | null,
  override?: string
): string {
  if (override) return override;

  const recencyInstruction = recencyDays !== null
    ? `Bevorzuge Informationen der letzten ${recencyDays} Tage STARK. Informationen älter als ${recencyDays * 2} Tage nur bei aussergewöhnlicher Bedeutung.`
    : `Berücksichtige alle verfügbaren Informationen unabhängig vom Alter. Neuere Informationen dürfen leicht bevorzugt werden.`;

  return INFORMATION_SELECT_PROMPT
    .replace('{{recencyInstruction}}', recencyInstruction)
    .replace('{{currentDate}}', currentDate);
}

/** Writing guidelines for draft composition. Used by compose and bajour-auto-draft. */
export const DRAFT_COMPOSE_PROMPT = `SCHREIBRICHTLINIEN:
- Beginne JEDEN Abschnitt mit der wichtigsten Tatsache — kein Vorgeplänkel
- Erster Satz jedes Abschnitts = die Nachricht. Kontext kommt danach.
- Fette **wichtige Zahlen, Namen, Daten und Daten** mit Markdown
- Sätze: KURZ und PRÄGNANT. Maximal 15-20 Wörter pro Satz.
- Absätze: Maximal 2-3 Sätze. Eine Idee pro Absatz.
- Beginne Aufzählungszeichen IMMER mit Emojis: 📊 (Daten) 📅 (Termine) 👤 (Personen) 🏢 (Organisationen) ⚠️ (Bedenken) ✅ (Fortschritt) 📍 (Orte)
- Beispiel: '📊 **42%** Anstieg der Wohnkosten [srf.ch]'
- Zitiere Quellen inline im Format [quelle.ch]
- Fakten aus mehreren Quellen sind glaubwürdiger — erwähne wenn verfügbar
- Füge eine "gaps"-Liste hinzu: was fehlt, wen interviewen, welche Daten verifizieren
- Priorisiere: Zahlen > Daten > Zitate > allgemeine Aussagen`;
```

- [ ] **Step 2: Update compose/index.ts import**

In `src/dorfkoenig/supabase/functions/compose/index.ts`, change line 12:

From:
```typescript
import { COMPOSE_GUIDELINES } from '../_shared/prompts.ts';
```
To:
```typescript
import { DRAFT_COMPOSE_PROMPT } from '../_shared/prompts.ts';
```

And change line 94:

From:
```typescript
const LAYER_2_DEFAULT_GUIDELINES = COMPOSE_GUIDELINES;
```
To:
```typescript
const LAYER_2_DEFAULT_GUIDELINES = DRAFT_COMPOSE_PROMPT;
```

- [ ] **Step 3: Update bajour-select-units to use shared prompt**

In `src/dorfkoenig/supabase/functions/bajour-select-units/index.ts`:

Replace the import section (add new import):
```typescript
import { buildInformationSelectPrompt, INFORMATION_SELECT_PROMPT } from '../_shared/prompts.ts';
```

Delete the entire `buildSystemPrompt` function (lines 19-48).

Update the LLM call (around line 116-118) to use the imported builder:

From:
```typescript
        { role: 'system', content: buildSystemPrompt(currentDate, recencyDays, selection_prompt) },
```
To:
```typescript
        { role: 'system', content: buildInformationSelectPrompt(currentDate, recencyDays, selection_prompt) },
```

- [ ] **Step 4: Add GET handler to bajour-select-units for prompt retrieval**

In `src/dorfkoenig/supabase/functions/bajour-select-units/index.ts`, add a GET handler before the POST logic. After the CORS check and before `if (req.method !== 'POST')`:

```typescript
    // GET: return the current selection prompt template (for UI display)
    if (req.method === 'GET') {
      return jsonResponse({ data: { prompt: INFORMATION_SELECT_PROMPT } });
    }
```

Update the method check to allow GET:

From:
```typescript
    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }
```
To:
```typescript
    if (req.method !== 'POST' && req.method !== 'GET') {
      return errorResponse('Methode nicht erlaubt', 405);
    }
```

Wait — the GET handler returns before this check, so just leave the POST check as-is. The GET return above short-circuits.

- [ ] **Step 5: Verify edge function imports compile**

Run: `npm run typecheck`
Expected: PASS. (Note: edge functions use Deno, so this only checks frontend. Manual deploy test needed for edge functions.)

- [ ] **Step 6: Commit**

```bash
git add src/dorfkoenig/supabase/functions/_shared/prompts.ts src/dorfkoenig/supabase/functions/compose/index.ts src/dorfkoenig/supabase/functions/bajour-select-units/index.ts
git commit -m "refactor(dorfkoenig): consolidate prompts — INFORMATION_SELECT_PROMPT + DRAFT_COMPOSE_PROMPT"
```

---

## Task 4: Dead Code Removal

**Files:**
- Delete: `src/dorfkoenig/supabase/functions/bajour-generate-draft/` (entire directory)
- Modify: `src/dorfkoenig/supabase/config.toml:82-83`
- Modify: `src/dorfkoenig/bajour/api.ts:32-38`
- Modify: `src/dorfkoenig/bajour/__tests__/api.test.ts:61-89`

- [ ] **Step 1: Delete bajour-generate-draft edge function**

```bash
rm -rf src/dorfkoenig/supabase/functions/bajour-generate-draft
```

- [ ] **Step 2: Remove from config.toml**

In `src/dorfkoenig/supabase/config.toml`, delete lines 82-83:

```toml
[functions.bajour-generate-draft]
verify_jwt = false
```

- [ ] **Step 3: Remove generateDraft from bajour/api.ts**

In `src/dorfkoenig/bajour/api.ts`, remove lines 32-38 (the `generateDraft` method):

```typescript
  /** Generate newsletter draft body from selected units via LLM. */
  generateDraft: (data: {
    village_id: string;
    village_name: string;
    unit_ids: string[];
    custom_system_prompt?: string;
  }) => api.post<BajourDraftGenerated>('bajour-generate-draft', data),
```

- [ ] **Step 4: Remove generateDraft tests from api.test.ts**

In `src/dorfkoenig/bajour/__tests__/api.test.ts`, remove the two test cases (lines 61-89):

```typescript
  it('generateDraft() calls POST /bajour-generate-draft', async () => {
    ...
  });

  it('generateDraft() passes custom_system_prompt when provided', async () => {
    ...
  });
```

- [ ] **Step 5: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All tests pass. No test references `generateDraft` anymore.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: PASS with 0 errors and 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add -A src/dorfkoenig/supabase/functions/bajour-generate-draft src/dorfkoenig/supabase/config.toml src/dorfkoenig/bajour/api.ts src/dorfkoenig/bajour/__tests__/api.test.ts
git commit -m "chore(dorfkoenig): delete bajour-generate-draft (dead code)"
```

---

## Task 5: Database Migration — auto_draft_runs + dispatch function + cron

**Files:**
- Create: `src/dorfkoenig/supabase/migrations/20260410000000_auto_draft_scheduling.sql`

- [ ] **Step 1: Create the migration file**

Create `src/dorfkoenig/supabase/migrations/20260410000000_auto_draft_scheduling.sql`:

```sql
-- Auto-draft scheduling: daily automated newsletter generation per village.
-- Dispatched by pg_cron at 18:00 Europe/Zurich, one edge function call per village.

-- 1. Run log table for monitoring
CREATE TABLE auto_draft_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    village_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    error_message TEXT,
    draft_id UUID REFERENCES bajour_drafts(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_auto_draft_runs_village_date
    ON auto_draft_runs (village_id, (started_at::date));
CREATE INDEX idx_auto_draft_runs_status
    ON auto_draft_runs (status) WHERE status IN ('running', 'failed');

-- RLS: service role writes, authenticated users can read
ALTER TABLE auto_draft_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on auto_draft_runs"
    ON auto_draft_runs FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read auto_draft_runs"
    ON auto_draft_runs FOR SELECT
    USING (auth.role() = 'authenticated');

-- 2. Dispatch function: loops villages, fires pg_net per village with 10s stagger
CREATE OR REPLACE FUNCTION dispatch_auto_drafts()
RETURNS INTEGER AS $$
DECLARE
    village_record RECORD;
    dispatched_count INTEGER := 0;
    project_url TEXT;
    service_key TEXT;
    -- Hardcoded user ID for automated drafts (matches existing dev user)
    auto_user_id TEXT := 'tom';
BEGIN
    -- Get secrets from Vault
    BEGIN
        SELECT decrypted_secret INTO project_url
        FROM vault.decrypted_secrets
        WHERE name = 'project_url';

        SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'dispatch_auto_drafts: Could not retrieve vault secrets: %', SQLERRM;
        RETURN 0;
    END;

    IF project_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'dispatch_auto_drafts: Vault secrets not configured';
        RETURN 0;
    END IF;

    -- Loop through villages (hardcoded list matching gemeinden.json)
    FOR village_record IN
        SELECT *
        FROM (VALUES
            ('aesch',          'Aesch',          'ba000000-000b-4000-a000-00000000000b'),
            ('allschwil',      'Allschwil',      'ba000000-0003-4000-a000-000000000003'),
            ('arlesheim',      'Arlesheim',      'ba000000-0005-4000-a000-000000000005'),
            ('binningen',      'Binningen',      'ba000000-0004-4000-a000-000000000004'),
            ('bottmingen',     'Bottmingen',     'ba000000-000c-4000-a000-000000000c00'),
            ('muenchenstein',  'Münchenstein',    'ba000000-0007-4000-a000-000000000007'),
            ('muttenz',        'Muttenz',        'ba000000-0006-4000-a000-000000000006'),
            ('pratteln',       'Pratteln',       'ba000000-000d-4000-a000-000000000d00'),
            ('reinach',        'Reinach',        'ba000000-0008-4000-a000-000000000008'),
            ('riehen',         'Riehen',         'ba000000-0001-4000-a000-000000000001')
        ) AS v(village_id, village_name, scout_id)
    LOOP
        -- Dispatch via pg_net
        PERFORM net.http_post(
            url := project_url || '/functions/v1/bajour-auto-draft',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'village_id', village_record.village_id,
                'village_name', village_record.village_name,
                'scout_id', village_record.scout_id,
                'user_id', auto_user_id
            )
        );

        dispatched_count := dispatched_count + 1;

        -- Stagger dispatches (10s between villages for LLM rate limits)
        IF dispatched_count < 10 THEN
            PERFORM pg_sleep(10);
        END IF;
    END LOOP;

    RETURN dispatched_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. pg_cron schedules (must be run separately after enabling pg_cron in Dashboard)
-- Requires pg_cron >= 1.6 for timezone parameter.
--
-- SELECT cron.schedule(
--     job_name   := 'dispatch-auto-drafts',
--     schedule   := '0 18 * * *',
--     command    := 'SELECT dispatch_auto_drafts()',
--     database   := 'postgres',
--     timezone   := 'Europe/Zurich'
-- );
--
-- SELECT cron.schedule(
--     job_name   := 'resolve-bajour-timeouts-daily',
--     schedule   := '0 21 * * *',
--     command    := 'SELECT resolve_bajour_timeouts()',
--     database   := 'postgres',
--     timezone   := 'Europe/Zurich'
-- );
```

- [ ] **Step 2: Commit**

```bash
git add src/dorfkoenig/supabase/migrations/20260410000000_auto_draft_scheduling.sql
git commit -m "feat(dorfkoenig): add auto_draft_runs table + dispatch_auto_drafts function"
```

---

## Task 6: bajour-auto-draft Edge Function

**Files:**
- Create: `src/dorfkoenig/supabase/functions/bajour-auto-draft/index.ts`
- Modify: `src/dorfkoenig/supabase/config.toml`

- [ ] **Step 1: Add to config.toml**

Add to `src/dorfkoenig/supabase/config.toml` (after the `[functions.news]` block):

```toml
[functions.bajour-auto-draft]
verify_jwt = false
```

- [ ] **Step 2: Create the edge function**

Create `src/dorfkoenig/supabase/functions/bajour-auto-draft/index.ts`:

```typescript
/**
 * @module bajour-auto-draft
 * Automated daily newsletter draft pipeline for a single village.
 * Triggered by pg_cron via dispatch_auto_drafts() at 18:00 Europe/Zurich.
 *
 * Pipeline: idempotency check → select units (LLM) → generate draft (LLM) → save → verify (WhatsApp)
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { buildInformationSelectPrompt, DRAFT_COMPOSE_PROMPT } from '../_shared/prompts.ts';
import { getCorrespondentsForVillage } from '../_shared/correspondents.ts';
import { MAX_UNITS_PER_COMPOSE } from '../_shared/constants.ts';

interface AutoDraftRequest {
  village_id: string;
  village_name: string;
  scout_id: string;
  user_id: string;
}

const RECENCY_DAYS = 2;
const LLM_TIMEOUT_MS = 60_000;

// WhatsApp Business API credentials
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
const WHATSAPP_API_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN')!;

// --- Helpers ---

function zurichToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
}

async function sendWhatsAppMessage(
  payload: Record<string, unknown>
): Promise<{ message_id: string }> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return { message_id: data.messages?.[0]?.id || 'unknown' };
}

// --- Main handler ---

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Methode nicht erlaubt', 405);
  }

  const supabase = createServiceClient();
  const body: AutoDraftRequest = await req.json();
  const { village_id, village_name, scout_id, user_id } = body;

  if (!village_id || !village_name || !scout_id || !user_id) {
    return errorResponse('village_id, village_name, scout_id, user_id erforderlich', 400);
  }

  const today = zurichToday();
  let runId: number | null = null;

  try {
    // --- 1. Idempotency check ---
    const { data: existingDraft } = await supabase
      .from('bajour_drafts')
      .select('id')
      .eq('village_id', village_id)
      .eq('publication_date', today)
      .neq('verification_status', 'abgelehnt')
      .limit(1)
      .maybeSingle();

    if (existingDraft) {
      console.log(`Auto-draft skipped: draft already exists for ${village_id} on ${today}`);
      // Log as skipped
      await supabase.from('auto_draft_runs').insert({
        village_id,
        status: 'skipped',
        error_message: 'Draft already exists for today',
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ data: { status: 'skipped', reason: 'draft_exists' } });
    }

    // --- 2. Log run start ---
    const { data: runData } = await supabase
      .from('auto_draft_runs')
      .insert({ village_id, status: 'running' })
      .select('id')
      .single();
    runId = runData?.id ?? null;

    // --- 3. Select units ---
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RECENCY_DAYS);

    const { data: units, error: unitsError } = await supabase
      .from('information_units')
      .select('id, statement, unit_type, event_date, created_at')
      .eq('scout_id', scout_id)
      .eq('user_id', user_id)
      .eq('used_in_article', false)
      .gte('created_at', cutoffDate.toISOString())
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (unitsError) throw new Error(`Unit query failed: ${unitsError.message}`);

    if (!units || units.length === 0) {
      console.log(`Auto-draft skipped: no units for ${village_id}`);
      if (runId) {
        await supabase.from('auto_draft_runs')
          .update({ status: 'skipped', error_message: 'No unused units available', completed_at: new Date().toISOString() })
          .eq('id', runId);
      }
      return jsonResponse({ data: { status: 'skipped', reason: 'no_units' } });
    }

    // Format units for LLM
    const formattedUnits = units
      .map((unit, index) => {
        const date = unit.event_date || unit.created_at?.split('T')[0] || 'unbekannt';
        return `[${index + 1}] ID: ${unit.id} | Datum: ${date} | Typ: ${unit.unit_type} | ${unit.statement}`;
      })
      .join('\n');

    // Call LLM to select units
    const selectResponse = await openrouter.chat({
      messages: [
        { role: 'system', content: buildInformationSelectPrompt(today, RECENCY_DAYS) },
        { role: 'user', content: `Hier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus.` },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    let selectedIds: string[];
    try {
      const parsed = JSON.parse(selectResponse.choices[0].message.content);
      const validIds = new Set(units.map(u => u.id));
      selectedIds = (parsed.selected_unit_ids || []).filter((id: string) => validIds.has(id));
    } catch {
      console.error('Failed to parse LLM selection response');
      selectedIds = [];
    }

    // Fallback: if empty, use first MAX_UNITS_PER_COMPOSE units
    if (selectedIds.length === 0) {
      selectedIds = units.slice(0, MAX_UNITS_PER_COMPOSE).map(u => u.id);
    }

    // Cap at MAX_UNITS_PER_COMPOSE
    if (selectedIds.length > MAX_UNITS_PER_COMPOSE) {
      selectedIds = selectedIds.slice(0, MAX_UNITS_PER_COMPOSE);
    }

    // --- 4. Generate draft ---
    // Fetch full unit data for selected IDs
    const { data: selectedUnits, error: selectedError } = await supabase
      .from('information_units')
      .select('id, statement, unit_type, event_date, created_at, source_domain')
      .in('id', selectedIds);

    if (selectedError) throw new Error(`Selected units fetch failed: ${selectedError.message}`);

    // Group units by type
    const facts = (selectedUnits || []).filter(u => u.unit_type === 'fact');
    const events = (selectedUnits || []).filter(u => u.unit_type === 'event');
    const entityUpdates = (selectedUnits || []).filter(u => u.unit_type === 'entity_update');

    let formattedSelected = '';
    const formatUnit = (u: { event_date?: string | null; created_at: string; statement: string; source_domain: string }) =>
      `- [${u.event_date || u.created_at?.split('T')[0] || 'unbekannt'}] ${u.statement} [${u.source_domain}]`;

    if (facts.length > 0) formattedSelected += 'FAKTEN:\n' + facts.map(formatUnit).join('\n') + '\n\n';
    if (events.length > 0) formattedSelected += 'EREIGNISSE:\n' + events.map(formatUnit).join('\n') + '\n\n';
    if (entityUpdates.length > 0) formattedSelected += 'AKTUALISIERUNGEN:\n' + entityUpdates.map(formatUnit).join('\n') + '\n\n';

    // Build 3-layer newsletter prompt (same as bajour-generate-draft used)
    const layer1 = `Du bist ein KI-Assistent für den Newsletter "${village_name} — Wochenüberblick".
Du schreibst AUSSCHLIEßLICH basierend auf den bereitgestellten Informationseinheiten.
ERFINDE KEINE Informationen. Wenn etwas unklar ist, kennzeichne es als "nicht bestätigt".`;

    const layer3 = `Schreibe den gesamten Newsletter auf Deutsch.

Ausgabeformat (JSON):
{
  "title": "Wochentitel",
  "greeting": "Kurze Begrüssung (1 Satz)",
  "sections": [
    {
      "heading": "Abschnittsüberschrift",
      "body": "Inhalt mit **Hervorhebungen** und [Quellen]"
    }
  ],
  "outlook": "Ausblick auf nächste Woche",
  "sign_off": "Abschlussgruss"
}`;

    const systemPrompt = `${layer1}\n\n${DRAFT_COMPOSE_PROMPT}\n\n${layer3}`;

    const draftResponse = await openrouter.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Hier sind die Informationseinheiten für den Newsletter:\n\n${formattedSelected}\nErstelle den Newsletter basierend auf diesen Informationen.` },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    let draft;
    try {
      draft = JSON.parse(draftResponse.choices[0].message.content);
    } catch {
      throw new Error('Failed to parse draft generation LLM response');
    }

    // Convert structured draft to markdown body
    let body_md = '';
    if (draft.greeting) body_md += `${draft.greeting}\n\n`;
    for (const section of draft.sections || []) {
      body_md += `## ${section.heading}\n\n${section.body}\n\n`;
    }
    if (draft.outlook) body_md += `## Ausblick\n\n${draft.outlook}\n\n`;
    if (draft.sign_off) body_md += `---\n\n${draft.sign_off}`;

    // --- 5. Save draft ---
    const { data: savedDraft, error: saveError } = await supabase
      .from('bajour_drafts')
      .insert({
        user_id,
        village_id,
        village_name,
        title: draft.title || `${village_name} — ${today}`,
        body: body_md.trim(),
        selected_unit_ids: selectedIds,
        publication_date: today,
        verification_status: 'ausstehend',
      })
      .select('id')
      .single();

    if (saveError) throw new Error(`Draft save failed: ${saveError.message}`);

    const draftId = savedDraft.id;

    // Mark units as used
    await supabase
      .from('information_units')
      .update({ used_in_article: true, used_at: new Date().toISOString() })
      .in('id', selectedIds);

    // --- 6. Send WhatsApp verification (non-fatal) ---
    let verificationSent = false;
    try {
      const correspondents = await getCorrespondentsForVillage(village_id);

      if (correspondents.length > 0) {
        const allMessageIds: string[] = [];

        for (const correspondent of correspondents) {
          const phoneWithPlus = '+' + correspondent.phone;

          const templateResult = await sendWhatsAppMessage({
            to: phoneWithPlus,
            type: 'template',
            template: {
              name: 'bajour_draft_verification',
              language: { code: 'de' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: village_name }] },
              ],
            },
          });
          allMessageIds.push(templateResult.message_id);

          const textResult = await sendWhatsAppMessage({
            to: phoneWithPlus,
            type: 'text',
            text: { body: body_md.trim() },
          });
          allMessageIds.push(textResult.message_id);
        }

        // Update draft with verification metadata
        const now = new Date();
        const timeoutAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        await supabase
          .from('bajour_drafts')
          .update({
            verification_sent_at: now.toISOString(),
            verification_timeout_at: timeoutAt.toISOString(),
            whatsapp_message_ids: allMessageIds,
          })
          .eq('id', draftId);

        verificationSent = true;
      } else {
        console.warn(`No active correspondents for ${village_id}, skipping verification`);
      }
    } catch (whatsappErr) {
      console.error(`WhatsApp send failed for ${village_id} (non-fatal):`, whatsappErr);
    }

    // --- 7. Update run log ---
    if (runId) {
      await supabase.from('auto_draft_runs')
        .update({
          status: 'completed',
          draft_id: draftId,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    console.log(`Auto-draft completed for ${village_id}: draft ${draftId}, units: ${selectedIds.length}, verification: ${verificationSent}`);

    return jsonResponse({
      data: {
        status: 'completed',
        draft_id: draftId,
        units_selected: selectedIds.length,
        verification_sent: verificationSent,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`bajour-auto-draft error for ${village_id}:`, message);

    // Update run log with failure
    if (runId) {
      await supabase.from('auto_draft_runs')
        .update({
          status: 'failed',
          error_message: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    return errorResponse(message, 500);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/dorfkoenig/supabase/functions/bajour-auto-draft/index.ts src/dorfkoenig/supabase/config.toml
git commit -m "feat(dorfkoenig): add bajour-auto-draft edge function"
```

---

## Task 7: UI — System Prompt Toggle in AISelectDropdown

**Files:**
- Modify: `src/dorfkoenig/components/compose/AISelectDropdown.svelte`
- Modify: `src/dorfkoenig/bajour/api.ts`

- [ ] **Step 1: Add getSelectPrompt to bajour/api.ts**

In `src/dorfkoenig/bajour/api.ts`, add a new method to the `bajourApi` object:

```typescript
  /** Fetch the current INFORMATION_SELECT_PROMPT template from the backend. */
  getSelectPrompt: () => api.get<{ prompt: string }>('bajour-select-units'),
```

- [ ] **Step 2: Add system prompt toggle to AISelectDropdown.svelte**

In the `<script>` section of `src/dorfkoenig/components/compose/AISelectDropdown.svelte`:

Add import at the top (after existing imports):
```typescript
import { ChevronDown, ChevronRight } from 'lucide-svelte';
import { bajourApi } from '../../bajour/api';
```

Add state variables (after the existing `let dropdownEl` line):
```typescript
let showSystemPrompt = $state(false);
let systemPrompt = $state('');
let systemPromptLoaded = $state(false);
```

Add a function to fetch the prompt:
```typescript
async function loadSystemPrompt() {
  if (systemPromptLoaded) return;
  try {
    const result = await bajourApi.getSelectPrompt();
    systemPrompt = result.prompt;
    systemPromptLoaded = true;
  } catch {
    systemPrompt = '(Fehler beim Laden des Prompts)';
  }
}

function handleToggleSystemPrompt() {
  showSystemPrompt = !showSystemPrompt;
  if (showSystemPrompt && !systemPromptLoaded) {
    loadSystemPrompt();
  }
}
```

Update the `handleRun` function to pass the system prompt override:
```typescript
function handleRun() {
  if (!selectedVillage) return;
  onrun(
    selectedVillage,
    useRecencyFilter ? recencyDays : null,
    selectionPrompt,
    showSystemPrompt && systemPrompt ? systemPrompt : undefined
  );
}
```

Update the `handleReset` function to also reset system prompt:
```typescript
function handleReset() {
  useRecencyFilter = true;
  recencyDays = 3;
  selectionPrompt = '';
  showSystemPrompt = false;
  systemPrompt = '';
  systemPromptLoaded = false;
}
```

- [ ] **Step 3: Update the Props interface**

Change the `onrun` callback signature:
```typescript
onrun: (villageName: string, recencyDays: number | null, selectionPrompt: string, systemPromptOverride?: string) => void;
```

- [ ] **Step 4: Add the toggle UI in the template**

In the template, between the `prompt-section` div (line ~140) and the `dropdown-footer` div (line ~142), add:

```svelte
    <!-- System prompt toggle -->
    <button class="system-prompt-toggle" onclick={handleToggleSystemPrompt} type="button">
      {#if showSystemPrompt}
        <ChevronDown size={14} />
      {:else}
        <ChevronRight size={14} />
      {/if}
      <span>System-Prompt</span>
    </button>
    {#if showSystemPrompt}
      <div class="system-prompt-section">
        <textarea
          class="system-prompt-textarea"
          bind:value={systemPrompt}
          rows="8"
          placeholder="System-Prompt wird geladen..."
        ></textarea>
      </div>
    {/if}
```

- [ ] **Step 5: Add styles**

Add to the `<style>` section:

```css
  .system-prompt-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .system-prompt-toggle:hover {
    color: var(--color-text);
  }

  .system-prompt-section {
    display: flex;
    flex-direction: column;
  }

  .system-prompt-textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: var(--text-xs);
    font-family: 'SF Mono', 'Fira Code', monospace;
    line-height: 1.5;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text-muted);
    resize: vertical;
    min-height: 120px;
    box-sizing: border-box;
  }

  .system-prompt-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.1);
    color: var(--color-text);
  }
```

- [ ] **Step 6: Update ComposePanel.svelte to pass the system prompt override**

In `src/dorfkoenig/components/compose/ComposePanel.svelte`, update `handleAISelectRun` signature (around line 228):

From:
```typescript
async function handleAISelectRun(villageName: string, recencyDays: number | null, selectionPrompt: string) {
```
To:
```typescript
async function handleAISelectRun(villageName: string, recencyDays: number | null, selectionPrompt: string, systemPromptOverride?: string) {
```

Update the `bajourApi.selectUnits` call (around line 254) to pass the override as the `selection_prompt`:

From:
```typescript
      const selectResult = await bajourApi.selectUnits({
        village_id: village.id,
        scout_id: scoutId,
        ...(recencyDays !== null && { recency_days: recencyDays }),
        selection_prompt: selectionPrompt.trim() || undefined,
      });
```
To:
```typescript
      const selectResult = await bajourApi.selectUnits({
        village_id: village.id,
        scout_id: scoutId,
        ...(recencyDays !== null && { recency_days: recencyDays }),
        selection_prompt: systemPromptOverride || selectionPrompt.trim() || undefined,
      });
```

- [ ] **Step 7: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/dorfkoenig/components/compose/AISelectDropdown.svelte src/dorfkoenig/components/compose/ComposePanel.svelte src/dorfkoenig/bajour/api.ts
git commit -m "feat(dorfkoenig): add system prompt toggle to AISelectDropdown"
```

---

## Task 8: Documentation Updates

**Files:**
- Modify: `src/dorfkoenig/CLAUDE.md`
- Modify: `src/dorfkoenig/supabase/CLAUDE.md`
- Modify: `src/dorfkoenig/specs/API.md`
- Modify: `src/dorfkoenig/specs/DATABASE.md`
- Modify: `src/dorfkoenig/specs/PIPELINES.md`

- [ ] **Step 1: Update dorfkoenig/CLAUDE.md**

Make these changes:
1. In the directory structure, remove `bajour-generate-draft` references
2. In the edge function references, add `bajour-auto-draft`
3. Update the `bajour/api.ts` description to note `generateDraft` is removed
4. Add mention of `auto_draft_runs` table
5. Update prompt references from `COMPOSE_GUIDELINES`/`BAJOUR_NEWSLETTER_GUIDELINES` to `INFORMATION_SELECT_PROMPT`/`DRAFT_COMPOSE_PROMPT`

- [ ] **Step 2: Update supabase/CLAUDE.md**

Make these changes:
1. In the Edge Functions table: remove `bajour-generate-draft`, add `bajour-auto-draft` with description "Automated daily draft pipeline per village. Service role. Pipeline: select units → generate draft → save → WhatsApp verify."
2. In Database Schema section: add `auto_draft_runs` table schema
3. In Key Database Functions table: add `dispatch_auto_drafts()` with purpose "pg_cron: dispatch auto-draft edge function per village at 18:00 Europe/Zurich"
4. Update Shared Modules table: update `prompts.ts` description to mention `INFORMATION_SELECT_PROMPT`, `buildInformationSelectPrompt`, `DRAFT_COMPOSE_PROMPT`
5. In the pg_cron section: add the two new cron jobs

- [ ] **Step 3: Update specs/API.md**

1. Remove the `bajour-generate-draft` endpoint section
2. Add `bajour-auto-draft` endpoint:
   - Method: POST (service role only, dispatched by pg_cron)
   - Body: `{ village_id, village_name, scout_id, user_id }`
   - Response: `{ data: { status, draft_id?, units_selected?, verification_sent? } }`
3. Add GET handler to `bajour-select-units`:
   - Method: GET
   - Response: `{ data: { prompt: string } }`

- [ ] **Step 4: Update specs/DATABASE.md**

1. Add `auto_draft_runs` table schema
2. Add `dispatch_auto_drafts()` function documentation
3. Add cron schedule documentation for both new jobs

- [ ] **Step 5: Update specs/PIPELINES.md**

Add new section "Auto-Draft Pipeline":
```
## Auto-Draft Pipeline

Daily at 18:00 Europe/Zurich:
1. pg_cron → dispatch_auto_drafts() → loops 10 villages, 10s stagger
2. Per village: bajour-auto-draft edge function
   a. Idempotency check (village + today)
   b. Select units (INFORMATION_SELECT_PROMPT, 2-day recency, max 20)
   c. Generate draft (DRAFT_COMPOSE_PROMPT, 3-layer newsletter prompt)
   d. Save to bajour_drafts (publication_date = today Zurich)
   e. Send WhatsApp verification (non-fatal)
   f. Log to auto_draft_runs

Daily at 21:00 Europe/Zurich:
3. pg_cron → resolve_bajour_timeouts() — auto-confirms unresponded drafts

Daily at 22:00:
4. CMS queries news endpoint → returns confirmed drafts by village
```

- [ ] **Step 6: Commit**

```bash
git add src/dorfkoenig/CLAUDE.md src/dorfkoenig/supabase/CLAUDE.md src/dorfkoenig/specs/API.md src/dorfkoenig/specs/DATABASE.md src/dorfkoenig/specs/PIPELINES.md
git commit -m "docs(dorfkoenig): update docs for auto-draft scheduling"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds. The `prebuild` hook runs `sync:gemeinden` automatically.

- [ ] **Step 5: Verify gemeinden sync**

Run: `diff src/dorfkoenig/lib/gemeinden.json src/dorfkoenig/supabase/functions/_shared/gemeinden.json`
Expected: No output (files identical).

- [ ] **Step 6: Verify deleted function is gone**

Run: `ls src/dorfkoenig/supabase/functions/bajour-generate-draft 2>/dev/null || echo "DELETED"`
Expected: "DELETED"

- [ ] **Step 7: Commit any final fixes if needed**

Only if previous steps revealed issues that needed fixing.
