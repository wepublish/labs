# coJournalist-Lite Architecture

## Overview

coJournalist-Lite is a simplified web scout monitoring system deployed as a static Svelte 5 SPA on GitHub Pages with Supabase as the backend. It monitors URLs for content changes, extracts atomic information units, and enables AI-powered article draft generation.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Pages (Static)                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │               Svelte 5 Frontend                          ││
│  │  - Scout management UI                                   ││
│  │  - Composer panel                                        ││
│  │  - Execution history                                     ││
│  └──────────────────────┬──────────────────────────────────┘│
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTPS API calls
┌─────────────────────────┼───────────────────────────────────┐
│                    Supabase                                  │
│  ┌──────────────────────┴──────────────────────────────────┐│
│  │              Edge Functions (Deno)                       ││
│  │  - scouts (CRUD + run/test)                             ││
│  │  - execute-scout (9-step pipeline)                      ││
│  │  - units (list + semantic search)                       ││
│  │  - compose (draft generation)                           ││
│  │  - executions (history)                                 ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │              PostgreSQL + pgvector                       ││
│  │  - scouts, scout_executions                             ││
│  │  - information_units                                    ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │              pg_cron + pg_net                            ││
│  │  - dispatch_due_scouts() every 15 min                   ││
│  │  - cleanup_expired_data() daily                         ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Firecrawl│   │OpenRouter│   │  Resend  │
    │  (scrape)│   │  (AI)    │   │ (email)  │
    └──────────┘   └──────────┘   └──────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Svelte 5 | Reactive UI with runes |
| Build | Vite 6 | Fast bundling, HMR |
| Hosting | GitHub Pages | Static file serving |
| Database | Supabase PostgreSQL | Primary data store |
| Vector Search | pgvector | Semantic search & dedup |
| Scheduling | pg_cron + pg_net | Automated scout runs |
| Backend Logic | Supabase Edge Functions | Serverless Deno runtime |
| AI | OpenRouter (GPT-4o-mini) | Criteria analysis, extraction |
| Scraping | Firecrawl v2 API | Web content with change tracking |
| Email | Resend | Transactional notifications |
| Geocoding | MapTiler | Location autocomplete |
| Auth | Labs mock user pattern | Configurable dev users |

## Data Flow

### Scout Execution Flow

```
1. Trigger (pg_cron or manual)
       │
       ▼
2. dispatch_due_scouts() ──► pg_net HTTP POST
       │
       ▼
3. execute-scout Edge Function
       │
       ├──► Firecrawl: Scrape URL with changeTracking
       │
       ├──► OpenRouter: Analyze criteria match
       │
       ├──► pgvector: Check duplicate (0.85 threshold)
       │
       ├──► PostgreSQL: Store execution record
       │
       ├──► OpenRouter: Extract information units
       │
       ├──► Resend: Send email notification
       │
       └──► Return results
```

### Compose Panel Flow

```
1. User selects location filter
       │
       ▼
2. units Edge Function queries information_units
       │
       ▼
3. User performs semantic search (optional)
       │
       ▼
4. User selects units for article
       │
       ▼
5. compose Edge Function generates draft
       │
       ▼
6. Draft displayed in DraftPreview
```

## Component Boundaries

### Frontend (Static SPA)

- **Responsibilities**: UI rendering, state management, API calls
- **No access to**: Database directly, external API keys
- **Communicates via**: Supabase client library (REST + Realtime)

### Edge Functions (Serverless)

- **Responsibilities**: Business logic, external API calls, data validation
- **Access to**: Database (service role), API keys (via secrets)
- **Execution limits**: 400s wall-clock, 2s CPU, 256MB memory

### PostgreSQL (Database)

- **Responsibilities**: Data persistence, vector search, scheduling
- **Extensions**: pgvector, pg_cron, pg_net
- **RLS**: All tables protected by user_id policies

## External Service Integration

### Firecrawl (Scraping)

- **Endpoint**: `https://api.firecrawl.dev/v2/scrape`
- **Features used**: `changeTracking` with per-scout tags
- **Rate limit**: 6 requests/minute
- **Stagger**: 10s between scout dispatches

### OpenRouter (AI)

- **Model**: `openai/gpt-4o-mini`
- **Use cases**: Criteria analysis, unit extraction, draft generation
- **Embedding model**: `openai/text-embedding-3-small` (1536 dims)

### Resend (Email)

- **Purpose**: Scout alert notifications
- **Template**: German language, HTML formatted
- **Rate limit**: 100/day on free tier

### MapTiler (Geocoding)

- **Purpose**: Location autocomplete in scout form
- **Endpoint**: `https://api.maptiler.com/geocoding/`
- **Returns**: JSONB with city, state, country, coordinates

## Security Model

### Row Level Security (RLS)

All tables enforce user-scoped access:

```sql
-- Example policy
CREATE POLICY "Users can only access their own scouts"
ON scouts FOR ALL
USING (user_id = auth.uid());
```

### API Key Protection

- **Frontend**: Only Supabase anon key (limited permissions)
- **Edge Functions**: Service role key + external API keys via Vault
- **pg_cron**: Uses Vault secrets for internal HTTP calls

### Authentication

- **MVP**: Mock user pattern (user_id in localStorage)
- **Future**: JWT from wepublish CMS (same user_id format)
- **No change required**: Frontend code works for both modes

## Scalability Considerations

### Edge Function Limits

| Limit | Value | Typical Usage |
|-------|-------|---------------|
| Wall-clock | 400s | Scout run: 15-45s |
| CPU time | 2s | LLM calls are I/O |
| Memory | 256MB | JSON processing |
| Concurrent | 100 | Staggered dispatch |

### Database Performance

- **Indexes**: On user_id, scout_id, created_at, location
- **HNSW index**: For vector similarity search
- **Partitioning**: Not needed at MVP scale
- **Connection pooling**: Via Supabase Pooler

### Rate Limiting

- **Firecrawl**: 10s stagger in dispatch function
- **OpenRouter**: No explicit limit needed (I/O bound)
- **Resend**: Track daily sends per user

## Failure Handling

### Scout Execution Failures

1. **Scrape failure**: Store error, increment consecutive_failures
2. **AI failure**: Retry once, then mark failed
3. **3 consecutive failures**: Auto-disable scout
4. **Stuck execution**: Cleanup after 10 minutes

### Notification Failures

1. **Email failure**: Log error, don't retry
2. **User notified**: Via execution history status

## Monitoring

### Execution Metrics

- Status (running/completed/failed)
- Duration (started_at to completed_at)
- Change detection result
- Criteria match result
- Duplicate flag
- Units extracted count

### System Health

- pg_cron job history
- Edge Function logs (Supabase Dashboard)
- Firecrawl usage tracking
