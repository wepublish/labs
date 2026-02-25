# WhatsApp Webhook Setup — Bajour Draft Verification

Edge function secrets have already been configured in Supabase. The following additional secrets must be set in **Supabase Dashboard > Settings > Edge Functions > Secrets**:

| Secret | Value | Purpose |
|--------|-------|---------|
| `WHATSAPP_APP_SECRET` | Meta App Secret (from App Dashboard > Settings > Basic) | HMAC-SHA256 signature verification of incoming webhooks |
| `BAJOUR_CORRESPONDENTS` | JSON mapping village IDs to correspondent arrays (see below) | Maps villages to WhatsApp contacts for verification |

**`BAJOUR_CORRESPONDENTS` format:**
```json
{
  "riehen": [{"name": "Hans Müller", "phone": "+41791234567"}],
  "bettingen": [{"name": "Anna Schmidt", "phone": "+41791234568"}]
}
```

The following steps configure Meta's side.

## 1. Configure Webhook in Meta Business Manager

1. Go to **Meta for Developers** > your app > **WhatsApp** > **Configuration**
2. Under **Webhook**, click **Edit**
3. Enter:
   - **Callback URL:** `https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/bajour-whatsapp-webhook`
   - **Verify token:** `bajour-webhook-2026`
4. Click **Verify and Save** — Meta will send a GET request to the callback URL and the edge function will respond with the challenge token automatically
5. Under **Webhook fields**, subscribe to: **`messages`**

## 2. Create the Message Template

1. Go to **Meta Business Manager** > **WhatsApp Manager** > **Message Templates**
2. Click **Create Template**
3. Configure:
   - **Name:** `bajour_draft_verification`
   - **Category:** Utility
   - **Language:** German (`de`)
4. **Body text:**
   ```
   Bitte prüfen Sie den Entwurf für {{1}} und bestätigen oder lehnen Sie ihn ab.
   ```
   `{{1}}` is the village name — filled dynamically by the edge function.
5. **Buttons** (type: Quick Reply):
   - Button 1: `bestätigt`
   - Button 2: `abgelehnt`
6. Submit for review (utility templates are usually approved within minutes)

## 3. Verify It Works

Once the template is approved:

1. Open the app at `https://localhost:3200/dorfkoenig/?token=493c6d51531c7444365b0ec094bc2d67`
2. Click **Entwurf** in the top bar
3. Select a village, generate a draft, and click send verification
4. The correspondents' WhatsApp numbers should receive the draft text followed by a verification template with two buttons

**Note:** The template must be approved by Meta before the verification buttons can be sent. The draft text itself (plain message) will work immediately.
