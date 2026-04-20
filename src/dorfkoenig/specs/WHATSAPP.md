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

> **✅ `bajour_draft_verification_v2` approved by Meta on 2026-04-20 and verified end-to-end at 11:58 UTC the same day.** A one-off cron fired `bajour-send-verification` with a 1292-char dummy Arlesheim draft; both correspondents received the template with body rendered above the buttons, `sent → delivered → read` status events landed in `bajour_whatsapp_status_events`, **zero `131047`**. v1 remains live for ~1 week as a fallback. CTO-facing submission runbook archived at `src/dorfkoenig/docs/meta-template-submission.md`.
>
> Two parameter constraints surfaced during the end-to-end test and are encoded in `_shared/correspondents.ts`:
> - **Meta 132018** — template text params cannot contain newlines, tabs, or runs of >4 consecutive spaces. `flattenForTemplate()` replaces `\n+` with ` · ` and caps space runs at 4.
> - **Meta 132005** — body component (fixed text + expanded params) is capped at 1024 characters. `TEMPLATE_PARAM_BODY_MAX` is set to 800 (below the theoretical ~954 ceiling) to absorb unicode accounting differences between V8 `.length` and Meta's server-side count.

### 3.0 Meta UI runbook — creating `bajour_draft_verification_v2`

Meta's template editor is spread across Business Manager + WhatsApp Manager and the URLs change occasionally. The steps below target the WABA `948766194384937` (`bajour-system`). If a URL 404s, start from [business.facebook.com](https://business.facebook.com/) → left rail → **WhatsApp Manager** → **Message templates**.

1. **Log in as the `bajour-system` admin** at https://business.facebook.com/. If you have multiple Business Manager portfolios, switch to the one that owns WABA `948766194384937` via the top-left portfolio dropdown.

2. **Open the templates list**:
   - Direct URL: https://business.facebook.com/wa/manage/message-templates/?waba_id=948766194384937
   - Alt path if the above bounces you: top-left menu → **WhatsApp Manager** → left sidebar **Message templates**. Make sure the WABA selector in the top bar reads **Bajour** / `948766194384937`, not a different account.

3. **Click "Create template"** (top-right, blue button). This opens the template editor.

4. **Category step** — select **Utility**. Do NOT pick Marketing or Authentication. If Meta offers "Let Meta choose a category for me," uncheck it — we want Utility locked so it doesn't get auto-reclassified to Marketing (which changes pricing and adds per-user daily caps).

5. **Name and language step**:
   - Name: `bajour_draft_verification_v2` (lowercase, underscores; Meta enforces this format)
   - Language: scroll/search for **German** (code `de`). Only add one language; multi-language templates complicate the code.

6. **Content step** — four sub-sections in order:

   - **Header**: leave unset ("None"). We don't need a media or text header.

   - **Body**: paste this verbatim into the body textbox (the `{{1}}`, `{{2}}`, `{{3}}` placeholders will auto-highlight as parameters):
     ```
     Entwurf für {{1}} ({{2}}):

     {{3}}

     Bitte bestätigen oder ablehnen.
     ```
     Meta will show three "Sample content for body" input fields below. Fill them with the values from §3.1's "Sample values" subsection:
     - `{{1}}` sample: `Arlesheim`
     - `{{2}}` sample: `2026-04-17`
     - `{{3}}` sample: the multi-line `Willkommen zum aktuellen Wochenüberblick…` text from §3.1. Paste it even if it wraps oddly in the field; the reviewer just needs a realistic example.

     Watch the **character counter** under the body. It should show around 60–90 characters for the frame alone (before samples expand). Meta's hard limit is 1024 chars **including rendered parameter values**, so our code caps `{{3}}` at 950 chars.

   - **Footer** (optional but recommended): `Automatisch generiert — Dorfkönig / Bajour`. Keep it under 60 chars.

   - **Buttons**: click **Add button** → **Quick reply**. Create two:
     - Button 1 text: `Bestätigt`
     - Button 2 text: `Abgelehnt`

     Confirm both are **Quick reply**, not **Call-to-action** or **URL**. The webhook parser at `bajour-whatsapp-webhook/index.ts` matches on button text, so the spelling (capital-B `Bestätigt`, capital-A `Abgelehnt`) must be exact.

7. **Preview pane (right side)** — scroll through it and visually confirm: the body shows `Entwurf für Arlesheim (2026-04-17):` followed by the sample newsletter text, then `Bitte bestätigen oder ablehnen.`, then a footer, then two buttons `Bestätigt` / `Abgelehnt`. If any placeholder still reads `{{1}}`, you forgot to fill a sample — reviewer will reject.

8. **Click "Submit"** at the bottom-right. The template goes into `In review` state.

9. **Bookmark the review status page**:
   - Direct URL: https://business.facebook.com/wa/manage/message-templates/?waba_id=948766194384937 (same list as step 2; the new template appears at the top with a yellow **In review** pill).
   - Status will flip to **Approved** (green) or **Rejected** (red) within 1–24 hours for Utility. You also get an email to the system user's email and a notification in Business Manager's bell icon.
   - If rejected: click the template to see Meta's reason. Most common rejections for this shape are (a) sample content too short / doesn't match the template's apparent use, (b) category mismatch (Meta thinks it's Marketing), (c) parameter ordering. Fix and resubmit — the template name stays reserved for you.

10. **After Approved**: click into the template, copy the **Template ID** (15-digit number near the top), paste it into the §3.1 table in this file under the `Template ID` row for v2, commit, then proceed with §3.2 code migration.

**Common Meta UI gotchas:**
- The WABA selector in the top bar sometimes silently switches to a different WABA when you come back from another tab. Before hitting Submit, verify the breadcrumb still reads your Bajour account.
- Sample values with WhatsApp markdown (`*bold*`, `_italic_`) will confuse the reviewer — keep the sample plaintext even though the real `{{3}}` will include them in production.
- Meta auto-saves drafts every ~30s. If the UI hangs, refresh — your draft appears under "Drafts" tab in the templates list and you can resume.
- If you don't see "Create template" at all, your account is missing the **manage templates** permission on WABA `948766194384937`. Business Manager → Settings → System Users → `bajour-system` → Assigned assets → WhatsApp accounts → grant **Manage templates**.

### Current template — `bajour_draft_verification` (in production, being retired)

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

**Why it's being replaced:** The template carries only the village name, so the current flow sends a separate free-form `type:text` message with the draft body **before** the template. Free-form text is only deliverable inside Meta's 24-hour customer-service window. The 18:00 daily cron almost always fires outside that window (scouts rarely message the business number spontaneously), so the body silently fails with error `131047` while the template goes through. The scout sees only the two buttons and has no context to confirm against. See §3.1 below — this is the active blocker on the cron-triggered pipeline.

### 3.1 Next template — `bajour_draft_verification_v2` (to submit)

Folding the draft body into a template parameter is the only durable fix: template messages are exempt from the 24-hour window. Until this template is **Approved** by Meta, the daily cron will keep producing scout messages that have buttons but no visible body. **There is no server-side hotfix.** Submit this template, then ship the code changes in §3.2.

**Approved template config (live in Meta Business Manager as of 2026-04-20):**

| Field | Value |
|-------|-------|
| Template name | `bajour_draft_verification_v2` |
| Template ID | `TODO (paste 15-digit ID from Meta Manager — runtime uses name, ID is record-keeping only)` |
| Category | **Utility** |
| Language | German (`de`) |
| Status | **Approved** (2026-04-20) |
| Allow category change | Off |

**Header:** none.

**Body** (copy-paste verbatim, `\n` renders as actual line breaks in the Meta editor):

```
Entwurf für {{1}} ({{2}}):

{{3}}

Bitte bestätigen oder ablehnen.
```

| Param | Meaning | Example | Source in code |
|-------|---------|---------|----------------|
| `{{1}}` | Village display name | `Arlesheim` | `draft.village_name` |
| `{{2}}` | Publication date (ISO `YYYY-MM-DD`) | `2026-04-17` | `draft.publication_date` |
| `{{3}}` | Draft body, **plain text, ≤ 1024 chars** | first ~950 chars of `draft.body` + `…` + admin link | `truncateForTemplateParam(draft.body, PUBLIC_APP_URL, draft.id)` — helper to add in `_shared/correspondents.ts` |

**Sample values (required by Meta template reviewer):**

- `{{1}}`: `Arlesheim`
- `{{2}}`: `2026-04-17`
- `{{3}}`: `Willkommen zum aktuellen Wochenüberblick aus Arlesheim.\n\n## Veranstaltungen\n\nAm 19. April 2026 findet die Veranstaltung "Us em alte Arlese" statt (15:00–17:00 und 19:30–21:00).\n\nDer Gemeinderat beschliesst Budget 2026 mit CHF 92 Mio. Ausgaben.\n\n… vollständiger Entwurf: https://wepublish.github.io/labs/dorfkoenig/?draft=<id>&sig=<sig>&exp=<unix>#/feed`

**Footer** (optional, recommended): `Automatisch generiert — Dorfkönig / Bajour`

**Buttons** (same as v1):

| Type | Text |
|------|------|
| Quick Reply | `Bestätigt` |
| Quick Reply | `Abgelehnt` |

**Meta review constraints to be aware of:**

- Body max 1024 chars **including** the rendered values of `{{1}} {{2}} {{3}}`. Reserve ~60 chars for the fixed frame (`"Entwurf für  (): \n\nBitte bestätigen oder ablehnen."` + the formatting newlines). That leaves ~950 chars for `{{3}}`. The truncation helper should enforce this hard.
- Body cannot start or end with a parameter, cannot have two parameters side-by-side — the `Entwurf für {{1}} ({{2}}):` framing satisfies this.
- No URLs in Utility template bodies are tolerated as long as they're inside a parameter (`{{3}}`), not in fixed text. Putting the signed admin link inside `{{3}}` is fine.
- Utility category approval is usually 1–24 hours. Marketing is slower. Do **not** let Meta auto-recategorize to Marketing — it caps to per-user per-day marketing limits and changes pricing.

**After "Approved" status shows in Meta Manager:**

1. Capture the new **Template ID** and paste it into the table above.
2. Proceed with §3.2 code migration.
3. Keep `bajour_draft_verification` v1 in Meta for one week as a fallback, then pause it.

### 3.2 Code migration (only after §3.1 is Approved)

Both edge functions currently send two messages per correspondent (text body then template); after migration they send exactly one message (template v2 with the body as a parameter).

**Files to change:**

1. `supabase/functions/_shared/correspondents.ts` — add a helper:
   ```ts
   const TEMPLATE_PARAM_BODY_MAX = 950; // under Meta's 1024 after frame chars

   export function truncateForTemplateParam(
     body: string,
     publicAppUrl: string,
     draftId: string,
   ): string {
     const link = `${publicAppUrl}/?draft=${draftId}#/feed`;
     const reserve = `\n\n… vollständiger Entwurf: ${link}`;
     const budget = TEMPLATE_PARAM_BODY_MAX - reserve.length;
     if (body.length <= TEMPLATE_PARAM_BODY_MAX) return body;
     return body.slice(0, budget).replace(/\s+\S*$/, '') + reserve;
   }
   ```
   Note: if you want the deep-link signed (so admins can open the draft without being the draft's owner), reuse `signAdminDraftLink` from `_shared/admin-link.ts` — but that forces `truncateForTemplateParam` to be async.

2. `supabase/functions/bajour-auto-draft/index.ts` — replace the per-correspondent send block (currently L257-281, text then template) with a single template call:
   ```ts
   for (const correspondent of correspondents) {
     const phoneWithPlus = '+' + correspondent.phone;
     const templateResult = await sendWhatsAppMessage({
       to: phoneWithPlus,
       type: 'template',
       template: {
         name: 'bajour_draft_verification_v2',
         language: { code: 'de' },
         components: [
           {
             type: 'body',
             parameters: [
               { type: 'text', text: village_name },
               { type: 'text', text: today },
               { type: 'text', text: truncateForTemplateParam(body_md.trim(), PUBLIC_APP_URL, draftId) },
             ],
           },
         ],
       },
     });
     allMessageIds.push(templateResult.message_id);
   }
   ```
   Read `PUBLIC_APP_URL` from `Deno.env.get('PUBLIC_APP_URL')` with the same default as the webhook does.

3. `supabase/functions/bajour-send-verification/index.ts` — mirror the same change at L59-88. The body here is `draft.body`; the date is `draft.publication_date`; the draftId is `draft_id`.

4. `supabase/functions/_shared/constants.ts` — add `TEMPLATE_PARAM_BODY_MAX = 950` if you want it colocated with other constants instead of in `correspondents.ts`.

5. Remove the orientation comment at L260-261 in `bajour-auto-draft/index.ts` and the matching comment at L59-60 in `bajour-send-verification/index.ts` — they describe a send-order workaround that no longer exists.

6. `verification_timeout_at` stays the same (4h in send-verification, 2h in auto-draft). No change.

### 3.3 Defense-in-depth: persist Meta delivery `statuses[]`

Today we learn about 131047 and other delivery failures only because a one-line `console.log` in `bajour-whatsapp-webhook` exposed Meta's status webhooks. That log is temporary. Replace it with a real table so failures are queryable forever.

1. New migration `20260418000000_whatsapp_status_events.sql`:
   ```sql
   CREATE TABLE bajour_whatsapp_status_events (
     id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     wamid       TEXT NOT NULL,
     status      TEXT NOT NULL,           -- 'sent' | 'delivered' | 'read' | 'failed'
     recipient   TEXT NOT NULL,
     error_code  INTEGER,
     error_title TEXT,
     error_detail TEXT,
     raw         JSONB NOT NULL,
     received_at TIMESTAMPTZ DEFAULT now() NOT NULL
   );
   CREATE INDEX ON bajour_whatsapp_status_events (wamid);
   CREATE INDEX ON bajour_whatsapp_status_events (status, received_at DESC);
   ALTER TABLE bajour_whatsapp_status_events ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "service_role_all" ON bajour_whatsapp_status_events
     FOR ALL TO service_role USING (true) WITH CHECK (true);
   ```

2. In `bajour-whatsapp-webhook/index.ts`, after `const body = JSON.parse(rawBody);` and before the `messages` branch, handle the `statuses` path:
   ```ts
   const statuses = value?.statuses;
   if (Array.isArray(statuses) && statuses.length > 0) {
     await supabase.from('bajour_whatsapp_status_events').insert(
       statuses.map((s: any) => ({
         wamid: s.id,
         status: s.status,
         recipient: s.recipient_id ?? '',
         error_code: s.errors?.[0]?.code ?? null,
         error_title: s.errors?.[0]?.title ?? null,
         error_detail: s.errors?.[0]?.error_data?.details ?? null,
         raw: s,
       })),
     );
     return jsonResponse({ status: 'status_recorded', count: statuses.length });
   }
   ```

3. Remove the temporary `console.log('webhook body:', rawBody.slice(0, 4000));` line (inserted 2026-04-17) from the same file.

4. Deploy: `supabase db push --workdir ./src/dorfkoenig` then `supabase functions deploy bajour-whatsapp-webhook --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb --workdir ./src/dorfkoenig`.

Query for failures going forward:
```sql
SELECT wamid, error_code, error_detail, received_at
FROM bajour_whatsapp_status_events
WHERE status = 'failed' AND received_at > NOW() - INTERVAL '24 hours'
ORDER BY received_at DESC;
```

### 3.4 Rollout checklist

- [x] Submit `bajour_draft_verification_v2` via Meta Business Manager (§3.1). *(2026-04-20)*
- [x] Wait for Approved status. Note the template ID. *(2026-04-20 — ID to paste as TODO above)*
- [x] Ship `bajour_whatsapp_status_events` table + webhook patch (§3.3). *(2026-04-20, bundled with §3.2)*
- [x] Once v2 is Approved: update the template name in both edge functions (§3.2), deploy, invoke via `SELECT dispatch_auto_drafts();` for a village whose scout has **not** messaged in 24+ hours (this is the reproduction condition for today's bug), and verify both Samuel and Ernst receive a single template message whose body starts with the village name and contains the draft text. *(verified 2026-04-20 11:58 UTC via one-off cron on dummy Arlesheim draft `aeeaa5d3…` — both correspondents received v2 template, zero 131047)*
- [ ] After a week of green runs, pause the old `bajour_draft_verification` template in Meta Manager.
- [ ] Remove `BAJOUR_CORRESPONDENTS` env secret once unrelated DB migration is also validated.

### 3.5 Evidence trail for the 24h-window root cause

Captured 2026-04-17 after a manual `SELECT dispatch_auto_drafts();` at 19:48 UTC. Scouts Samuel and Ernst last replied > 24h prior. Logged via `console.log` in `bajour-whatsapp-webhook`:

```
statuses[] for text-body wamid to +41786651827: status=failed, code=131047,
  detail="Message failed to send because more than 24 hours have passed since
          the customer last replied to this number."
statuses[] for text-body wamid to +41796169078: same, code=131047.
statuses[] for template wamid to +41786651827: status=sent (category=utility).
statuses[] for template wamid to +41796169078: status=sent → delivered.
```

All four `sendWhatsAppMessage` POSTs returned `200 OK` with a `wamid` at send-time — the failure is asynchronous, reported only via the `statuses[]` webhook we previously ignored. This is why the symptom is silent and why `verificationSent = true` in `auto_draft_runs` even though scouts saw buttons only.

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
