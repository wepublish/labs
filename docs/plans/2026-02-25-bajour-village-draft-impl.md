# Bajour Village Draft — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a feature-flagged pipeline for Bajour journalists to generate AI-drafted village newsletters and verify them via WhatsApp with village correspondents.

**Architecture:** Two new Supabase Edge Functions handle LLM calls (unit selection + draft generation), two more handle WhatsApp (send + webhook). A new `bajour_drafts` table tracks drafts and verification. The frontend adds a modal behind the `VITE_FEATURE_BAJOUR` flag. All Bajour-specific code is isolated in `components/bajour/`, `stores/bajour-drafts.ts`, and `bajour-*` Edge Functions.

**Tech Stack:** Svelte 5 + TypeScript, Supabase Edge Functions (Deno), OpenRouter (gpt-4o-mini), WhatsApp Business Cloud API, PostgreSQL.

**Design doc:** `docs/plans/2026-02-25-bajour-village-draft-design.md`

---

## Task 1: Database Migration — `event_date` Column

**Files:**
- Create: `src/dorfkoenig/supabase/migrations/00000000000004_add_event_date.sql`
- Modify: `src/dorfkoenig/supabase/functions/execute-scout/index.ts:411-517`
- Modify: `src/dorfkoenig/lib/types.ts:80-97`

**Step 1: Create migration file**

```sql
-- Add event_date to information_units for recency-biased queries
ALTER TABLE information_units
ADD COLUMN event_date DATE;

COMMENT ON COLUMN information_units.event_date IS
  'Date when the event/fact occurred (extracted by LLM). NULL for legacy units.';

-- Index for recency-based ordering
CREATE INDEX idx_information_units_event_date ON information_units(event_date DESC NULLS LAST);
```

**Step 2: Update the unit extraction LLM prompt in `execute-scout/index.ts`**

At line 418, the `extractInformationUnits` function has a system prompt. Update the JSON schema section to include `eventDate`:

Change the output format block (lines 436-445) from:
```
{
  "units": [
    {
      "statement": "Vollständiger Satz",
      "unitType": "fact",
      "entities": ["Entity1", "Entity2"]
    }
  ]
}
```
To:
```
{
  "units": [
    {
      "statement": "Vollständiger Satz",
      "unitType": "fact",
      "entities": ["Entity1", "Entity2"],
      "eventDate": "2026-02-20"
    }
  ]
}
```

Add to the system prompt rules (after line 430):
```
- Extrahiere das Datum des Ereignisses im Format YYYY-MM-DD (wenn im Text erwähnt)
- Wenn kein Datum erkennbar, setze eventDate auf null
```

Update the units type at line 456:
```typescript
let units: { statement: string; unitType: string; entities: string[]; eventDate?: string | null }[] = [];
```

Update the insert at line 498-511 to include:
```typescript
event_date: unit.eventDate || null,
```

**Step 3: Update TypeScript types**

In `src/dorfkoenig/lib/types.ts`, add to `InformationUnit` interface (after line 96):
```typescript
event_date?: string | null;
```

**Step 4: Run migration**

```bash
supabase db push --workdir ./src/dorfkoenig/supabase
```

**Step 5: Verify**

```bash
npm run typecheck
```

**Step 6: Commit**

```bash
git add src/dorfkoenig/supabase/migrations/00000000000004_add_event_date.sql \
        src/dorfkoenig/supabase/functions/execute-scout/index.ts \
        src/dorfkoenig/lib/types.ts
git commit -m "feat(dorfkoenig): add event_date column to information_units"
```

---

## Task 2: Database Migration — `bajour_drafts` Table

**Files:**
- Create: `src/dorfkoenig/supabase/migrations/00000000000005_bajour_drafts.sql`

**Step 1: Create migration file**

```sql
-- Bajour-specific: AI-generated village newsletter drafts with WhatsApp verification.
-- Client-specific table — not part of core schema. See docs/plans/2026-02-25-bajour-village-draft-design.md

CREATE TABLE bajour_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  village_id TEXT NOT NULL,
  village_name TEXT NOT NULL,

  -- Draft content
  title TEXT,
  body TEXT NOT NULL,
  selected_unit_ids UUID[] NOT NULL DEFAULT '{}',
  custom_system_prompt TEXT,

  -- Verification
  verification_status TEXT NOT NULL DEFAULT 'ausstehend'
    CHECK (verification_status IN ('ausstehend', 'bestätigt', 'abgelehnt')),
  verification_responses JSONB NOT NULL DEFAULT '[]',
  verification_sent_at TIMESTAMPTZ,
  verification_resolved_at TIMESTAMPTZ,
  verification_timeout_at TIMESTAMPTZ,

  -- WhatsApp tracking
  whatsapp_message_ids JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE bajour_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own drafts"
  ON bajour_drafts FOR ALL
  USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

CREATE INDEX idx_bajour_drafts_user_id ON bajour_drafts(user_id);
CREATE INDEX idx_bajour_drafts_village_id ON bajour_drafts(village_id);

-- Auto-update updated_at
CREATE TRIGGER bajour_drafts_updated_at
  BEFORE UPDATE ON bajour_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE bajour_drafts IS
  'Bajour-specific: AI-generated village newsletter drafts with WhatsApp verification. Client-specific table — not part of core schema.';
```

**Step 2: Run migration**

```bash
supabase db push --workdir ./src/dorfkoenig/supabase
```

**Step 3: Commit**

```bash
git add src/dorfkoenig/supabase/migrations/00000000000005_bajour_drafts.sql
git commit -m "feat(dorfkoenig): add bajour_drafts table for village draft verification"
```

---

## Task 3: Feature Flag + Environment Setup

**Files:**
- Modify: `.env.example:5` (add line)
- Modify: `.github/workflows/deploy.yml:41-45` (add env var)

**Step 1: Add to `.env.example`**

Add after existing variables:
```
VITE_FEATURE_BAJOUR=               # Set to 'true' to enable Bajour village draft feature
```

**Step 2: Add to your local `.env.local`**

```
VITE_FEATURE_BAJOUR=true
```

**Step 3: Add to GitHub Actions deploy workflow**

In `.github/workflows/deploy.yml`, add to the Build step `env:` block (after line 45):
```yaml
          VITE_FEATURE_BAJOUR: 'true'
```

**Step 4: Commit**

```bash
git add .env.example .github/workflows/deploy.yml
git commit -m "feat(dorfkoenig): add VITE_FEATURE_BAJOUR feature flag"
```

---

## Task 4: Villages Data + TypeScript Types

**Files:**
- Create: `src/dorfkoenig/data/villages.json`
- Modify: `src/dorfkoenig/lib/types.ts` (add Bajour types)

**Step 1: Create villages JSON**

Create `src/dorfkoenig/data/villages.json` with the 10 Basel villages exactly as specified in the design doc (section 3). Each has `id`, `name`, `canton`, `latitude`, `longitude`, and `correspondents` array with `name` and `phone`.

**Step 2: Add Bajour types to `types.ts`**

Add at the end of `src/dorfkoenig/lib/types.ts`:

```typescript
// --- Bajour-specific types ---

export interface Village {
  id: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
  correspondents: Correspondent[];
}

export interface Correspondent {
  name: string;
  phone: string;
}

export type VerificationStatus = 'ausstehend' | 'bestätigt' | 'abgelehnt';

export interface VerificationResponse {
  name: string;
  phone: string;
  response: 'bestätigt' | 'abgelehnt';
  responded_at: string;
}

export interface BajourDraft {
  id: string;
  user_id: string;
  village_id: string;
  village_name: string;
  title: string | null;
  body: string;
  selected_unit_ids: string[];
  custom_system_prompt: string | null;
  verification_status: VerificationStatus;
  verification_responses: VerificationResponse[];
  verification_sent_at: string | null;
  verification_resolved_at: string | null;
  verification_timeout_at: string | null;
  whatsapp_message_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface BajourDraftGenerated {
  title: string;
  greeting: string;
  sections: { heading: string; body: string }[];
  outlook: string;
  sign_off: string;
}
```

**Step 3: Verify**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/dorfkoenig/data/villages.json src/dorfkoenig/lib/types.ts
git commit -m "feat(dorfkoenig): add villages data and Bajour types"
```

---

## Task 5: Seed Data

**Files:**
- Create: `src/dorfkoenig/supabase/seed-bajour.sql`

**Step 1: Create seed file**

The file must:
1. Delete existing Bajour village scouts and their cascaded data (executions + units)
2. Create the `_seed_embedding` helper function (same pattern as `seed.sql`)
3. Insert 10 scouts — one per village, all under user `493c6d51531c7444365b0ec094bc2d67`, `is_active = false`, named `Bajour: {village_name}`
4. Insert 20-50 information units per village (300+ total) with:
   - Realistic German local news statements with explicit dates in the text (e.g., "Am 18. Februar 2026 hat der Gemeinderat...")
   - `event_date` values spread across the last 30 days (more recent = more units)
   - Mix of `unit_type`: `fact`, `event`, `entity_update`
   - Realistic `entities[]` (local council members, organizations, places)
   - `location` JSONB matching village coordinates from `villages.json`
   - `used_in_article = false`
   - `source_url` and `source_domain` pointing to real Basel-area municipal websites
5. Drop the helper function

Content categories per village:
- Gemeinderat decisions and votes
- Local events (Fasnacht, markets, sports)
- Infrastructure (road closures, construction, BVB/BLT transport)
- School and community news
- Local business openings/closings
- Environmental/weather events

Scout IDs format: `'ba000000-0001-4000-a000-000000000001'` through `'ba000000-000a-4000-a000-00000000000a'`

**Step 2: Run seed**

Execute the SQL via Supabase Dashboard SQL Editor or:
```bash
supabase db execute --workdir ./src/dorfkoenig/supabase < src/dorfkoenig/supabase/seed-bajour.sql
```

**Step 3: Verify seed**

Run in SQL editor:
```sql
SELECT s.name, COUNT(u.id) as unit_count
FROM scouts s
LEFT JOIN information_units u ON u.scout_id = s.id
WHERE s.user_id = '493c6d51531c7444365b0ec094bc2d67'
  AND s.name LIKE 'Bajour:%'
GROUP BY s.name
ORDER BY s.name;
```
Expected: 10 rows, each with 20-50 units.

**Step 4: Commit**

```bash
git add src/dorfkoenig/supabase/seed-bajour.sql
git commit -m "feat(dorfkoenig): add Bajour village seed data (10 villages, 300+ units)"
```

---

## Task 6: Edge Function — `bajour-select-units`

**Files:**
- Create: `src/dorfkoenig/supabase/functions/bajour-select-units/index.ts`
- Modify: `src/dorfkoenig/supabase/config.toml:79` (add function config)

**Step 1: Create the Edge Function**

```typescript
// Bajour: Select relevant information units for a village newsletter
// LLM Call 1 of 2 — recency-biased unit selection

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';

interface SelectRequest {
  village_id: string;
  scout_id: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const { village_id, scout_id }: SelectRequest = await req.json();

    if (!village_id || !scout_id) {
      return errorResponse('village_id und scout_id erforderlich', 400, 'VALIDATION_ERROR');
    }

    // Fetch unused units for this village's scout, ordered by recency
    const { data: units, error } = await supabase
      .from('information_units')
      .select('id, statement, unit_type, entities, event_date, created_at')
      .eq('scout_id', scout_id)
      .eq('user_id', userId)
      .eq('used_in_article', false)
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Fetch units error:', error);
      return errorResponse('Fehler beim Laden der Einheiten', 500);
    }

    if (!units || units.length === 0) {
      return errorResponse('Keine verfügbaren Einheiten für dieses Dorf', 404);
    }

    // Format units for LLM
    const today = new Date().toISOString().split('T')[0];
    const formattedUnits = units.map((u, i) => {
      const date = u.event_date || u.created_at?.split('T')[0] || 'unbekannt';
      return `[${i + 1}] ID: ${u.id} | Datum: ${date} | Typ: ${u.unit_type} | ${u.statement}`;
    }).join('\n');

    const systemPrompt = `Du bist ein erfahrener Redakteur für einen wöchentlichen lokalen Newsletter.
Deine Aufgabe: Wähle die relevantesten Informationseinheiten für die nächste Ausgabe.

AUSWAHLKRITERIEN (nach Priorität):
1. AKTUALITÄT: Bevorzuge Informationen der letzten 7 Tage STARK.
   Informationen älter als 14 Tage nur bei aussergewöhnlicher Bedeutung.
2. RELEVANZ: Was interessiert die Einwohner dieses Dorfes JETZT?
3. VIELFALT: Decke verschiedene Themen ab (Politik, Kultur, Infrastruktur, Gesellschaft).
4. NEUIGKEITSWERT: Priorisiere Erstmeldungen über laufende Entwicklungen.

Wähle 5-15 Einheiten. Gib die IDs als JSON-Array zurück.
Heute ist: ${today}

AUSGABEFORMAT (JSON):
{
  "selected_unit_ids": ["uuid-1", "uuid-2", ...]
}`;

    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `VERFÜGBARE EINHEITEN:\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter.` },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    let selectedIds: string[] = [];
    try {
      const result = JSON.parse(response.choices[0].message.content);
      selectedIds = result.selected_unit_ids || [];
    } catch {
      return errorResponse('Fehler bei der KI-Auswahl', 500);
    }

    // Validate IDs exist in the original set
    const validIds = new Set(units.map(u => u.id));
    selectedIds = selectedIds.filter(id => validIds.has(id));

    if (selectedIds.length === 0) {
      return errorResponse('KI konnte keine relevanten Einheiten auswählen', 500);
    }

    return jsonResponse({ data: { selected_unit_ids: selectedIds } });
  } catch (error) {
    console.error('Bajour select units error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});
```

**Step 2: Add to `config.toml`**

Append:
```toml
[functions.bajour-select-units]
verify_jwt = false
```

**Step 3: Deploy and verify**

```bash
supabase functions deploy bajour-select-units --workdir ./src/dorfkoenig/supabase
```

**Step 4: Commit**

```bash
git add src/dorfkoenig/supabase/functions/bajour-select-units/index.ts \
        src/dorfkoenig/supabase/config.toml
git commit -m "feat(dorfkoenig): add bajour-select-units edge function"
```

---

## Task 7: Edge Function — `bajour-generate-draft`

**Files:**
- Create: `src/dorfkoenig/supabase/functions/bajour-generate-draft/index.ts`
- Modify: `src/dorfkoenig/supabase/config.toml`

**Step 1: Create the Edge Function**

This follows the same 3-layer prompt pattern as `compose/index.ts` but with newsletter-specific prompts.

```typescript
// Bajour: Generate newsletter draft from selected units
// LLM Call 2 of 2 — draft generation with 3-layer prompt

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';

interface GenerateRequest {
  village_id: string;
  village_name: string;
  unit_ids: string[];
  custom_system_prompt?: string;
}

const LAYER_1_GROUNDING = (villageName: string) =>
  `Du bist ein KI-Assistent für den Newsletter "${villageName} — Wochenüberblick".
Du schreibst AUSSCHLIEßLICH basierend auf den bereitgestellten Informationseinheiten.
ERFINDE KEINE Informationen. Wenn etwas unklar ist, kennzeichne es als "nicht bestätigt".`;

const LAYER_2_DEFAULT = `SCHREIBRICHTLINIEN:
- Newsletter-Format: Kurz, prägnant, informativ
- Beginne mit der wichtigsten Nachricht der Woche
- Fette **wichtige Namen, Zahlen, Daten**
- Sätze: Max 15-20 Wörter, aktive Sprache
- Zitiere Quellen inline [quelle.ch]
- Absätze: 2-3 Sätze pro Nachricht
- Gesamtlänge: 800-1200 Wörter
- Tonalität: Nahbar, lokal, vertrauenswürdig
- Schliesse mit einem Ausblick auf kommende Ereignisse`;

const LAYER_3_FORMAT = `Schreibe den gesamten Newsletter auf Deutsch.

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

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const body: GenerateRequest = await req.json();
    const { village_name, unit_ids, custom_system_prompt } = body;

    if (!unit_ids?.length) {
      return errorResponse('unit_ids erforderlich', 400, 'VALIDATION_ERROR');
    }
    if (unit_ids.length > 20) {
      return errorResponse('Maximal 20 Einheiten', 400, 'VALIDATION_ERROR');
    }

    // Fetch units
    const { data: units, error } = await supabase
      .from('information_units')
      .select('*')
      .eq('user_id', userId)
      .in('id', unit_ids);

    if (error || !units?.length) {
      return errorResponse('Keine Einheiten gefunden', 404);
    }

    // Group by type
    const facts = units.filter(u => u.unit_type === 'fact');
    const events = units.filter(u => u.unit_type === 'event');
    const updates = units.filter(u => u.unit_type === 'entity_update');

    let formatted = '';
    if (facts.length) {
      formatted += 'FAKTEN:\n' + facts.map(f => `- [${f.event_date || f.created_at?.split('T')[0]}] ${f.statement} [${f.source_domain}]`).join('\n') + '\n\n';
    }
    if (events.length) {
      formatted += 'EREIGNISSE:\n' + events.map(e => `- [${e.event_date || e.created_at?.split('T')[0]}] ${e.statement} [${e.source_domain}]`).join('\n') + '\n\n';
    }
    if (updates.length) {
      formatted += 'AKTUALISIERUNGEN:\n' + updates.map(u => `- [${u.event_date || u.created_at?.split('T')[0]}] ${u.statement} [${u.source_domain}]`).join('\n') + '\n\n';
    }

    // Build 3-layer prompt
    const layer2 = custom_system_prompt || LAYER_2_DEFAULT;
    const systemPrompt = `${LAYER_1_GROUNDING(village_name)}\n\n${layer2}\n\n${LAYER_3_FORMAT}`;

    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${formatted}\nErstelle einen Newsletter-Entwurf basierend auf diesen Informationen.` },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    let draft;
    try {
      draft = JSON.parse(response.choices[0].message.content);
    } catch {
      return errorResponse('Fehler bei der Entwurfserstellung', 500);
    }

    return jsonResponse({
      data: {
        title: draft.title || 'Unbenannter Entwurf',
        greeting: draft.greeting || '',
        sections: draft.sections || [],
        outlook: draft.outlook || '',
        sign_off: draft.sign_off || '',
        units_used: units.length,
      },
    });
  } catch (error) {
    console.error('Bajour generate draft error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});
```

**Step 2: Add to `config.toml`**

```toml
[functions.bajour-generate-draft]
verify_jwt = false
```

**Step 3: Deploy and commit**

```bash
supabase functions deploy bajour-generate-draft --workdir ./src/dorfkoenig/supabase
git add src/dorfkoenig/supabase/functions/bajour-generate-draft/index.ts \
        src/dorfkoenig/supabase/config.toml
git commit -m "feat(dorfkoenig): add bajour-generate-draft edge function"
```

---

## Task 8: Edge Function — `bajour-drafts` (CRUD)

**Files:**
- Create: `src/dorfkoenig/supabase/functions/bajour-drafts/index.ts`
- Modify: `src/dorfkoenig/supabase/config.toml`

**Step 1: Create CRUD Edge Function**

This handles listing, creating, and updating bajour drafts. Pattern follows existing `scouts/index.ts`.

Endpoints:
- `GET /bajour-drafts` — List drafts for user, ordered by `created_at DESC`
- `POST /bajour-drafts` — Create a new draft
- `PATCH /bajour-drafts/{id}` — Update a draft (verification status, etc.)

The function reads `x-user-id`, uses `createServiceClient()`, routes by method + path.

**Step 2: Add to `config.toml`**

```toml
[functions.bajour-drafts]
verify_jwt = false
```

**Step 3: Deploy and commit**

```bash
supabase functions deploy bajour-drafts --workdir ./src/dorfkoenig/supabase
git add src/dorfkoenig/supabase/functions/bajour-drafts/index.ts \
        src/dorfkoenig/supabase/config.toml
git commit -m "feat(dorfkoenig): add bajour-drafts CRUD edge function"
```

---

## Task 9: Edge Function — `bajour-send-verification` (WhatsApp Send)

**Files:**
- Create: `src/dorfkoenig/supabase/functions/bajour-send-verification/index.ts`
- Modify: `src/dorfkoenig/supabase/config.toml`

**Step 1: Create the Edge Function**

Reads draft from `bajour_drafts`, sends WhatsApp messages to each correspondent.

For each correspondent:
1. **Message 1:** Plain text with the full draft body
2. **Message 2:** Template message `bajour_draft_verification` with village name parameter + quick reply buttons

WhatsApp API: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`

Environment secrets used:
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_TOKEN`

After sending, updates draft:
- `verification_sent_at = now()`
- `verification_timeout_at = now() + 2 hours`
- `whatsapp_message_ids = [...]` (array of message IDs returned by WhatsApp)
- Initialize `verification_responses` with empty entries for each correspondent

**Step 2: Add to `config.toml`**

```toml
[functions.bajour-send-verification]
verify_jwt = false
```

**Step 3: Deploy and commit**

```bash
supabase functions deploy bajour-send-verification --workdir ./src/dorfkoenig/supabase
git add src/dorfkoenig/supabase/functions/bajour-send-verification/index.ts \
        src/dorfkoenig/supabase/config.toml
git commit -m "feat(dorfkoenig): add bajour-send-verification WhatsApp edge function"
```

---

## Task 10: Edge Function — `bajour-whatsapp-webhook`

**Files:**
- Create: `src/dorfkoenig/supabase/functions/bajour-whatsapp-webhook/index.ts`
- Modify: `src/dorfkoenig/supabase/config.toml`

**Step 1: Create the Webhook Edge Function**

**GET handler** (Meta webhook verification):
- Read `hub.mode`, `hub.verify_token`, `hub.challenge` from query params
- Compare verify token against `WHATSAPP_WEBHOOK_VERIFY_TOKEN` secret
- Return challenge as plain text with 200 if valid

**POST handler** (incoming messages):
1. Verify `X-Hub-Signature-256` header using `WHATSAPP_API_TOKEN` as HMAC key
2. Parse payload: extract `from` phone number and `interactive.button_reply.title`
3. Normalize phone number: strip leading country code `41` → match against correspondents
4. Find the most recent `bajour_drafts` row where:
   - `verification_sent_at IS NOT NULL`
   - `verification_resolved_at IS NULL`
   - The phone number matches a correspondent in `verification_responses` or village data
5. Update `verification_responses` JSONB with the response
6. Apply verification logic:
   ```
   total = number of correspondents
   confirms = responses with "bestätigt"
   rejects = responses with "abgelehnt"
   majority = floor(total / 2) + 1

   if rejects >= majority → "abgelehnt"
   else if confirms >= majority → "bestätigt"
   else if responded == total AND tie → "bestätigt"
   else → "ausstehend" (keep waiting)
   ```
7. If resolved, set `verification_resolved_at = now()`
8. Return 200

**Step 2: Add to `config.toml`**

```toml
[functions.bajour-whatsapp-webhook]
verify_jwt = false
```

**Step 3: Deploy and commit**

```bash
supabase functions deploy bajour-whatsapp-webhook --workdir ./src/dorfkoenig/supabase
git add src/dorfkoenig/supabase/functions/bajour-whatsapp-webhook/index.ts \
        src/dorfkoenig/supabase/config.toml
git commit -m "feat(dorfkoenig): add bajour-whatsapp-webhook edge function"
```

---

## Task 11: API Client + Bajour Drafts Store

**Files:**
- Modify: `src/dorfkoenig/lib/api.ts:186` (add bajour API methods)
- Create: `src/dorfkoenig/stores/bajour-drafts.ts`

**Step 1: Add Bajour API methods to `api.ts`**

Append after `executionsApi` (line 197):

```typescript
export const bajourApi = {
  // Draft CRUD
  listDrafts: () => api.get<import('./types').BajourDraft[]>('bajour-drafts'),
  createDraft: (data: {
    village_id: string;
    village_name: string;
    title: string | null;
    body: string;
    selected_unit_ids: string[];
    custom_system_prompt?: string | null;
  }) => api.post<import('./types').BajourDraft>('bajour-drafts', data),

  // LLM pipeline
  selectUnits: (data: { village_id: string; scout_id: string }) =>
    api.post<{ selected_unit_ids: string[] }>('bajour-select-units', data),
  generateDraft: (data: {
    village_id: string;
    village_name: string;
    unit_ids: string[];
    custom_system_prompt?: string;
  }) => api.post<import('./types').BajourDraftGenerated>('bajour-generate-draft', data),

  // WhatsApp verification
  sendVerification: (draftId: string) =>
    api.post<{ sent_count: number }>('bajour-send-verification', { draft_id: draftId }),
};
```

**Step 2: Create the Bajour drafts store**

Create `src/dorfkoenig/stores/bajour-drafts.ts`:

Follow the existing store pattern (`writable` with factory function). The store manages:
- `drafts: BajourDraft[]`
- `loading: boolean`
- `error: string | null`

Methods:
- `load()` — fetch all drafts from API
- `create(data)` — create a new draft
- `sendVerification(draftId)` — trigger WhatsApp send
- `startPolling()` — poll every 30s for drafts with `ausstehend` status
- `stopPolling()` — clear the polling interval
- `clearError()`

**Step 3: Verify**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/dorfkoenig/lib/api.ts src/dorfkoenig/stores/bajour-drafts.ts
git commit -m "feat(dorfkoenig): add Bajour API client and drafts store"
```

---

## Task 12: UI — Nav Button + Modal Store

**Files:**
- Modify: `src/dorfkoenig/stores/ui.ts:1-3` (add showDraftModal)
- Modify: `src/dorfkoenig/components/Layout.svelte:1-92`

**Step 1: Add modal store**

In `src/dorfkoenig/stores/ui.ts`, add:
```typescript
export const showDraftModal = writable(false);
```

**Step 2: Add "Entwurf" button to Layout.svelte**

Import: `FileEdit` from `lucide-svelte`, `showDraftModal` from stores.

In the `<script>` block, add handler:
```typescript
function handleDraft() {
  showDraftModal.set(true);
}
```

In the template, after the upload button (line 75), add inside the feature flag:
```svelte
{#if import.meta.env.VITE_FEATURE_BAJOUR === 'true'}
  <button class="draft-btn" onclick={handleDraft}>
    <FileEdit size={15} strokeWidth={2.5} />
    <span>Entwurf</span>
  </button>
{/if}
```

Add CSS for `.draft-btn` — use the same outline style as `.upload-btn` to keep it visually consistent.

Add mobile responsive styles: hide span on small screens, icon-only.

**Do NOT create DraftModal component yet** — just mount a placeholder `{#if}` block at the bottom of Layout. The actual modal is Task 13.

**Step 3: Verify**

```bash
npm run typecheck && npm run lint
```

**Step 4: Commit**

```bash
git add src/dorfkoenig/stores/ui.ts src/dorfkoenig/components/Layout.svelte
git commit -m "feat(dorfkoenig): add Entwurf button to nav (feature-flagged)"
```

---

## Task 13: UI — DraftModal Component (Steps 0-5)

**Files:**
- Create: `src/dorfkoenig/components/bajour/DraftModal.svelte`
- Create: `src/dorfkoenig/components/bajour/DraftList.svelte`
- Create: `src/dorfkoenig/components/bajour/VillageSelect.svelte`
- Create: `src/dorfkoenig/components/bajour/DraftPreview.svelte`
- Create: `src/dorfkoenig/components/bajour/VerificationBadge.svelte`
- Modify: `src/dorfkoenig/components/Layout.svelte` (mount DraftModal)

This is the largest task. Build it incrementally — one component at a time.

**Step 1: Create VerificationBadge.svelte**

Small component. Shows status badge with color and icon:
- `ausstehend` → amber, Clock icon
- `bestätigt` → green, CheckCircle icon
- `abgelehnt` → red, XCircle icon

Props: `status: VerificationStatus`

**Step 2: Create VillageSelect.svelte**

A `<select>` dropdown populated from `villages.json`.

Props: `selectedVillageId: string | null`, callback `onselect: (village: Village) => void`

Imports the villages JSON directly: `import villages from '../../data/villages.json'`

**Step 3: Create DraftList.svelte**

Lists existing drafts. Each row shows:
- Village name
- Created date (use `formatRelativeTime` from constants)
- VerificationBadge
- Click to view details

Props: `drafts: BajourDraft[]`, `onselect: (draft: BajourDraft) => void`, `oncreate: () => void`

Has a "Neuer Entwurf" button at top.

**Step 4: Create DraftPreview.svelte**

Renders a generated draft: title, greeting, sections, outlook, sign-off.

Props: `draft: BajourDraftGenerated`

Uses markdown-like rendering: bold text via `**...**` regex replacement.

**Step 5: Create DraftModal.svelte**

The main orchestrator. Follow the ScoutModal pattern (fixed backdrop, centered card, sticky header/footer, Escape to close, backdrop click to close).

State machine with 6 steps (use `$state()` rune):
```typescript
let step = $state<0 | 1 | 2 | 3 | 4 | 5>(0);
```

- **Step 0:** Mount DraftList. On `oncreate` → step 1. On `onselect` → step 4 (view existing).
- **Step 1:** Mount VillageSelect. On village selected + "Weiter" click → step 2.
- **Step 2:** Show ProgressIndicator ("KI wählt relevante Informationen..."). Call `bajourApi.selectUnits()`. On success → step 3.
- **Step 3:** Show ProgressIndicator ("Entwurf wird erstellt...") + collapsible prompt editor (textarea). Call `bajourApi.generateDraft()`. On success → step 4. Save custom prompt to localStorage with `dk_bajour_draft_prompt` key (7-day TTL, same pattern as existing).
- **Step 4:** Mount DraftPreview + buttons: "An Dorfkönige senden" and "Neu generieren". On send → call `bajourApi.createDraft()` then `bajourApi.sendVerification()` → step 5. On regenerate → back to step 3.
- **Step 5:** Confirmation message. "Schliessen" button → step 0.

Props: `open: boolean`, `onclose: () => void`

**Step 6: Mount in Layout.svelte**

Import DraftModal. Mount at bottom of Layout, inside the Bajour feature flag:
```svelte
{#if import.meta.env.VITE_FEATURE_BAJOUR === 'true'}
  <DraftModal open={$showDraftModal} onclose={() => showDraftModal.set(false)} />
{/if}
```

**Step 7: Verify**

```bash
npm run typecheck && npm run lint && npm run build
```

**Step 8: Commit**

```bash
git add src/dorfkoenig/components/bajour/ src/dorfkoenig/components/Layout.svelte
git commit -m "feat(dorfkoenig): add DraftModal with village selection, AI pipeline, and draft preview"
```

---

## Task 14: Polling + Verification Status Updates

**Files:**
- Modify: `src/dorfkoenig/stores/bajour-drafts.ts`
- Modify: `src/dorfkoenig/components/bajour/DraftModal.svelte`

**Step 1: Implement polling in the store**

In `bajour-drafts.ts`, add:
```typescript
let pollInterval: ReturnType<typeof setInterval> | null = null;

startPolling() {
  this.stopPolling();
  pollInterval = setInterval(async () => {
    // Only poll if there are ausstehend drafts
    const state = get(store);
    const hasPending = state.drafts.some(d => d.verification_status === 'ausstehend');
    if (!hasPending) {
      this.stopPolling();
      return;
    }
    await this.load();
  }, 30000);
},

stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
```

**Step 2: Wire polling into DraftModal**

In DraftModal:
- `$effect(() => { if (open) bajourDraftsStore.startPolling(); })` — start when modal opens
- On close: `bajourDraftsStore.stopPolling()`
- On component destroy: `bajourDraftsStore.stopPolling()`

**Step 3: Handle 2-hour timeout**

The webhook edge function handles timeout resolution. But the frontend should also check: if a draft's `verification_timeout_at` is in the past and status is still `ausstehend`, display as `bestätigt` (optimistic display while waiting for next poll to confirm server-side resolution).

**Step 4: Verify**

```bash
npm run typecheck && npm run lint
```

**Step 5: Commit**

```bash
git add src/dorfkoenig/stores/bajour-drafts.ts \
        src/dorfkoenig/components/bajour/DraftModal.svelte
git commit -m "feat(dorfkoenig): add verification status polling"
```

---

## Task 15: Timeout Resolution (Server-Side)

**Files:**
- Create: `src/dorfkoenig/supabase/migrations/00000000000006_bajour_timeout.sql`

**Step 1: Create a database function for timeout resolution**

```sql
-- Resolve timed-out Bajour draft verifications
-- Can be called by pg_cron or by the webhook function

CREATE OR REPLACE FUNCTION resolve_bajour_timeouts()
RETURNS INTEGER AS $$
DECLARE
  resolved_count INTEGER;
BEGIN
  UPDATE bajour_drafts
  SET
    verification_status = 'bestätigt',
    verification_resolved_at = now()
  WHERE verification_status = 'ausstehend'
    AND verification_timeout_at IS NOT NULL
    AND verification_timeout_at < now()
    AND verification_resolved_at IS NULL;

  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  RETURN resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION resolve_bajour_timeouts IS
  'Bajour-specific: Auto-resolve draft verifications that exceed the 2-hour timeout. Defaults to bestätigt.';
```

**Step 2: Run migration**

```bash
supabase db push --workdir ./src/dorfkoenig/supabase
```

**Step 3: Call from webhook**

Update `bajour-whatsapp-webhook/index.ts` to also call `resolve_bajour_timeouts()` on each POST request (piggyback on incoming webhook traffic to resolve timeouts).

**Step 4: Commit**

```bash
git add src/dorfkoenig/supabase/migrations/00000000000006_bajour_timeout.sql \
        src/dorfkoenig/supabase/functions/bajour-whatsapp-webhook/index.ts
git commit -m "feat(dorfkoenig): add timeout resolution for bajour draft verification"
```

---

## Task 16: Pre-Commit Checks + Final Verification

**Step 1: Run all checks**

```bash
npm run lint
npm run typecheck
npm run build
```

All must pass with 0 errors and 0 warnings.

**Step 2: Manual testing checklist**

1. Log in as Bajour user (`493c6d51531c7444365b0ec094bc2d67`)
2. Verify "Entwurf" button appears in nav (5th position)
3. Click "Entwurf" → modal opens
4. Select a village → "Weiter"
5. Watch progress bar during unit selection
6. Watch progress bar during draft generation
7. Review draft → click "An Dorfkönige senden"
8. Verify WhatsApp messages arrive at test phones
9. Tap a button on WhatsApp → verify status updates in modal
10. Close and reopen modal → verify draft list shows with status

**Step 3: Test feature flag off**

Remove `VITE_FEATURE_BAJOUR=true` from `.env.local`. Restart dev server. Verify "Entwurf" button does not appear.

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix(dorfkoenig): final cleanup for bajour village draft feature"
```

---

## Supabase Edge Function Secrets — Setup Checklist

Before testing, set these in **Supabase Dashboard → Edge Functions → Secrets**:

| Secret Name | Value |
|-------------|-------|
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `1391548135967439` |
| `WHATSAPP_PHONE_NUMBER_ID` | `911991348660400` |
| `WHATSAPP_API_TOKEN` | *(the full EAArZAys... token)* |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | *(choose a random string, share with Meta)* |

## Meta Business Manager — Setup Checklist

1. Create template `bajour_draft_verification` per `docs/plans/bajour-whatsapp-template.md`
2. Register webhook URL: `https://{PROJECT_REF}.supabase.co/functions/v1/bajour-whatsapp-webhook`
3. Set verify token to match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Subscribe to `messages` webhook field

---

## Task Dependency Graph

```
Task 1 (event_date migration) ──┐
Task 2 (bajour_drafts table) ───┤
Task 3 (feature flag) ──────────┤
Task 4 (villages + types) ──────┤
                                 ├──→ Task 5 (seed data)
                                 ├──→ Task 6 (select-units EF)
                                 ├──→ Task 7 (generate-draft EF)
                                 ├──→ Task 8 (drafts CRUD EF)
                                 ├──→ Task 9 (send-verification EF)
                                 └──→ Task 10 (webhook EF)

Tasks 6-10 ──→ Task 11 (API client + store)
Task 11 + Task 3 + Task 4 ──→ Task 12 (nav button)
Task 12 ──→ Task 13 (DraftModal UI)
Task 13 ──→ Task 14 (polling)
Task 10 ──→ Task 15 (timeout resolution)
All ──→ Task 16 (final verification)
```

**Parallelizable:** Tasks 1-4 can run in parallel. Tasks 6-10 can run in parallel. Tasks 12-15 are sequential.
