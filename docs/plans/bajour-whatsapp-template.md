# WhatsApp Message Template — Setup Instructions

**For:** CTO / Meta Business Manager admin
**Account:** WhatsApp Business Account ID `1391548135967439`

---

## Template to Create

This template must be created and approved in **Meta Business Manager** before the Bajour village draft verification feature can go live.

### Template Details

| Field | Value |
|-------|-------|
| **Template name** | `bajour_draft_verification` |
| **Category** | `UTILITY` |
| **Language** | German (`de`) |

### Header

| Type | Value |
|------|-------|
| None | _(no header)_ |

### Body Text

```
Neuer Newsletter-Entwurf fuer {{1}}. Bitte pruefen Sie den vorangehenden Entwurf und bestaetigen oder lehnen Sie die Informationen ab.
```

**Parameter `{{1}}`:** Village name (e.g., "Riehen", "Allschwil")

_Note: The full draft text is sent as a separate plain text message immediately before this template message. The correspondent reads the draft first, then uses the buttons on this message to respond._

### Buttons

| Type | Button Text |
|------|-------------|
| Quick Reply | `Bestätigt` |
| Quick Reply | `Abgelehnt` |

### Sample Values (for Meta review)

| Parameter | Sample |
|-----------|--------|
| `{{1}}` | `Riehen` |

---

## Setup Steps

1. Go to [Meta Business Manager](https://business.facebook.com/) → WhatsApp Manager → Message Templates
2. Click **Create Template**
3. Select category: **Utility**
4. Template name: `bajour_draft_verification`
5. Language: **German (de)**
6. Leave header empty
7. Paste the body text above (with `{{1}}` placeholder)
8. Add two **Quick Reply** buttons: `Bestätigt` and `Abgelehnt`
9. Submit for review

Meta typically approves utility templates within minutes to a few hours.

---

## Webhook Configuration

After the template is approved, register the webhook:

1. Go to Meta Developer Console → Your App → WhatsApp → Configuration
2. Set **Callback URL** to:
   ```
   https://{SUPABASE_PROJECT_REF}.supabase.co/functions/v1/bajour-whatsapp-webhook
   ```
   _(Replace `{SUPABASE_PROJECT_REF}` with your Supabase project reference ID)_
3. Set **Verify Token** to a shared secret (also set as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Supabase Edge Function Secrets)
4. Subscribe to the **messages** webhook field

---

## Edge Function Secrets to Set

In Supabase Dashboard → Edge Functions → Secrets, add:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `1391548135967439` | Business account ID |
| `WHATSAPP_PHONE_NUMBER_ID` | `911991348660400` | Sender phone number ID |
| `WHATSAPP_API_TOKEN` | _(the full EAArZAys... token)_ | Cloud API bearer token |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | _(choose a random string)_ | Shared secret for webhook verification |

---

## Testing

Before going live, test with the WhatsApp Business API test number:

1. Send a test template message to your own phone
2. Verify the buttons appear and are tappable
3. Verify the webhook receives the button response
4. Check that the response payload includes the button text (`Bestätigt` or `Abgelehnt`)

The webhook payload for a button response looks like:

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
