# Meta WhatsApp Template Submission — `bajour_draft_verification_v2`

Runbook for submitting the new message template to Meta Business Suite. The daily 18:00 Bajour cron is broken until this template is **Approved**. Utility-category templates typically approve in 1–24h.

Sources verified 2026-04-20:
- https://www.facebook.com/business/help/2055875911147364 — official Meta help, "Create message templates for your WhatsApp Business account"
- https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates — Meta for Developers API reference

**Target WABA:** `948766194384937` (`bajour-system`)

**Entry point:** https://business.facebook.com/

---

## Prerequisites

- You are signed in to Meta Business Suite as an admin of the business portfolio that owns WABA `948766194384937`.
- The system user (or your admin role) has the **Manage templates** permission on that WABA (Business Manager → Settings → Users → System users → assigned assets → WhatsApp accounts → Manage templates). If the **Create message template** button is missing in step 4, this permission is the cause.

---

## Steps

These map 1:1 to Meta's official help article (linked above).

### 1. Go to Meta Business Suite

Open https://business.facebook.com/ and select the business portfolio that owns the Bajour WABA.

### 2. Open WhatsApp Manager

1. Click the menu icon in Meta Business Suite.
2. Click **WhatsApp Manager**.
3. Click the Bajour WhatsApp Business account (WABA ID `948766194384937`).
4. Click the **3-dot icon** (⋯).
5. Click **Manage message templates**.
6. If you have multiple WABAs, use the dropdown at the top to select the Bajour account.

### 3. Start a new template

Click **Create message template**.

### 4. Category, name, language

- **Category:** select **Utility**. Do not pick Marketing or Authentication. If the UI offers any option to let Meta re-categorize automatically, decline it — Utility must be locked so pricing and per-user caps don't change.
- **Name:** `bajour_draft_verification_v2` — Meta only accepts lowercase letters, numbers, and underscores.
- **Language:** German, code `de`. Only add this one language.

Click **Continue**.

### 5. Add sample

Our template uses three variables (`{{1}}`, `{{2}}`, `{{3}}`). Per Meta's help article: *"you must add a content example for your template by clicking the **Add sample** button"* — so click **Add sample** before filling the body, otherwise the sample input fields will not appear and submission fails with a vague example-missing error.

Sample values must be representative but **must not contain real customer data**.

### 6. Header

Leave **None** / unset. No media or text header.

### 7. Body

Paste this verbatim into the body textbox. The `{{1}}`, `{{2}}`, `{{3}}` tokens will auto-detect as variables.

```
Entwurf für {{1}} ({{2}}):

{{3}}

Bitte bestätigen oder ablehnen.
```

Fill the three sample inputs:

- `{{1}}`: `Arlesheim`
- `{{2}}`: `2026-04-17`
- `{{3}}`:

  ```
  Willkommen zum aktuellen Wochenüberblick aus Arlesheim.

  ## Veranstaltungen

  Am 19. April 2026 findet die Veranstaltung "Us em alte Arlese" statt (15:00–17:00 und 19:30–21:00).

  Der Gemeinderat beschliesst Budget 2026 mit CHF 92 Mio. Ausgaben.

  … vollständiger Entwurf: https://wepublish.github.io/labs/dorfkoenig/?draft=<id>&sig=<sig>&exp=<unix>#/feed
  ```

  Paste as-is; wrapping in the textarea doesn't matter.

Length note: the body (fixed text + rendered variable values combined) is capped at 1024 characters by the WhatsApp Cloud API. Our production code caps `{{3}}` to 950 chars, so the sample is safe.

### 8. Footer

Enter: `Automatisch generiert — Dorfkönig / Bajour`

### 9. Buttons

In the **Buttons** dropdown, select **Quick reply**. Add two quick-reply buttons:

- Button 1: `Bestätigt`
- Button 2: `Abgelehnt`

> The webhook parser at `supabase/functions/bajour-whatsapp-webhook/index.ts` matches on button text. Spelling and capitalization must be exact: `Bestätigt` (capital B, with umlaut), `Abgelehnt` (capital A).

Per Meta's help article, quick-reply buttons are capped at 3 per template. We use 2 — fine.

### 10. Verify the preview

Scroll the right-side preview pane and confirm:

- Body shows `Entwurf für Arlesheim (2026-04-17):` followed by the sample text, then `Bitte bestätigen oder ablehnen.`
- Footer: `Automatisch generiert — Dorfkönig / Bajour`
- Two quick-reply buttons: `Bestätigt` and `Abgelehnt`
- No `{{1}}` / `{{2}}` / `{{3}}` placeholders are still visible — if any are, a sample field is empty and the reviewer will reject.

**Caveat from Meta's help article:** *"You can't do a formatting check in the Preview section. It's possible that your template will be rejected due to formatting concerns such as excessive line breaks."* If rejected on formatting, the most common cause is extra blank lines — tighten them and resubmit.

### 11. Submit

Click **Submit**. Template state becomes `In review`.

### 12. Monitor review

- Same **Manage message templates** list. The new template appears with an **In review** pill.
- Status flips to **Approved** (green) or **Rejected** (red) in **1–24 hours** for Utility.
- Meta emails the portfolio admin and raises a Business Manager bell notification.
- If **Rejected**: click the template to see Meta's reason. Common causes: (a) sample content doesn't look representative, (b) Meta auto-classified it as Marketing (resubmit Utility), (c) formatting (excessive newlines), (d) two variables adjacent with no text between them (not a problem here). Fix and resubmit — the template name stays reserved.

### 13. Hand off the Template ID

Once **Approved**, click into the template and copy the Template ID shown on the detail page. Send it to the dev team — they wire it into the edge functions per §3.2 of `specs/WHATSAPP.md`.

---

## Gotchas

- **WABA selector drift.** Switching browser tabs can silently change the top-bar WABA selector. Before clicking **Submit**, confirm the Bajour account is still selected.
- **Markdown in samples.** Don't use WhatsApp formatting (`*bold*`, `_italic_`) inside sample values. Reviewers read samples literally.
- **Auto-save.** Meta auto-saves drafts about every 30 seconds. If the UI hangs, refresh — your draft will be under the **Drafts** tab and you can resume.
- **Missing "Create message template" button.** Means the account lacks **Manage templates** permission on WABA `948766194384937`. Fix it via Business Manager → Settings → Users → System users → `bajour-system` → Assigned assets → WhatsApp accounts → grant **Manage templates**, then retry step 3.

---

## What in this doc is NOT from a primary Meta source

For transparency — these details come from our internal spec (`specs/WHATSAPP.md`) and the Cloud API reference, not the help article:

- The 1024-char body limit and 950-char `{{3}}` cap (from our code + Cloud API reference, not the help article).
- The "1–24 hour Utility approval window" SLA (from our internal experience + community reports; Meta doesn't publish an official SLA).
- The button-text matching requirement (comes from our webhook code, not Meta — but it is a hard constraint for our pipeline).
