# Dorfkoenig News API

> **Machine-readable spec:** [`../src/dorfkoenig/docs/api/openapi.json`](../src/dorfkoenig/docs/api/openapi.json) — import into Postman/Insomnia or run through `openapi-generator` / `openapi-typescript` to produce clients.

Public, read-only endpoint for fetching confirmed village newsletter drafts. Designed for CMS integration — returns drafts grouped by village within a configurable date range.

## Base URL

```
https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news
```

## Authentication

Authenticate with a shared secret via query parameter or header:

```http
GET /functions/v1/news?auth={NEWS_API_TOKEN}
```

Or:

```http
GET /functions/v1/news
Authorization: Bearer {NEWS_API_TOKEN}
```

The `Authorization` header approach is recommended for production (keeps the token out of server logs and URL history).

## Request

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `auth` | string | Yes* | - | Shared secret token. *Not required if using `Authorization` header. |
| `date` | string | No | Today | Center date in `YYYY-MM-DD` format. |
| `range` | integer | No | `3` | Symmetric range in days around `date`. Max: 30. |

The date range is inclusive on both ends. For example, `?date=2026-04-08&range=3` returns drafts with `publication_date` from 2026-04-05 to 2026-04-11.

## Response

**Status:** `200 OK`
**Cache:** `Cache-Control: public, max-age=300` (5 minutes)

Returns all 10 villages in the `data` object. Each village contains an array of confirmed drafts within the date range. Villages without confirmed drafts return an empty array.

```json
{
  "data": {
    "aesch": [],
    "allschwil": [
      {
        "publication_date": "2026-04-07",
        "draft": "## Wochenrückblick\nDie Gemeindeversammlung hat beschlossen...",
        "items": [
          "Die Gemeindeversammlung hat den Budget-Antrag abgelehnt."
        ]
      }
    ],
    "arlesheim": [],
    "binningen": [],
    "bottmingen": [],
    "muenchenstein": [],
    "muttenz": [],
    "pratteln": [],
    "reinach": [],
    "riehen": [
      {
        "publication_date": "2026-04-08",
        "draft": "## Gemeinderat\nDer Gemeinderat hat den Neubau genehmigt...",
        "items": [
          "Der Gemeinderat hat den Neubau am Bahnhof genehmigt.",
          "Die Hauptstrasse wird nächste Woche gesperrt."
        ]
      }
    ]
  }
}
```

### Draft Object

| Field | Type | Description |
|-------|------|-------------|
| `publication_date` | string | `YYYY-MM-DD` — the date the draft is intended for |
| `draft` | string | Newsletter body in Markdown format (headings, bold, source citations) |
| `items` | string[] | Individual information unit statements used to generate the draft |

### Villages

All 10 Basel-area municipalities are always present in the response:

`aesch`, `allschwil`, `arlesheim`, `binningen`, `bottmingen`, `muenchenstein`, `muttenz`, `pratteln`, `reinach`, `riehen`

## Draft Lifecycle

Drafts are generated automatically at **18:00 Europe/Zurich** daily. Each draft goes through a verification workflow before it becomes available via this API:

1. **18:00** — AI selects relevant information units and generates a draft per village
2. **18:00** — Draft is sent to village correspondents via WhatsApp for verification
3. **20:00** — Verification timeout: unresponded drafts are auto-confirmed
4. **21:00** — Timeout sweep ensures all pending drafts are resolved
5. **22:00** — Recommended query time: all drafts for the day are confirmed

Only drafts with `verification_status = 'bestätigt'` (confirmed) are returned by this endpoint.

## Errors

| Status | Description |
|--------|-------------|
| 401 | Missing or invalid authentication token |
| 400 | Invalid date format (expected `YYYY-MM-DD`) |
| 405 | Method not allowed (only GET is supported) |

## Examples

Fetch today's drafts (default ±3 days):
```bash
curl "https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news?auth=YOUR_TOKEN"
```

Fetch drafts for a specific date:
```bash
curl "https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news?auth=YOUR_TOKEN&date=2026-04-09&range=1"
```

Fetch the last 7 days:
```bash
curl "https://ayksajwtwyjhvpqngvcb.supabase.co/functions/v1/news?auth=YOUR_TOKEN&date=2026-04-09&range=7"
```
