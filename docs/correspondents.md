# Korrespondenten -- WhatsApp-Verifizierung

## What are Correspondents?

Correspondents (Korrespondenten) are local contacts who verify AI-generated newsletter drafts via WhatsApp before they are published. Each village has one or more correspondents assigned. When the system generates a KI-Entwurf, it sends the draft to the village's correspondents who can confirm or reject it using WhatsApp quick-reply buttons.

## Current Setup

Currently, 2 correspondents are assigned to all 10 villages (these are test accounts):

| Name | Phone |
|------|-------|
| Ernst Field | 41786651827 |
| Samuel Hufschmid | 41796169078 |

Both are assigned to every village: Aesch, Allschwil, Arlesheim, Binningen, Bottmingen, Muenchenstein, Muttenz, Pratteln, Reinach, and Riehen.

## How Verification Works

### 1. Draft is Sent

When a draft is created (automatically at 18:00 or manually via the Feed panel), the system sends two WhatsApp messages to each correspondent for the draft's village:

1. **Template message** -- A pre-approved WhatsApp template with two quick-reply buttons: "Bestaetigt" and "Abgelehnt". The message reads: "Bitte pruefen Sie den Entwurf fuer [Village] und bestaetigen oder lehnen Sie ihn ab."
2. **Text message** -- The full draft body as plain text.

### 2. Correspondent Responds

The correspondent reads the draft and taps one of the buttons:
- **Bestaetigt** -- Approves the draft for publication
- **Abgelehnt** -- Rejects the draft

### 3. Majority Voting

The system uses majority voting to resolve the verification status:

- If **more than 50%** of correspondents respond "Bestaetigt" -- the draft status becomes `bestaetigt`
- If **more than 50%** respond "Abgelehnt" -- the draft status becomes `abgelehnt`
- Otherwise the draft remains `ausstehend` (pending)

With the current setup of 2 correspondents per village, a single "Bestaetigt" response is enough for approval (1 out of 2 = 50%, which triggers the majority threshold).

### 4. Timeout Auto-Confirm

If no correspondents have responded within **2 hours**, the draft is automatically confirmed (`bestaetigt`) during the 21:00 timeout sweep. This ensures that all drafts are available for the 22:00 CMS query, even if correspondents are unavailable.

## Manual Override

In the Feed panel's Entwuerfe view, editors can manually toggle a draft's verification status using the verification toggle, regardless of WhatsApp responses. This is useful when:

- A correspondent reports an issue outside of WhatsApp
- You need to urgently publish or retract a draft
- WhatsApp delivery failed

## How to Add or Remove Correspondents

Correspondents are managed directly in the database. No code deployment is needed -- changes take effect immediately on the next verification send.

### Via Supabase Dashboard

1. Open the Supabase Dashboard: [https://supabase.com/dashboard/project/ayksajwtwyjhvpqngvcb](https://supabase.com/dashboard/project/ayksajwtwyjhvpqngvcb)
2. Navigate to **Table Editor > bajour_correspondents**
3. To add: click **Insert Row** and fill in the fields
4. To remove: either delete the row or set `is_active` to `false` (preferred -- keeps the record)

### Required Fields

| Field | Format | Example |
|-------|--------|---------|
| `village_id` | Lowercase village identifier | `riehen`, `allschwil`, `muenchenstein` |
| `name` | Display name | `Maria Mueller` |
| `phone` | Phone number **without** the `+` prefix | `41786651827` (not `+41786651827`) |
| `is_active` | Boolean | `true` |

### Important Rules

- **Phone format**: Do NOT include the `+` prefix. The system stores phones without `+` to match the format used by Meta's WhatsApp webhook. The `+` is prepended automatically when sending messages.
- **Unique constraint**: Each phone number can only be assigned once per village. The same phone number can be assigned to multiple villages.
- **Phone validation**: Must match the pattern `^[1-9][0-9]{6,14}$` (7--15 digits, no leading zero).
- **No redeployment needed**: Changes to the `bajour_correspondents` table take effect immediately. The edge functions query the database on every verification send.

### Village IDs

Use these exact IDs when adding correspondents:

| Village | ID |
|---------|-----|
| Aesch | `aesch` |
| Allschwil | `allschwil` |
| Arlesheim | `arlesheim` |
| Binningen | `binningen` |
| Bottmingen | `bottmingen` |
| Muenchenstein | `muenchenstein` |
| Muttenz | `muttenz` |
| Pratteln | `pratteln` |
| Reinach | `reinach` |
| Riehen | `riehen` |

## Deactivating vs. Deleting

Prefer setting `is_active = false` over deleting rows. This preserves the record and makes it easy to reactivate a correspondent later. The system only queries active correspondents (`is_active = true`).

## Troubleshooting

**Draft shows "ausstehend" but correspondents received no message:**
- Check that correspondents exist in `bajour_correspondents` for the draft's `village_id` and `is_active = true`
- Check the phone number format (no `+` prefix, 7--15 digits)
- Check Supabase Edge Function logs for WhatsApp API errors

**Correspondent responded but draft status did not change:**
- The WhatsApp webhook processes responses asynchronously. The Feed panel polls every 30 seconds.
- Check `bajour_drafts > verification_responses` in the Supabase Dashboard to see if the response was recorded.
