# Dorfkönig News API — Integration Guide

API for fetching confirmed village news drafts. Designed to be consumed by MailChimp campaigns or any overview page that surfaces daily village news.

## Base URL

```
https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news
```

## Authentication

The API uses a shared secret token. Pass it via **one** of these methods:

| Method | Example | Recommended |
|--------|---------|-------------|
| Query parameter | `?auth=TOKEN` | For testing |
| Authorization header | `Authorization: Bearer TOKEN` | For production |

The header approach avoids the token appearing in server logs, CDN logs, and browser history.

## Request

```
GET /functions/v1/news?auth=TOKEN&date=2026-04-08&range=3
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `auth` | string | Yes* | — | API token. *Not required if using the `Authorization` header instead. |
| `date` | string | No | Today | Center date (`YYYY-MM-DD`). The API returns drafts around this date. |
| `range` | integer | No | `3` | Number of days before and after `date` to include. Max: `30`. |

**Date range example:** `?date=2026-04-08&range=3` returns all confirmed drafts with a `publication_date` between **2026-04-05** and **2026-04-11** (inclusive).

## Response

```json
{
  "data": {
    "riehen": [
      {
        "publication_date": "2026-04-08",
        "draft": "## Gemeinderat\nDer Gemeinderat hat den Neubau genehmigt...",
        "items": [
          "Der Gemeinderat hat den Neubau am Bahnhof genehmigt.",
          "Die Hauptstrasse wird nächste Woche gesperrt."
        ]
      }
    ],
    "bettingen": [],
    "allschwil": [
      {
        "publication_date": "2026-04-07",
        "draft": "## Wochenrückblick\nDie Gemeindeversammlung hat beschlossen...",
        "items": [
          "Die Gemeindeversammlung hat den Budget-Antrag abgelehnt."
        ]
      },
      {
        "publication_date": "2026-04-06",
        "draft": "## Kurznachrichten\nIm Dorfkern wird gebaut...",
        "items": [
          "Im Dorfkern beginnen ab Montag Bauarbeiten."
        ]
      }
    ]
  }
}
```

### Response structure

The response always includes all 10 villages. Each village maps to an array of drafts (newest first). Villages without confirmed drafts in the date range return an empty array `[]`.

| Field | Type | Description |
|-------|------|-------------|
| `data` | object | Top-level wrapper. Keys are village IDs (see below). |
| `data.{village_id}` | array | All confirmed drafts for this village within the date range. |
| `publication_date` | string | The date this draft is intended for (`YYYY-MM-DD`). Set by the journalist. |
| `draft` | string | Full newsletter body text (Markdown). This is the AI-generated article. |
| `items` | string[] | Individual fact statements extracted from the source material. Short, atomic sentences. |

### Village IDs

| ID | Village | Canton |
|----|---------|--------|
| `riehen` | Riehen | BS |
| `bettingen` | Bettingen | BS |
| `allschwil` | Allschwil | BL |
| `binningen` | Binningen | BL |
| `arlesheim` | Arlesheim | BL |
| `muttenz` | Muttenz | BL |
| `muenchenstein` | Münchenstein | BL |
| `reinach` | Reinach | BL |
| `oberwil` | Oberwil | BL |
| `birsfelden` | Birsfelden | BL |

## Usage with MailChimp

### Typical workflow

1. **Fetch today's news** — call the API with `?date=TODAY&range=0` for only today, or `&range=3` to include near-future and recent drafts.
2. **Build campaign content** — iterate over the villages in the response. For each village with drafts, use the `draft` field as the formatted body text. The `items` array provides standalone bullet points if you prefer a list format.
3. **Populate MailChimp template** — inject the village content into your MailChimp campaign template's content sections.
4. **Handle empty villages** — villages with `[]` have no confirmed news. Use fallback text or skip them.

### Choosing between `draft` and `items`

| Use `draft` when... | Use `items` when... |
|---------------------|---------------------|
| You want a full, coherent article | You want a bullet-point summary |
| The template has a single content block per village | The template has individual news item slots |
| You want headlines and sections (Markdown `##`) | You want standalone one-liners |

### Rendering Markdown

The `draft` field contains Markdown (`## Heading`, `**bold**`, etc.). Convert to HTML before injecting into MailChimp:

```javascript
// Example using marked.js
import { marked } from 'marked';
const html = marked.parse(draft);
```

## Examples

### curl

```bash
# Today's news, default range (±3 days)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news"

# Specific date, tight range
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news?date=2026-04-08&range=1"

# Only exact date (range=0)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news?date=2026-04-08&range=0"
```

### JavaScript

```javascript
const API_URL = 'https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news';
const API_TOKEN = process.env.DORFKOENIG_API_TOKEN;

async function fetchNews(date, range = 3) {
  const params = new URLSearchParams({ date, range: String(range) });
  const res = await fetch(`${API_URL}?${params}`, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const { data } = await res.json();
  return data;
}

// Example: build MailChimp content blocks
const news = await fetchNews('2026-04-08', 3);

for (const [villageId, drafts] of Object.entries(news)) {
  if (drafts.length === 0) continue;

  // Use the most recent draft for each village
  const latest = drafts[0];
  console.log(`${villageId}: ${latest.items.length} items (${latest.publication_date})`);
}
```

## Error responses

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{ "error": { "code": "UNAUTHORIZED", "message": "Ungültiger API-Token" } }` | Invalid or missing token |
| 400 | `{ "error": { "code": "VALIDATION_ERROR", "message": "Ungültiges Datum..." } }` | Bad date format or impossible date |
| 405 | `{ "error": { "message": "Methode nicht erlaubt" } }` | Non-GET request |
| 500 | `{ "error": { "message": "..." } }` | Server error |

## Caching

Responses include `Cache-Control: public, max-age=300` (5 minutes). Drafts are updated by journalists throughout the day, so avoid caching longer than this.

## Rate limits

No explicit rate limit on this endpoint. The 5-minute cache header naturally throttles redundant requests. For production use, poll at most once per minute.
