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
x-user-id: tester-1
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
      "frequency": "daily",
      "is_active": true,
      "last_run_at": "2024-01-15T10:30:00Z",
      "consecutive_failures": 0,
      "notification_email": "user@example.com",
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
x-user-id: tester-1

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
- `location`: Optional, JSONB object
- `frequency`: Required, one of: `daily`, `weekly`, `monthly`
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
x-user-id: tester-1

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
x-user-id: tester-1
```

**Response:** `204 No Content`

### POST /scouts/:id/run

Manually trigger a scout execution.

**Request:**
```http
POST /functions/v1/scouts/uuid/run
x-user-id: tester-1

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
x-user-id: tester-1
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
    "would_extract_units": true
  }
}
```

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
GET /functions/v1/units?location_city=Berlin&unused_only=true&limit=50
x-user-id: tester-1
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `location_city` | string | - | Filter by city name |
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
x-user-id: tester-1
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
GET /functions/v1/units/search?q=U-Bahn+Erweiterung&location_city=Berlin&min_similarity=0.4
x-user-id: tester-1
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | Required | Search query (German) |
| `location_city` | string | - | Filter by city |
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
x-user-id: tester-1

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
x-user-id: tester-1

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
x-user-id: tester-1
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
x-user-id: tester-1
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
    "user_id": "tester-1",
    "status": "completed",
    "criteria_matched": true
  }
}
```
