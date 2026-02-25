# Bajour Village Draft — Feature Design

**Date:** 2026-02-25
**Status:** Approved
**Scope:** Bajour-specific feature (feature-flagged)
**Client:** Bajour (Basel-based newsroom, weekly/biweekly publishing cadence)

---

## 1. Overview

A feature-flagged pipeline that allows Bajour journalists to generate AI-drafted newsletters for specific Basel-area villages, send those drafts to village correspondents via WhatsApp for fact-verification, and track verification status over time.

### User Flow

```
[Click "Entwurf" in nav] → [Select village from dropdown] → [AI selects relevant units]
→ [AI generates draft] → [Draft saved with "ausstehend" status]
→ [Send to correspondents via WhatsApp] → [Correspondents verify via buttons]
→ [Verification status updates automatically] → [2hr timeout defaults to "bestätigt"]
```

---

## 2. Feature Flag

**Environment variable:** `VITE_FEATURE_BAJOUR`

| Environment | Where to set | Value |
|-------------|-------------|-------|
| Local dev | `.env.local` | `true` |
| GitHub Pages | GitHub Actions workflow env | `true` |
| Other vendors | Omit or set to `false` | — |

All Bajour-specific UI and logic is gated behind:

```svelte
{#if import.meta.env.VITE_FEATURE_BAJOUR === 'true'}
  <!-- Bajour-only content -->
{/if}
```

The feature flag gates:
- The "Entwurf" button in the top nav (5th position, last)
- The draft modal and all its contents
- The `bajour_drafts` Supabase table usage
- The WhatsApp Edge Functions

---

## 3. Villages Data

Static JSON file at `src/dorfkoenig/data/villages.json`. Ten municipalities in Basel-Stadt and Basel-Landschaft cantons:

```json
[
  {
    "id": "riehen",
    "name": "Riehen",
    "canton": "BS",
    "latitude": 47.5789,
    "longitude": 7.6469,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "bettingen",
    "name": "Bettingen",
    "canton": "BS",
    "latitude": 47.5726,
    "longitude": 7.6639,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "allschwil",
    "name": "Allschwil",
    "canton": "BL",
    "latitude": 47.5508,
    "longitude": 7.5362,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "binningen",
    "name": "Binningen",
    "canton": "BL",
    "latitude": 47.5407,
    "longitude": 7.5695,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "arlesheim",
    "name": "Arlesheim",
    "canton": "BL",
    "latitude": 47.4949,
    "longitude": 7.6207,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "muttenz",
    "name": "Muttenz",
    "canton": "BL",
    "latitude": 47.5225,
    "longitude": 7.6451,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "muenchenstein",
    "name": "Muenchenstein",
    "canton": "BL",
    "latitude": 47.5167,
    "longitude": 7.6167,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "reinach",
    "name": "Reinach",
    "canton": "BL",
    "latitude": 47.4935,
    "longitude": 7.5912,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "oberwil",
    "name": "Oberwil",
    "canton": "BL",
    "latitude": 47.5148,
    "longitude": 7.5555,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  },
  {
    "id": "birsfelden",
    "name": "Birsfelden",
    "canton": "BL",
    "latitude": 47.5528,
    "longitude": 7.6222,
    "correspondents": [
      { "name": "Bob", "phone": "+41783124547" },
      { "name": "Laura", "phone": "+41764999298" }
    ]
  }
]
```

**Production note:** In production, each village will have a variable number of correspondents (not always 2). All code must handle N correspondents, not hardcode 2.

---

## 4. Database Changes

### 4a. Migration: Add `event_date` to `information_units`

New nullable column on the existing table. Does not break existing data or other clients.

```sql
ALTER TABLE information_units
ADD COLUMN event_date DATE;

COMMENT ON COLUMN information_units.event_date IS
  'Date when the event/fact occurred (extracted by LLM). NULL for legacy units.';
```

The unit extraction LLM prompt (Pattern B in `execute-scout/index.ts`) is updated to include `eventDate` in the JSON schema. Existing scouts benefit from this too — it's a general improvement.

### 4b. New table: `bajour_drafts`

Isolated, Bajour-specific table. Clearly documented as client-specific.

```sql
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
  -- Example: [{"name": "Bob", "phone": "+41783124547", "response": "bestätigt", "responded_at": "..."}]
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

-- Index for user queries
CREATE INDEX idx_bajour_drafts_user_id ON bajour_drafts(user_id);
CREATE INDEX idx_bajour_drafts_village_id ON bajour_drafts(village_id);

COMMENT ON TABLE bajour_drafts IS
  'Bajour-specific: AI-generated village newsletter drafts with WhatsApp verification. Client-specific table — not part of core schema.';
```

### 4c. Seed data

A seed file at `src/dorfkoenig/supabase/seed-bajour.sql` creates:

1. **10 scouts** — one per village, under user `493c6d51531c7444365b0ec094bc2d67`, inactive (not scheduled), named `Bajour: {village_name}`
2. **200-500 information units** — 20-50 per village, with:
   - Realistic German-language local news statements
   - `event_date` values spread across the last 30 days (strong recency distribution — more recent = more units)
   - `unit_type` variety: `fact`, `event`, `entity_update`
   - `entities[]` with realistic local names, organizations, places
   - `location` JSONB matching village coordinates
   - `used_in_article = false`

Content categories for seed data:
- Gemeinderat (council) decisions and votes
- Local events (Fasnacht, markets, festivals, sports)
- Infrastructure (road closures, construction, public transport)
- School and community news
- Local business openings/closings
- Environmental/weather events

The seed file is **re-runnable**: it deletes existing Bajour seed data before inserting, so it can repopulate after testing.

---

## 5. LLM Pipeline

Two OpenRouter calls via Supabase Edge Functions, both using `openai/gpt-4o-mini`.

### 5a. Call 1: Unit Selection

**Edge Function:** `bajour-select-units/index.ts`

**Input:** `{ village_id, user_id }`

**Logic:**
1. Query `information_units` for the village's scout, ordered by `event_date DESC` (fallback `created_at DESC`), where `used_in_article = false`
2. Send all candidate units (up to ~100) to the LLM
3. LLM selects the 5-15 most relevant units based on:
   - Strong recency bias (last 7 days heavily preferred)
   - Topical diversity (don't cluster on one story)
   - Audience relevance for a weekly local newsletter
4. Return selected unit IDs

**System prompt (fixed, not editable):**

```
Du bist ein erfahrener Redakteur für einen wöchentlichen lokalen Newsletter.
Deine Aufgabe: Wähle die relevantesten Informationseinheiten für die nächste Ausgabe.

AUSWAHLKRITERIEN (nach Priorität):
1. AKTUALITÄT: Bevorzuge Informationen der letzten 7 Tage STARK.
   Informationen älter als 14 Tage nur bei aussergewöhnlicher Bedeutung.
2. RELEVANZ: Was interessiert die Einwohner von {village_name} JETZT?
3. VIELFALT: Decke verschiedene Themen ab (Politik, Kultur, Infrastruktur, Gesellschaft).
4. NEUIGKEITSWERT: Priorisiere Erstmeldungen über laufende Entwicklungen.

Wähle 5-15 Einheiten. Gib die IDs als JSON-Array zurück.
Heute ist: {current_date}
```

**Response format:** `{ selected_unit_ids: string[] }`

### 5b. Call 2: Draft Generation

**Edge Function:** `bajour-generate-draft/index.ts`

**Input:** `{ village_id, village_name, unit_ids, custom_system_prompt? }`

**Logic:**
1. Fetch the selected units from the database
2. Group by type (FAKTEN / EREIGNISSE / AKTUALISIERUNGEN)
3. Generate draft using 3-layer prompt system

**System prompt — Layer 1 (immutable grounding):**

```
Du bist ein KI-Assistent für den Newsletter "{village_name} — Wochenüberblick".
Du schreibst AUSSCHLIEßLICH basierend auf den bereitgestellten Informationseinheiten.
ERFINDE KEINE Informationen. Wenn etwas unklar ist, kennzeichne es als "nicht bestätigt".
```

**System prompt — Layer 2 (replaceable writing guidelines, default):**

```
SCHREIBRICHTLINIEN:
- Newsletter-Format: Kurz, prägnant, informativ
- Beginne mit der wichtigsten Nachricht der Woche
- Fette **wichtige Namen, Zahlen, Daten**
- Sätze: Max 15-20 Wörter, aktive Sprache
- Zitiere Quellen inline [quelle.ch]
- Absätze: 2-3 Sätze pro Nachricht
- Gesamtlänge: 800-1200 Wörter
- Tonalität: Nahbar, lokal, vertrauenswürdig
- Schliesse mit einem Ausblick auf kommende Ereignisse
```

**System prompt — Layer 3 (immutable output format):**

```json
{
  "title": "Wochentitel",
  "greeting": "Kurze Begrüssung (1 Satz)",
  "sections": [
    {
      "heading": "Abschnittstitel",
      "body": "Inhalt mit **Hervorhebungen** und [Quellen]"
    }
  ],
  "outlook": "Ausblick auf nächste Woche",
  "sign_off": "Abschlussgruss"
}
```

**Temperature:** `0.2`
**Max tokens:** `2500`

---

## 6. WhatsApp Integration

### 6a. Supabase Edge Function Secrets

Set these in the Supabase Dashboard under Edge Function Secrets:

| Secret Name | Value |
|-------------|-------|
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `1391548135967439` |
| `WHATSAPP_PHONE_NUMBER_ID` | `911991348660400` |
| `WHATSAPP_API_TOKEN` | `EAArZAys98prMBQ...` (the full token) |

The business number (`15551510391`) is not needed server-side — it's the sender identity managed by Meta.

### 6b. Send Flow

**Edge Function:** `bajour-send-verification/index.ts`

**Input:** `{ draft_id }`

**Logic:**
1. Fetch draft from `bajour_drafts`
2. Load village data from static config (correspondents + phones)
3. For each correspondent:
   - **Message 1:** Send full draft text as a plain text message
   - **Message 2:** Send interactive buttons message (requires pre-approved template)
4. Store WhatsApp message IDs in `bajour_drafts.whatsapp_message_ids`
5. Set `verification_sent_at = now()`
6. Set `verification_timeout_at = now() + 2 hours`

**WhatsApp API calls:**

```
POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages

# Message 1: Full draft text
{
  "messaging_product": "whatsapp",
  "to": "{correspondent_phone}",
  "type": "text",
  "text": { "body": "{draft_body}" }
}

# Message 2: Template with verification buttons
{
  "messaging_product": "whatsapp",
  "to": "{correspondent_phone}",
  "type": "template",
  "template": {
    "name": "bajour_draft_verification",
    "language": { "code": "de" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "{village_name}" }
        ]
      }
    ]
  }
}
```

### 6c. Webhook: Receive Verification Responses

**Edge Function:** `bajour-whatsapp-webhook/index.ts`

This endpoint is registered in the Meta Developer Console as the WhatsApp webhook URL.

**GET handler** (webhook verification):
- Meta sends a challenge token; the function echoes it back

**POST handler** (incoming messages):
1. Parse the incoming webhook payload
2. Match the sender phone number to a correspondent in `bajour_drafts.verification_responses`
3. Determine response: interactive button reply → `bestätigt` or `abgelehnt`
4. Update `bajour_drafts.verification_responses` JSONB array
5. Re-evaluate overall `verification_status` using majority logic (see section 7)
6. If all correspondents have responded OR status is now deterministic, set `verification_resolved_at`

**Webhook URL format:**
```
https://{SUPABASE_PROJECT_REF}.supabase.co/functions/v1/bajour-whatsapp-webhook
```

### 6d. WhatsApp Message Template

A separate document is provided for the CTO to create in Meta Business Manager. See `docs/plans/bajour-whatsapp-template.md`.

---

## 7. Verification Logic

Generalized for N correspondents (production will have variable counts per village).

```
total     = number of correspondents for the village
responded = number who have responded
confirms  = number who responded "bestätigt"
rejects   = number who responded "abgelehnt"
majority  = floor(total / 2) + 1

Rules (evaluated in order):
1. rejects >= majority          → "abgelehnt"
2. confirms >= majority         → "bestätigt"
3. responded == total AND tie   → "bestätigt"
4. now() > timeout_at           → "bestätigt"
5. otherwise                    → "ausstehend"
```

For the current setup (2 correspondents):
- Both reject → `abgelehnt`
- Both confirm → `bestätigt`
- One confirms, one rejects (tie) → `bestätigt`
- One responds, one silent → wait until timeout
- Timeout (2 hours) → `bestätigt`

---

## 8. UI Components

### 8a. Nav Button

In `Layout.svelte`, gated by feature flag:

```svelte
{#if import.meta.env.VITE_FEATURE_BAJOUR === 'true'}
  <button class="draft-btn" onclick={() => showDraftModal.set(true)}>
    <FileEdit size={18} />
    <span>Entwurf</span>
  </button>
{/if}
```

5th position (last) in nav-center. Same styling as other nav items.

### 8b. Draft Modal

New component: `components/bajour/DraftModal.svelte`

All Bajour-specific components live in `components/bajour/` to keep them isolated.

**States / Steps:**

```
Step 0: Draft List (if drafts exist)
  → Shows existing drafts with village name, date, verification status
  → "Neuer Entwurf" button to proceed to Step 1
  → Click a draft to view details

Step 1: Village Selection
  → Dropdown of 10 villages from villages.json
  → "Weiter" (Next) button

Step 2: Unit Selection (automated + progress bar)
  → ProgressIndicator with "KI wählt relevante Informationen..."
  → LLM Call 1 runs (unit selection)
  → Auto-advances on completion

Step 3: Draft Generation (progress bar + editable prompt)
  → ProgressIndicator with "Entwurf wird erstellt..."
  → Collapsible prompt editor (writing guidelines, Layer 2)
  → LLM Call 2 runs (draft generation)
  → On completion: shows draft preview

Step 4: Draft Review
  → Full draft rendered (title, greeting, sections, outlook, sign-off)
  → "An Dorfkönige senden" button (triggers WhatsApp)
  → "Neu generieren" button (back to Step 3 with prompt editor)
  → Draft is saved to bajour_drafts table

Step 5: Verification Sent
  → Confirmation that WhatsApp messages were sent
  → Shows verification status (ausstehend)
  → "Schliessen" button (returns to Step 0)
```

### 8c. Verification Status Display

Status badges with colors:

| Status | German | Color | Icon |
|--------|--------|-------|------|
| `ausstehend` | Ausstehend | amber/yellow | Clock |
| `bestätigt` | Bestätigt | green | CheckCircle |
| `abgelehnt` | Abgelehnt | red | XCircle |

Each draft in the list shows:
- Village name
- Created date
- Verification status badge
- Individual correspondent responses (if any)

### 8d. Polling for Status Updates

When the modal is open and there are drafts with `ausstehend` status:
- Poll `bajour_drafts` every 30 seconds
- Update verification status badges in real-time
- Stop polling when all visible drafts are resolved

---

## 9. Edge Functions Summary

| Function | Method | Purpose |
|----------|--------|---------|
| `bajour-select-units` | POST | LLM Call 1: Select relevant units for a village |
| `bajour-generate-draft` | POST | LLM Call 2: Generate newsletter draft |
| `bajour-send-verification` | POST | Send draft to correspondents via WhatsApp |
| `bajour-whatsapp-webhook` | GET/POST | Receive WhatsApp verification responses |
| `bajour-drafts` | GET/POST/PATCH | CRUD for bajour_drafts table |

All prefixed with `bajour-` to clearly mark them as client-specific.

---

## 10. Environment Variables & Secrets

### Frontend (.env.local)

Add to `.env.example`:

```
VITE_FEATURE_BAJOUR=               # Set to 'true' to enable Bajour village draft feature
```

### GitHub Actions

Add to the build step environment in the deploy workflow:

```yaml
env:
  VITE_FEATURE_BAJOUR: 'true'
```

### Supabase Edge Function Secrets

Set via Supabase Dashboard → Edge Functions → Secrets:

| Secret | Purpose |
|--------|---------|
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender phone number ID |
| `WHATSAPP_API_TOKEN` | WhatsApp Cloud API bearer token |

Existing secrets remain unchanged:
- `OPENROUTER_API_KEY` (already set, shared with existing functions)
- `FIRECRAWL_API_KEY` (already set)
- `RESEND_API_KEY` (already set)

### Meta Business Manager Setup

1. Create message template `bajour_draft_verification` (see `docs/plans/bajour-whatsapp-template.md`)
2. Register webhook URL: `https://{PROJECT_REF}.supabase.co/functions/v1/bajour-whatsapp-webhook`
3. Subscribe to `messages` webhook field

---

## 11. Bajour User

| Field | Value |
|-------|-------|
| User ID | `493c6d51531c7444365b0ec094bc2d67` |
| Purpose | Dedicated Bajour testing/production user |
| Data isolation | All Bajour scouts, units, and drafts are scoped to this user via RLS |

Add to `PRESET_USERS` in `lib/constants.ts` (behind feature flag check):

```typescript
{ id: '493c6d51531c7444365b0ec094bc2d67', name: 'Bajour' }
```

---

## 12. File Structure (New Files)

```
src/dorfkoenig/
├── data/
│   └── villages.json                          # Static village + correspondent data
├── components/
│   └── bajour/
│       ├── DraftModal.svelte                  # Main modal (steps 0-5)
│       ├── DraftList.svelte                   # Step 0: existing drafts list
│       ├── VillageSelect.svelte               # Step 1: dropdown
│       ├── DraftPreview.svelte                # Step 4: draft review
│       └── VerificationBadge.svelte           # Status badge component
├── stores/
│   └── bajour-drafts.ts                       # Draft CRUD + polling store
├── supabase/
│   ├── migrations/
│   │   ├── 00000000000003_add_event_date.sql  # event_date on information_units
│   │   └── 00000000000004_bajour_drafts.sql   # bajour_drafts table
│   ├── functions/
│   │   ├── bajour-select-units/index.ts
│   │   ├── bajour-generate-draft/index.ts
│   │   ├── bajour-send-verification/index.ts
│   │   ├── bajour-whatsapp-webhook/index.ts
│   │   └── bajour-drafts/index.ts
│   └── seed-bajour.sql                        # Re-runnable seed data
└── lib/
    └── api.ts                                 # Add bajour API methods
```

---

## 13. Security Considerations

1. **WhatsApp API token** is a Supabase Edge Function secret — never exposed to the browser
2. **Correspondent phone numbers** are in a static JSON file committed to the repo — acceptable for now since this is a private repo, but consider moving to Supabase in production
3. **RLS on bajour_drafts** ensures user isolation
4. **Webhook verification** — the WhatsApp webhook handler must verify the `X-Hub-Signature-256` header to ensure requests come from Meta
5. **Feature flag** prevents any Bajour code paths from executing for non-Bajour deployments

---

## 14. Out of Scope (Future)

- Dynamic village/correspondent management UI (currently static JSON)
- Multiple WhatsApp Business accounts
- Draft editing before sending (currently send as-is or regenerate)
- Email notification fallback if WhatsApp fails
- Analytics on verification response times
- Supabase Realtime (polling is sufficient for MVP)
