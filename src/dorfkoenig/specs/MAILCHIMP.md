# Mailchimp Integration

The Bajour feature sends village newsletter drafts as Mailchimp campaigns via the `bajour-send-mailchimp` edge function.

## Architecture

The edge function does **not** fetch template HTML from the Mailchimp API at runtime. Instead, the newsletter template is embedded directly in code (`template.ts`). This is intentional — Mailchimp's `GET /content` API returns a degraded 7k generic HTML instead of the full 23k editor HTML for the template campaign (see [Known Limitations](#known-limitations)).

Content is injected into the new campaign via `setContent({ html })`, which works correctly on newly created campaigns.

## How It Works

1. Fetch all verified (`bestätigt`) drafts for the user from `bajour_drafts`
2. Find the template campaign "Dorfkönig-Basis" via `campaigns.list()` (used for settings and list ID only)
3. Load the embedded template HTML from `template.ts`
4. Build combined village content: `<strong>Village Name</strong><br>body` per village, joined by `<br><br>`
5. Replace all `text:\w+` placeholders via regex — first placeholder gets the combined content, remaining are cleared
6. Delete any existing same-day campaign (title: `Dorfkönig-Basis - YYYY-MM-DD`)
7. Create a new campaign with settings copied from the template
8. Set the modified HTML on the new campaign
9. Return `{ campaign_id, village_count }`

## Template

The newsletter template originates from Mailchimp campaign `c708a857cc` ("Dorfkönig-Basis"). It uses Mailchimp's New Builder format with `data-block-id` attributes and `mceText` CSS classes.

The template contains two `text:\w+` placeholders (`text:aesch` and `text:reinach`) which the edge function treats as generic content slots — village content is not matched by placeholder name.

### Template Files

| File | Purpose |
|------|---------|
| `supabase/functions/bajour-send-mailchimp/template.ts` | Exported `TEMPLATE_HTML` constant used at runtime |
| `bajour/mailchimp-template.html` | Raw HTML backup for reference |

### Updating the Template

To update the newsletter design:

1. Edit `bajour/mailchimp-template.html` with the new HTML
2. Copy the content into `supabase/functions/bajour-send-mailchimp/template.ts` as the `TEMPLATE_HTML` export (use a template literal, escape backticks and `${`)
3. Ensure the HTML contains at least one `text:\w+` placeholder where village content should appear
4. Redeploy the edge function

## Mailchimp Configuration

| Field | Value |
|-------|-------|
| Template Campaign | "Dorfkönig-Basis" (looked up by title at runtime) |
| Audience | WePublish (list ID `851436c80e`, used as fallback) |
| Server | `us21` |

### Environment Variables

Set as Supabase Edge Function secrets:

- `MAILCHIMP_API_KEY` — Mailchimp API key (also in `.env.local` for local reference)
- `MAILCHIMP_SERVER` — Data center prefix (e.g., `us21`)

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/bajour-send-mailchimp/index.ts` | Edge function entrypoint |
| `supabase/functions/bajour-send-mailchimp/template.ts` | Embedded newsletter template HTML (23k) |
| `bajour/mailchimp-template.html` | Raw HTML backup of the template |
| `bajour/villages.json` | Village IDs and names (10 villages) |
| `bajour/api.ts` | Frontend API client (`sendToMailchimp()`) |

## Known Limitations

### Mailchimp `getContent` API degrades template HTML

Using `PUT /campaigns/{id}/content` with `{ html }` on a New Builder campaign converts it from editor format to raw HTML mode. After this:

- `GET /content` returns ~7,100 chars of generic HTML instead of the original ~23,700 chars
- `data-block-id` attributes and `text:\w+` placeholders are lost
- The PUT response shows correct HTML, but it does not persist on subsequent GET

This is why the edge function embeds the template locally rather than fetching it at runtime. The `setContent({ html })` call on **newly created campaigns** works correctly — the issue only affects the template campaign itself.

### Mailchimp template sections API

The proper way to modify template-based campaigns via API is `PUT /content` with the `template` parameter (`{ id, sections }`) rather than raw `html`. This was not used because the embedded approach is simpler and fully code-controlled.
