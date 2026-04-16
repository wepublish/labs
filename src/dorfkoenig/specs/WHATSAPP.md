# WhatsApp Integration — Bajour Draft Verification

Single source of truth for the WhatsApp Business API integration used in the Bajour village newsletter verification workflow. Correspondents receive drafts via WhatsApp and approve/reject them using quick-reply buttons.

## 1. Overview

```
Frontend (StepPreviewSend.svelte)
  → bajourApi.sendVerification(draftId)
    → bajour-send-verification Edge Function
      → WhatsApp Cloud API: send text (draft body) + template (buttons)
      → Update bajour_drafts: verification_sent_at, timeout_at, message_ids

Correspondent taps "Bestätigt" or "Abgelehnt" on WhatsApp
  → Meta webhook POST
    → bajour-whatsapp-webhook Edge Function
      → HMAC-SHA256 signature verification
      → Find matching pending draft by whatsapp_message_ids (JSONB containment)
      → append_bajour_response RPC (SELECT ... FOR UPDATE) appends + resolves atomically
      → On abgelehnt: await Resend admin-alert email with signed deep-link
```

## Resolution rules (as of 2026-04-15)

- **Any `abgelehnt` response** → draft status flips to `abgelehnt` immediately, regardless of how many confirmations have landed.
- **≥1 `bestätigt` AND zero `abgelehnt`** → status flips to `bestätigt`. A single yes is enough when nobody said no.
- **No response before timeout** → status flips to `abgelehnt` (silence is rejection). Implemented in `resolve_bajour_timeouts()`.
- **Every `abgelehnt` webhook** fires an email to `ADMIN_EMAILS` containing the rejecter's name, village, draft title, prior responses, and a signed deep-link back to the draft. Timeout resolutions do **not** fire email (no one actively rejected).

Authoritative logic lives in the `append_bajour_response` Postgres RPC (migration `20260416000006_bajour_any_reject_wins.sql`). A Node-importable mirror for tests is at `bajour/verification.ts`.

## Signed admin deep-link

URL format: `<PUBLIC_APP_URL>/?draft=<uuid>&sig=<hex>&exp=<unix>#/feed`

- HMAC-SHA256 over `${draftId}:${exp}` using `ADMIN_LINK_SECRET`.
- `exp` = now + 7 days.
- The `bajour-get-draft-admin` edge function verifies the signature, then reads the draft via the service role, bypassing the per-user RLS on `bajour_drafts`.
- Rotating `ADMIN_LINK_SECRET` invalidates every outstanding admin link.

Message order per correspondent: the full draft text is sent first, then the template with verification buttons. This puts the draft body above the buttons in the WhatsApp chat (newest messages render at the bottom). If the template send fails after the text, the draft silent-times-out to `abgelehnt` via `resolve_bajour_timeouts` — no manual cleanup.

## 2. Meta Configuration

### WhatsApp Business Account

| Key | Value |
|-----|-------|
| WABA ID | `948766194384937` |
| Phone number | `41313044074` |
| Phone number ID | `1000769769786002` |
| System user | `bajour-system` |
| System user ID | `61582043693238` |

### Webhook

| Key | Value |
|-----|-------|
| Callback URL | `https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/bajour-whatsapp-webhook` |
| Verify token | `bajour-webhook-2026` |
| Subscribed fields | `messages` |

## 3. Message Template

| Field | Value |
|-------|-------|
| Template name | `bajour_draft_verification` |
| Template ID | `954862423770403` |
| Category | Utility |
| Language | German (`de`) |
| Status | **Approved** |

**Body:**

```
Bitte prüfen Sie den Entwurf für {{1}} und bestätigen oder lehnen Sie ihn ab.
```

Parameter `{{1}}`: Village name (e.g., "Riehen", "Allschwil")

**Buttons:**

| Type | Text |
|------|------|
| Quick Reply | `Bestätigt` |
| Quick Reply | `Abgelehnt` |

## 4. Supabase Secrets

All secrets are set in **Supabase Dashboard > Settings > Edge Functions > Secrets** (project ref: `ayksajwtwyjhvpqngvcb`):

| Secret | Purpose |
|--------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID for sending messages (`1000769769786002`) |
| `WHATSAPP_API_TOKEN` | System user token (permanent, never expires) |
| `WHATSAPP_APP_SECRET` | HMAC-SHA256 signature verification of incoming webhooks |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook handshake token (`bajour-webhook-2026`) |
| `BAJOUR_CORRESPONDENTS` | **(deprecated)** Legacy JSON fallback — will be removed once DB migration is validated |

## 5. Correspondents Config

Village correspondents are stored in the `bajour_correspondents` database table:

```sql
bajour_correspondents (
  id UUID PRIMARY KEY,
  village_id TEXT NOT NULL,       -- e.g. 'riehen', 'bettingen'
  name TEXT NOT NULL,
  phone TEXT NOT NULL,            -- WITHOUT '+' prefix (e.g. '41783124547')
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**Phone format**: Phones are stored **without the `+` prefix** to match Meta's webhook format (e.g. `41783124547`). The `bajour-send-verification` function prepends `+` when calling the WhatsApp Cloud API.

**Migration**: `supabase/migrations/20260311000000_bajour_correspondents.sql`

**Managing correspondents**: Use the Supabase table editor or SQL. Set `is_active = false` to deactivate without deleting. No redeployment needed.

**Fallback**: The shared module falls back to the `BAJOUR_CORRESPONDENTS` env secret if the DB query fails, logging a warning. Remove the env secret and fallback code once the DB-based flow is validated.

## 6. Edge Functions

### `bajour-send-verification` (v9)

Sends the full draft text followed by the template message (with buttons) to all correspondents for the draft's village. Order is deliberate: the draft body renders above the buttons in the chat.

- **Path:** `supabase/functions/bajour-send-verification/index.ts`
- **Auth:** `verify_jwt = false`, reads `x-user-id` header
- **Flow:** Load correspondents → for each: send draft text via Cloud API → send template with buttons → update `bajour_drafts` (set `verification_sent_at`, `verification_timeout_at`, `whatsapp_message_ids`)
- **Deploy:** `supabase functions deploy bajour-send-verification --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb --workdir ./src/dorfkoenig`

### `bajour-whatsapp-webhook` (v17)

Receives webhook callbacks from Meta, verifies signature, updates verification status.

- **Path:** `supabase/functions/bajour-whatsapp-webhook/index.ts`
- **Auth:** `verify_jwt = false` (Meta cannot send JWTs)
- **GET handler:** Webhook verification handshake (returns `hub.challenge`)
- **POST handler:** HMAC-SHA256 signature check → parse button reply → find matching pending draft → append response → resolve by majority vote → update `bajour_drafts`
- **Button reply formats:** Handles both template quick-reply (`message.button.text`) and interactive message (`message.interactive.button_reply.title`) formats
- **Draft matching:** The webhook matches incoming messages to drafts using `whatsapp_message_ids` (JSONB column). See "JSONB containment" note below.

### JSONB containment for draft matching

`bajour_drafts.whatsapp_message_ids` is a **JSONB** column (not TEXT[]) storing an array of WhatsApp message IDs. When the webhook looks up a draft by message ID, it uses supabase-js `.contains()` which maps to PostgREST's `cs.` filter (PostgreSQL `@>` operator).

**Known gotcha:** supabase-js `.contains(col, [val])` generates `cs.{val}` (PG array literal), which **silently returns zero rows** on JSONB columns -- no error, just an empty result set. The fix is `.contains(col, JSON.stringify([val]))` which generates `cs.["val"]` (correct JSON literal for JSONB containment). This was the root cause of webhook callbacks failing to match their draft.

## 7. Error Handling

The edge function translates known WhatsApp API errors to German user-facing messages:

| Error Code | Meaning | UI Message |
|------------|---------|------------|
| `132001` | Template not approved | "Die WhatsApp-Nachrichtenvorlage wurde noch nicht genehmigt..." |
| `133010` | Phone not registered | "Die WhatsApp-Telefonnummer ist nicht registriert..." |
| `131047` | Re-engagement required | "Der Empfänger muss zuerst eine Nachricht senden..." |

The frontend (`StepPreviewSend.svelte`) further simplifies these for the journalist. If verification fails but the draft was already saved, the draft is shown with the error so the user can retry later.

## 8. Testing

### Local dev flow

1. **End-to-end send** — Open `https://localhost:3200/dorfkoenig/?token=493c6d51531c7444365b0ec094bc2d67`, go to Feed, open the Bajour draft slide-over, select a village, generate a draft, click "An Dorfkönige senden". Dev numbers should receive the draft text followed by the template (with buttons).

2. **Webhook response** — Tap "Bestätigt" or "Abgelehnt" on a dev phone. The draft's `verification_status` should update in the UI within 30 seconds (polling interval). Check Supabase logs for webhook processing.

3. **Any-reject-wins** — Have one correspondent reply `Abgelehnt` first: status must flip to `abgelehnt` immediately and `ADMIN_EMAILS` must receive an email within ~5 s. Then have another reply `Bestätigt`: status stays `abgelehnt` (prior reject sticks).

4. **Single-confirm-wins** — Have one correspondent reply `Bestätigt` with no rejects outstanding: status flips to `bestätigt`.

5. **Timeout resolution → abgelehnt** — Set `verification_timeout_at` to the past for an `ausstehend` draft, run `SELECT resolve_bajour_timeouts();` — status must flip to `abgelehnt` (no admin email).

5. **Mailchimp pipeline** — After verification, click "An Mailchimp senden" to confirm full pipeline: WhatsApp verification → Mailchimp campaign creation.

### Webhook payload examples

**Template quick-reply** (what Meta actually sends for template button taps):

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "1000769769786002" },
        "messages": [{
          "from": "41783124547",
          "type": "button",
          "button": {
            "text": "Bestätigt",
            "payload": "bestaetigt"
          }
        }]
      }
    }]
  }]
}
```

**Interactive message reply** (for interactive messages, not templates):

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "41783124547",
          "type": "interactive",
          "interactive": {
            "type": "button_reply",
            "button_reply": {
              "id": "0",
              "title": "Bestätigt"
            }
          }
        }]
      }
    }]
  }]
}
```

## 9. File Index

| File | Purpose |
|------|---------|
| `supabase/functions/bajour-send-verification/index.ts` | Sends template + text to correspondents via WhatsApp |
| `supabase/functions/bajour-whatsapp-webhook/index.ts` | Receives webhook callbacks, updates verification status |
| `supabase/functions/_shared/correspondents.ts` | Async DB queries for correspondents (with env fallback) |
| `supabase/migrations/20260311000000_bajour_correspondents.sql` | Correspondents table, RLS, indexes, seed data |
| `supabase/migrations/00000000000005_bajour_drafts.sql` | DB schema with verification columns |
| `supabase/migrations/00000000000006_bajour_timeout.sql` | Original timeout resolution (superseded by `20260416000006_bajour_any_reject_wins.sql`) |
| `supabase/migrations/20260416000006_bajour_any_reject_wins.sql` | Timeout defaults to `abgelehnt` + `append_bajour_response` atomic RPC |
| `supabase/functions/bajour-get-draft-admin/index.ts` | Service-role read of a single draft, authorized by signed admin link |
| `supabase/functions/_shared/admin-link-core.ts` | Pure HMAC helpers for signed admin draft links (Vitest-testable) |
| `supabase/functions/_shared/admin-link.ts` | Deno entry wrapping the core with `ADMIN_LINK_SECRET` from env |
| `bajour/verification.ts` | Node-importable mirror of the resolution rules |
| `bajour/components/StepPreviewSend.svelte` | Frontend: preview, send, status override, error handling |
| `bajour/components/VerificationBadge.svelte` | Status badge (ausstehend/bestätigt/abgelehnt) |
| `bajour/api.ts` | API client (`sendVerification()`) |
| `bajour/store.ts` | Store with 30s polling for status updates |
| `bajour/types.ts` | `VerificationResponse`, `BajourDraft` types |
