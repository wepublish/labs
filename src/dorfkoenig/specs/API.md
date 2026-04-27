# Dorfkoenig API Specification

## Overview

All API endpoints are implemented as Supabase Edge Functions. The base URL is:
```
https://{project-id}.supabase.co/functions/v1
```

## Authentication

All requests require:
- `Authorization: Bearer {SUPABASE_ANON_KEY}` - Supabase anon key
- `x-user-id: {user_id}` - User identifier (from mock auth or JWT)

## Common Response Formats

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "URL ist erforderlich"
  }
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid user ID |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `CONFLICT` | 409 | Resource conflict (e.g., running execution) |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Scouts API

### GET /scouts

List all scouts for the authenticated user.

**Request:**
```http
GET /functions/v1/scouts
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Berlin News Monitor",
      "url": "https://www.berlin.de/aktuelles/",
      "criteria": "Neuigkeiten zu Bauvorhaben",
      "location": {
        "city": "Berlin",
        "state": "Berlin",
        "country": "Germany"
      },
      "topic": "Stadtentwicklung, Verkehr",
      "frequency": "daily",
      "is_active": true,
      "last_run_at": "2024-01-15T10:30:00Z",
      "consecutive_failures": 0,
      "notification_email": "user@example.com",
      "provider": "firecrawl",
      "content_hash": null,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "last_execution_status": "completed",
      "last_criteria_matched": true,
      "last_change_status": "changed",
      "last_summary_text": "Neue Bauvorhaben in Berlin-Mitte wurden angekündigt."
    }
  ]
}
```

> **Note:** The `last_execution_*` fields are joined from the most recent `scout_executions` row for each scout. They are not stored on the `scouts` table itself. Scouts with no executions will have `null` for all four fields.

### POST /scouts

Create a new scout.

**Request:**
```http
POST /functions/v1/scouts
Content-Type: application/json
x-user-id: 493c6d51531c7444365b0ec094bc2d67

{
  "name": "Berlin News Monitor",
  "url": "https://www.berlin.de/aktuelles/",
  "criteria": "Neuigkeiten zu Bauvorhaben oder Stadtplanung in Berlin",
  "location": {
    "city": "Berlin",
    "state": "Berlin",
    "country": "Germany",
    "latitude": 52.52,
    "longitude": 13.405
  },
  "frequency": "daily",
  "notification_email": "user@example.com"
}
```

**Validation:**
- `name`: Required, 1-100 characters
- `url`: Required, valid HTTP(S) URL
- `criteria`: Required, 0-1000 characters (empty allowed for monitor-all mode)
- `location`: Optional, JSONB object (at least one of `location` or `topic` is required)
- `topic`: Optional, comma-separated string (at least one of `location` or `topic` is required)
- `frequency`: Required, one of: `daily`, `weekly`, `biweekly`, `monthly`
- `notification_email`: Optional, valid email format

**Response:** `201 Created`
```json
{
  "data": {
    "id": "uuid",
    "name": "Berlin News Monitor",
    ...
  }
}
```

### PUT /scouts/:id

Update an existing scout.

**Request:**
```http
PUT /functions/v1/scouts/uuid
Content-Type: application/json
x-user-id: 493c6d51531c7444365b0ec094bc2d67

{
  "name": "Berlin Nachrichten Monitor",
  "criteria": "Aktualisierte Kriterien..."
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "uuid",
    ...updated fields...
  }
}
```

### DELETE /scouts/:id

Delete a scout and all associated data.

**Request:**
```http
DELETE /functions/v1/scouts/uuid
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Response:** `204 No Content`

### POST /scouts/:id/run

Manually trigger a scout execution.

**Request:**
```http
POST /functions/v1/scouts/uuid/run
x-user-id: 493c6d51531c7444365b0ec094bc2d67

{
  "skip_notification": false,
  "extract_units": true
}
```

**Query Parameters:**
- `skip_notification`: Skip email notification (default: false)
- `extract_units`: Extract information units (default: true)

**Response:** `202 Accepted`
```json
{
  "data": {
    "execution_id": "uuid",
    "status": "running",
    "message": "Scout-Ausführung gestartet"
  }
}
```

### POST /scouts/:id/test

Preview scout execution without side effects.

**Request:**
```http
POST /functions/v1/scouts/uuid/test
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Response:** `200 OK`
```json
{
  "data": {
    "scrape_result": {
      "title": "Page Title",
      "content_preview": "First 500 chars...",
      "word_count": 1234
    },
    "criteria_analysis": {
      "matches": true,
      "summary": "Die Seite enthält relevante Informationen zu Bauvorhaben...",
      "key_findings": [
        "Neues Bauprojekt in Mitte angekündigt",
        "Genehmigung für Hochhaus erteilt"
      ]
    },
    "would_notify": true,
    "would_extract_units": true,
    "provider": "firecrawl",
    "content_hash": null
  }
}
```

> **Note:** The test endpoint runs a double-probe to detect whether Firecrawl persists changeTracking baselines for the URL. The result is stored as `provider` (`firecrawl` or `firecrawl_plain`) and `content_hash` (SHA-256 for hash-based change detection) on the scout.

---

## Manual Upload API

### POST /manual-upload

Upload text, photos, or PDFs as information units.

**Request (text):**
```http
POST /functions/v1/manual-upload
Content-Type: application/json
x-user-id: 493c6d51531c7444365b0ec094bc2d67

{
  "type": "text",
  "content": "Der Gemeinderat hat den Neubau genehmigt.",
  "location": { "city": "Riehen" },
  "topic": "Stadtentwicklung"
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "units_created": 1,
    "units_merged": 0,
    "units_saved": 1,
    "unit_ids": ["uuid"]
  }
}
```

For staged PDF/text review finalization (`content_type: "pdf_finalize"`), the
same endpoint returns counts only:

```json
{
  "data": {
    "units_created": 21,
    "units_merged": 2,
    "units_saved": 21
  }
}
```

`units_created` counts new canonical `information_units` rows. `units_merged`
counts duplicate review selections: both in-batch duplicates and rows attached
as new `unit_occurrences` to existing canonical units. `units_saved` counts
selected units that produced an occurrence; in-batch duplicates are not saved as
separate occurrences.

---

## Execute Scout API (Internal)

### POST /execute-scout

Called by pg_cron or manual run. Executes the full 9-step pipeline.

**Request:**
```http
POST /functions/v1/execute-scout
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

{
  "scoutId": "uuid",
  "skipNotification": false,
  "extractUnits": true
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "execution_id": "uuid",
    "status": "completed",
    "change_status": "changed",
    "criteria_matched": true,
    "is_duplicate": false,
    "notification_sent": true,
    "units_extracted": 3,
    "duration_ms": 12500,
    "summary": "Neue Bauvorhaben in Berlin-Mitte wurden angekündigt."
  }
}
```

**Error Response (409 Conflict):**
```json
{
  "error": {
    "code": "EXECUTION_RUNNING",
    "message": "Eine Ausführung läuft bereits für diesen Scout"
  }
}
```

---

## Units API

### GET /units

List information units with filtering.

**Request:**
```http
GET /functions/v1/units?location_city=Berlin&topic=Verkehr&unused_only=true&limit=50
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `location_city` | string | - | Filter by city name |
| `topic` | string | - | Filter by topic (ILIKE match, wildcards escaped) |
| `unused_only` | boolean | `true` | Only show unused units |
| `scout_id` | uuid | - | Filter by scout |
| `limit` | integer | `50` | Max results (1-100) |
| `offset` | integer | `0` | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "statement": "Die Berliner Verkehrsbetriebe planen eine neue U-Bahn-Linie.",
      "unit_type": "fact",
      "entities": ["BVG", "Berlin", "U-Bahn"],
      "source_url": "https://example.com/article",
      "source_domain": "example.com",
      "source_title": "Neue U-Bahn-Linie geplant",
      "location": {
        "city": "Berlin",
        "state": "Berlin",
        "country": "Germany"
      },
      "topic": "Verkehr",
      "source_type": "scout",
      "file_path": null,
      "event_date": "2024-01-14",
      "created_at": "2024-01-15T10:30:00Z",
      "used_in_article": false
    }
  ],
  "meta": {
    "total": 125,
    "limit": 50,
    "offset": 0
  }
}
```

### GET /units/locations

Get distinct locations for filter dropdown.

**Request:**
```http
GET /functions/v1/units/locations
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Response:**
```json
{
  "data": [
    {
      "city": "Berlin",
      "state": "Berlin",
      "country": "Germany",
      "count": 45
    },
    {
      "city": "Hamburg",
      "state": "Hamburg",
      "country": "Germany",
      "count": 23
    }
  ]
}
```

### GET /units/search

Semantic search for units.

**Request:**
```http
GET /functions/v1/units/search?q=U-Bahn+Erweiterung&location_city=Berlin&topic=Verkehr&min_similarity=0.4
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | Required | Search query (German) |
| `location_city` | string | - | Filter by city |
| `topic` | string | - | Filter by topic (ILIKE match, wildcards escaped) |
| `unused_only` | boolean | `true` | Only unused units |
| `min_similarity` | float | `0.3` | Min cosine similarity (0-1) |
| `limit` | integer | `20` | Max results |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "statement": "Die U-Bahn-Linie U5 wird bis zum Hauptbahnhof verlängert.",
      "similarity": 0.87,
      ...other fields...
    }
  ]
}
```

### PATCH /units/mark-used

Mark units as used in an article.

**Request:**
```http
PATCH /functions/v1/units/mark-used
Content-Type: application/json
x-user-id: 493c6d51531c7444365b0ec094bc2d67

{
  "unit_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "marked_count": 3
  }
}
```

---

## Compose API

### POST /compose/generate

Generate an article draft from selected units.

**Request:**
```http
POST /functions/v1/compose/generate
Content-Type: application/json
x-user-id: 493c6d51531c7444365b0ec094bc2d67

{
  "unit_ids": ["uuid1", "uuid2", "uuid3"],
  "style": "news",
  "max_words": 500,
  "include_sources": true
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `unit_ids` | uuid[] | Required | Units to include (1-20) |
| `style` | string | `news` | `news`, `summary`, `analysis` |
| `max_words` | integer | `500` | Target word count (100-2000) |
| `include_sources` | boolean | `true` | Include source citations |

**Response:**
```json
{
  "data": {
    "title": "Berliner Verkehrsplanung im Wandel",
    "headline": "Neue U-Bahn-Projekte und Buslinien sollen den ÖPNV in Berlin verbessern.",
    "sections": [
      {
        "heading": "U-Bahn-Erweiterung",
        "content": "Die Berliner Verkehrsbetriebe (BVG) haben angekündigt..."
      },
      {
        "heading": "Neue Busverbindungen",
        "content": "Zusätzlich zur U-Bahn-Erweiterung..."
      }
    ],
    "gaps": [
      "Finanzierung noch unklar",
      "Zeitplan für Fertigstellung fehlt"
    ],
    "sources": [
      {
        "title": "BVG kündigt neue Projekte an",
        "url": "https://example.com/article1",
        "domain": "example.com"
      }
    ],
    "word_count": 487,
    "units_used": 3
  }
}
```

---

## Executions API

### GET /executions

List execution history.

**Request:**
```http
GET /functions/v1/executions?scout_id=uuid&status=completed&limit=20
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scout_id` | uuid | - | Filter by scout |
| `status` | string | - | Filter by status |
| `limit` | integer | `20` | Max results (1-100) |
| `offset` | integer | `0` | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "scout_id": "uuid",
      "scout_name": "Berlin News Monitor",
      "status": "completed",
      "started_at": "2024-01-15T10:30:00Z",
      "completed_at": "2024-01-15T10:30:45Z",
      "change_status": "changed",
      "criteria_matched": true,
      "is_duplicate": false,
      "notification_sent": true,
      "units_extracted": 3,
      "summary_text": "Neue Bauvorhaben in Berlin-Mitte wurden angekündigt."
    }
  ],
  "meta": {
    "total": 156,
    "limit": 20,
    "offset": 0
  }
}
```

### GET /executions/:id

Get execution details.

**Request:**
```http
GET /functions/v1/executions/uuid
x-user-id: 493c6d51531c7444365b0ec094bc2d67
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "scout_id": "uuid",
    "scout": {
      "name": "Berlin News Monitor",
      "url": "https://www.berlin.de/aktuelles/"
    },
    "status": "completed",
    "started_at": "2024-01-15T10:30:00Z",
    "completed_at": "2024-01-15T10:30:45Z",
    "change_status": "changed",
    "criteria_matched": true,
    "is_duplicate": false,
    "duplicate_similarity": null,
    "notification_sent": true,
    "notification_error": null,
    "units_extracted": 3,
    "scrape_duration_ms": 2500,
    "summary_text": "Neue Bauvorhaben in Berlin-Mitte wurden angekündigt.",
    "error_message": null,
    "units": [
      {
        "id": "uuid",
        "statement": "Ein neues Hochhaus in Berlin-Mitte wurde genehmigt.",
        "unit_type": "fact"
      }
    ]
  }
}
```

---

## News API (Public)

Public, read-only endpoint for fetching confirmed village news. Used by WePublish overview page. Does **not** require `x-user-id` or `Authorization` headers — authenticates via shared secret query parameter.

### GET /news

Fetch confirmed drafts grouped by village within a date range.

**Request:**
```http
GET /functions/v1/news?auth={NEWS_API_TOKEN}&date=2026-04-08&range=3
```

**Authentication:** Shared secret via `?auth=` query parameter OR `Authorization: Bearer {TOKEN}` header. The header approach is recommended for production (avoids token in logs/URLs).

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `auth` | string | Yes* | - | Shared secret token (`NEWS_API_TOKEN` env var). *Not required if using `Authorization` header. |
| `date` | string | No | Today | Center date in `YYYY-MM-DD` format |
| `range` | integer | No | `3` | Symmetric range in days (±N around `date`). Max: 30. `?date=2026-04-08&range=3` returns drafts from 2026-04-05 to 2026-04-11. |

**Response:** `200 OK`

Returns all 10 villages. Each village contains an array of all confirmed drafts within the date range, each with its `publication_date`, draft body, and unit statements. Villages without confirmed drafts return an empty array. Response includes `Cache-Control: public, max-age=300`.

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
      }
    ]
  }
}
```

**Error Responses:**
| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid `auth` token |
| 400 | `VALIDATION_ERROR` | Invalid date format (not `YYYY-MM-DD`) or invalid date |
| 405 | - | Non-GET method |

**Environment:** Requires `NEWS_API_TOKEN` as Edge Function secret.

---

## Bajour API

Feature-flagged (`VITE_FEATURE_BAJOUR=true`). Village newsletter draft workflow with WhatsApp verification and Mailchimp campaign creation.

### GET /bajour-drafts

List all Bajour drafts for the authenticated user.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "string",
      "village_id": "riehen",
      "village_name": "Riehen",
      "title": "Wochenüberblick Riehen",
      "body": "Newsletter body text...",
      "selected_unit_ids": ["uuid1", "uuid2"],
      "custom_system_prompt": null,
      "publication_date": "2026-04-08",
      "verification_status": "ausstehend",
      "verification_responses": [],
      "verification_sent_at": null,
      "verification_resolved_at": null,
      "verification_timeout_at": null,
      "whatsapp_message_ids": [],
      "created_at": "2026-02-25T10:00:00Z",
      "updated_at": "2026-02-25T10:00:00Z"
    }
  ]
}
```

### POST /bajour-drafts

Create a new Bajour draft.

**Request:**
```json
{
  "village_id": "riehen",
  "village_name": "Riehen",
  "title": "Wochenüberblick Riehen",
  "body": "Newsletter body text...",
  "selected_unit_ids": ["uuid1", "uuid2"],
  "custom_system_prompt": null,
  "publication_date": "2026-04-08"
}
```

**Notes:**
- `publication_date`: Optional, defaults to today. `YYYY-MM-DD` format. Controls which date this draft is valid for (used by the News API).

**Response:** `201 Created` — same shape as GET item.

### PATCH /bajour-drafts/:id

Update an existing draft (only own drafts). Used for manual verification status override.

**Request:**
```json
{
  "verification_status": "bestätigt"
}
```

**Supported fields:** `title`, `body`, `village_id`, `village_name`, `selected_unit_ids`, `custom_system_prompt`, `publication_date`, `verification_status`.

**Response:** `200 OK` — full draft object.

### GET /bajour-select-units

Returns the current unit selection prompt.

**Response:**
```json
{
  "data": {
    "prompt": "..."
  }
}
```

### POST /bajour-select-units

AI-selects relevant information units for a village based on its scout's data.

**Request:**
```json
{
  "village_id": "riehen",
  "scout_id": "ba000000-0001-4000-a000-000000000001"
}
```

**Response:**
```json
{
  "data": {
    "selected_unit_ids": ["uuid1", "uuid2", "uuid3"]
  }
}
```

### POST /bajour-auto-draft

Automated daily draft pipeline for a single village. Dispatched by pg_cron via `dispatch_auto_drafts()`. **Not for frontend use** — service role only.

**Request:**
```json
{
  "village_id": "riehen",
  "village_name": "Riehen",
  "scout_id": "ba000000-0001-4000-a000-000000000001",
  "user_id": "493c6d51531c7444365b0ec094bc2d67"
}
```

**Auth:** Service role key (`Authorization: Bearer {SERVICE_ROLE_KEY}`). Dispatched by pg_cron, not accessible from the frontend.

**Pipeline:** idempotency check → select units (`INFORMATION_SELECT_PROMPT`, 2-day recency, max 20) → generate draft (`DRAFT_COMPOSE_PROMPT`) → save to `bajour_drafts` (publication_date = today Zurich) → send WhatsApp verification (non-fatal) → log to `auto_draft_runs`.

**Response:**
```json
{
  "data": {
    "status": "completed",
    "draft_id": "uuid",
    "units_selected": 8,
    "verification_sent": true
  }
}
```

Possible `status` values: `completed`, `skipped` (already ran today for this village), `failed`.

### POST /bajour-send-verification

Send a draft to village correspondents via WhatsApp for verification.

**Request:**
```json
{
  "draft_id": "uuid"
}
```

**Response:**
```json
{
  "data": {
    "sent_count": 2
  }
}
```

### POST /bajour-send-mailchimp

Aggregate all verified (`bestätigt`) drafts and create a Mailchimp campaign from the "Dorfkönig-Basis" template.

**Request:** `{}` (empty body — aggregates all verified drafts for the user)

**Flow:**
1. Fetches all `bestätigt` drafts for the user
2. Finds the "Dorfkönig-Basis" template campaign in Mailchimp
3. Loads its HTML and replaces `text:{villageId}` placeholders with draft content using cheerio
4. Villages without verified drafts get fallback text: "Heute leider keine News für dieses Dorf :("
5. Deletes any existing same-day campaign, creates new one titled `Dorfkönig-Basis - {YYYY-MM-DD}`
6. Does NOT send — admins review in Mailchimp first

**Response:**
```json
{
  "data": {
    "campaign_id": "abc123",
    "village_count": 3
  }
}
```

**Error Codes:**
| Code | Status | Description |
|------|--------|-------------|
| `NO_VERIFIED_DRAFTS` | 400 | No drafts with `bestätigt` status |
| `TEMPLATE_NOT_FOUND` | 404 | "Dorfkönig-Basis" campaign not found in Mailchimp |
| `TEMPLATE_HTML_MISSING` | 500 | Template campaign has no HTML content |

**Environment:** Requires `MAILCHIMP_API_KEY` and `MAILCHIMP_SERVER` as Edge Function secrets.

**Mailchimp config:**
- Template campaign: "Dorfkönig-Basis" (ID: `c708a857cc`)
- List: "WePublish" (ID: `851436c80e`)
- Placeholders: `text:{villageId}` in `<p>` elements (e.g., `text:riehen`, `text:bettingen`)

---

## CORS Configuration

All Edge Functions include CORS headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-user-id, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| All endpoints | 100 requests | per minute |
| `/scouts/:id/run` | 10 requests | per hour per scout |
| `/compose/generate` | 20 requests | per hour |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312800
```

---

## Webhook Events (Future)

For future integrations, Edge Functions can emit events:

```typescript
// Event payload structure
{
  "event": "scout.execution.completed",
  "timestamp": "2024-01-15T10:30:45Z",
  "data": {
    "execution_id": "uuid",
    "scout_id": "uuid",
    "user_id": "493c6d51531c7444365b0ec094bc2d67",
    "status": "completed",
    "criteria_matched": true
  }
}
```
