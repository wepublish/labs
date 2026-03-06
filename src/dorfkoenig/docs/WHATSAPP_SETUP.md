# WhatsApp Integration — Bajour Draft Verification

WhatsApp Business API integration for the Bajour village newsletter verification workflow. Correspondents receive drafts via WhatsApp and approve/reject them using quick-reply buttons.

## Implementation Status

| Component | Status |
|-----------|--------|
| `bajour-send-verification` edge function | Implemented, deployed |
| `bajour-whatsapp-webhook` edge function | Implemented, deployed |
| `bajour_drafts` DB table (verification columns) | Migrated |
| Frontend: draft wizard + verification badges | Implemented |
| Frontend: manual status override | Implemented |
| Frontend: user-friendly WhatsApp error messages | Implemented |
| `_shared/correspondents.ts` (env-based config) | Implemented |
| Integration tests | Written |
| Meta WABA created + system user assigned | Done |
| Phone number registered with Cloud API | Done |
| Webhook verified by Meta | Done |
| Supabase secrets configured | Done |
| Message template `bajour_draft_verification` | Created, **awaiting Meta approval** |

## Architecture

```
Frontend (StepPreviewSend.svelte)
  → bajourApi.sendVerification(draftId)
    → bajour-send-verification Edge Function
      → WhatsApp Cloud API: send template (buttons) + text (draft body)
      → Update bajour_drafts: verification_sent_at, timeout_at, message_ids

Correspondent taps "bestätigt" or "abgelehnt" on WhatsApp
  → Meta webhook POST
    → bajour-whatsapp-webhook Edge Function
      → HMAC-SHA256 signature verification
      → Find matching pending draft by village + correspondent phone
      → Append response, resolve status by majority vote
      → Update bajour_drafts: verification_status, responses, resolved_at
```

Message order per correspondent: template (with verification buttons) is sent first, then the full draft text. This ensures atomicity — if the template is not approved or fails, no text is sent.

## Supabase Edge Function Secrets

All secrets are set in **Supabase Dashboard > Settings > Edge Functions > Secrets**:

| Secret | Purpose |
|--------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID for sending messages (`940463075826339`) |
| `WHATSAPP_API_TOKEN` | System user token (permanent, never expires) |
| `WHATSAPP_APP_SECRET` | HMAC-SHA256 signature verification of incoming webhooks |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook handshake token (`bajour-webhook-2026`) |
| `BAJOUR_CORRESPONDENTS` | JSON mapping village IDs → correspondent arrays (see below) |

**`BAJOUR_CORRESPONDENTS` format:**
```json
{
  "riehen": [{"name": "Dev Tester 1", "phone": "+41783124547"}],
  "bettingen": [{"name": "Dev Tester 2", "phone": "+41764999298"}]
}
```

## Meta Configuration

### WhatsApp Business Account
- **WABA ID:** `1276550124328937`
- **Phone number:** `15558222820` (ID: `940463075826339`, verified as "Codefabrik GmbH")
- **System user:** `bajour-whatsappuser` (Admin access, assigned to WABA + We.Publish app)

### Webhook
- **Callback URL:** `https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/bajour-whatsapp-webhook`
- **Verify token:** `bajour-webhook-2026`
- **Subscribed fields:** `messages`

### Message Template
- **Name:** `bajour_draft_verification`
- **Category:** Utility
- **Language:** German (`de`)
- **Body:** `Bitte prüfen Sie den Entwurf für {{1}} und bestätigen oder lehnen Sie ihn ab.`
- **Buttons:** Quick Reply — `bestätigt`, `abgelehnt`
- **Template ID:** `903870665959823`
- **Status:** Pending approval (track at Meta for Developers → We.Publish app → WhatsApp → Message Templates)

## Remaining: Testing & Verification

Once the message template is approved by Meta:

1. **End-to-end send test** — Open `https://localhost:3200/dorfkoenig/?token=493c6d51531c7444365b0ec094bc2d67`, go to Entwurf, select a village, generate a draft, click "An Dorfkönige senden". Both dev numbers should receive the template (with buttons) followed by the draft text.

2. **Webhook response test** — Tap "bestätigt" or "abgelehnt" on one of the dev phones. The draft's `verification_status` should update in the UI within 30 seconds (polling interval). Check Supabase logs for the webhook processing.

3. **Majority vote logic** — With 2 correspondents per village, one "bestätigt" is a majority. Verify that a single approval resolves the draft to `bestätigt`.

4. **Timeout resolution** — Drafts have a 2-hour timeout. Verify `resolve_bajour_timeouts` DB function resolves expired drafts (can be tested by manually setting `verification_timeout_at` to the past).

5. **Mailchimp pipeline** — After a draft is verified, click "An Mailchimp senden" to confirm the full pipeline: WhatsApp verification → Mailchimp campaign creation.

6. **Edge function redeployment** — The `bajour-send-verification` function was updated (template-first send order, improved error handling). Redeploy via: `supabase functions deploy bajour-send-verification --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb --workdir ./src/dorfkoenig`

## Error Handling

The edge function translates known WhatsApp API errors to German user-facing messages:

| Error Code | Meaning | UI Message |
|------------|---------|------------|
| `132001` | Template not approved | "Die WhatsApp-Nachrichtenvorlage wurde noch nicht genehmigt..." |
| `133010` | Phone not registered | "Die WhatsApp-Telefonnummer ist nicht registriert..." |
| `131047` | Re-engagement required | "Der Empfänger muss zuerst eine Nachricht senden..." |

The frontend (`StepPreviewSend.svelte`) further simplifies these for the journalist. If verification fails but the draft was already saved, the draft is shown with the error so the user can retry later.

## Files

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
| `docs/whatsapp_keys.txt` | Temporary keys file (gitignored, do not commit) |
