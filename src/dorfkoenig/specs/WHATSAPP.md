# WhatsApp Integration — Bajour Draft Verification

Single source of truth for the WhatsApp Business API integration used in the Bajour village newsletter verification workflow. Correspondents receive drafts via WhatsApp and approve/reject them using quick-reply buttons.

## 1. Overview

```
Frontend (StepPreviewSend.svelte)
  → bajourApi.sendVerification(draftId)
    → bajour-send-verification Edge Function
      → WhatsApp Cloud API: send template (buttons) + text (draft body)
      → Update bajour_drafts: verification_sent_at, timeout_at, message_ids

Correspondent taps "Bestätigt" or "Abgelehnt" on WhatsApp
  → Meta webhook POST
    → bajour-whatsapp-webhook Edge Function
      → HMAC-SHA256 signature verification
      → Find matching pending draft by village + correspondent phone
      → Append response, resolve status by majority vote
      → Update bajour_drafts: verification_status, responses, resolved_at
```

Message order per correspondent: template (with verification buttons) is sent first, then the full draft text. This ensures atomicity — if the template fails, no text is sent.

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
| `BAJOUR_CORRESPONDENTS` | JSON mapping village IDs → correspondent arrays (see below) |

## 5. Correspondents Config

The `BAJOUR_CORRESPONDENTS` secret is a JSON object mapping village slugs to arrays of correspondents:

```json
{
  "riehen": [{"name": "Dev Tester 1", "phone": "+41783124547"}],
  "bettingen": [{"name": "Dev Tester 2", "phone": "+41764999298"}]
}

```

Loaded at runtime by `supabase/functions/_shared/correspondents.ts` from `Deno.env.get('BAJOUR_CORRESPONDENTS')`.

## 6. Edge Functions

### `bajour-send-verification` (v9)

Sends the template message (with buttons) followed by the draft text to all correspondents for the draft's village.

- **Path:** `supabase/functions/bajour-send-verification/index.ts`
- **Auth:** `verify_jwt = false`, reads `x-user-id` header
- **Flow:** Load correspondents → for each: send template via Cloud API → send draft text → update `bajour_drafts` (set `verification_sent_at`, `verification_timeout_at`, `whatsapp_message_ids`)
- **Deploy:** `supabase functions deploy bajour-send-verification --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb --workdir ./src/dorfkoenig`

### `bajour-whatsapp-webhook` (v17)

Receives webhook callbacks from Meta, verifies signature, updates verification status.

- **Path:** `supabase/functions/bajour-whatsapp-webhook/index.ts`
- **Auth:** `verify_jwt = false` (Meta cannot send JWTs)
- **GET handler:** Webhook verification handshake (returns `hub.challenge`)
- **POST handler:** HMAC-SHA256 signature check → parse button reply → find matching pending draft → append response → resolve by majority vote → update `bajour_drafts`
- **Button reply formats:** Handles both template quick-reply (`message.button.text`) and interactive message (`message.interactive.button_reply.title`) formats

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

1. **End-to-end send** — Open `https://localhost:3200/dorfkoenig/?token=493c6d51531c7444365b0ec094bc2d67`, go to Feed, open the Bajour draft slide-over, select a village, generate a draft, click "An Dorfkönige senden". Dev numbers should receive the template (with buttons) followed by the draft text.

2. **Webhook response** — Tap "Bestätigt" or "Abgelehnt" on a dev phone. The draft's `verification_status` should update in the UI within 30 seconds (polling interval). Check Supabase logs for webhook processing.

3. **Majority vote** — With 2 correspondents per village, one "Bestätigt" is a majority. Verify that a single approval resolves the draft to `bestätigt`.

4. **Timeout resolution** — Drafts have a 2-hour timeout. Verify `resolve_bajour_timeouts` DB function resolves expired drafts (test by manually setting `verification_timeout_at` to the past).

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
| `supabase/functions/_shared/correspondents.ts` | Loads `BAJOUR_CORRESPONDENTS` from env |
| `supabase/migrations/00000000000005_bajour_drafts.sql` | DB schema with verification columns |
| `supabase/migrations/00000000000006_bajour_timeout.sql` | Timeout resolution function |
| `bajour/components/StepPreviewSend.svelte` | Frontend: preview, send, status override, error handling |
| `bajour/components/VerificationBadge.svelte` | Status badge (ausstehend/bestätigt/abgelehnt) |
| `bajour/api.ts` | API client (`sendVerification()`) |
| `bajour/store.ts` | Store with 30s polling for status updates |
| `bajour/types.ts` | `VerificationResponse`, `BajourDraft` types |
