# Dorfkoenig - Agent Guide

Web scout monitoring system for journalists. Svelte 5 SPA + Supabase backend. German-only UI. Part of the `labs` monorepo.

Users configure **Scouts** (URL + criteria + location), which are scraped on schedule. When content changes match criteria, **Information Units** (atomic facts) are extracted and stored with embeddings. The **Compose** panel lets journalists search units semantically and draft articles.

## Directory Structure

```
src/dorfkoenig/
├── CLAUDE.md              # This file
├── index.html             # Entry point (Vite app discovery)
├── main.ts                # Mounts Svelte app
├── App.svelte             # Root component + hash router
├── styles.css             # App-specific styles
├── lib/
│   ├── api.ts             # API client (Edge Function calls)
│   ├── types.ts           # TypeScript interfaces
│   ├── constants.ts       # App constants
│   └── supabase.ts        # Supabase client init
├── stores/
│   ├── auth.ts            # Auth (extends @shared/stores/auth)
│   ├── scouts.ts          # Scouts CRUD + run/test
│   ├── units.ts           # Units list/search/markUsed
│   └── executions.ts      # Execution history + pagination
├── routes/
│   ├── Dashboard.svelte   # Scout list + create
│   ├── ScoutDetail.svelte # Scout edit + execution history
│   ├── History.svelte     # All executions
│   ├── Compose.svelte     # Unit search + article drafting
│   └── Login.svelte       # Mock auth login
├── components/
│   ├── Layout.svelte      # Shell (nav + content)
│   ├── LoginForm.svelte
│   ├── scouts/            # ScoutCard, ScoutForm, ScoutList
│   ├── executions/        # ExecutionCard, ExecutionList
│   └── compose/           # ComposePanel, DraftPreview, LocationFilter, SearchBar, UnitList
├── __tests__/             # Vitest unit tests
│   ├── setup.ts           # Test setup (localStorage mock)
│   ├── lib/
│   │   ├── api.test.ts    # API client + all typed helpers
│   │   └── constants.test.ts  # Constants + formatting functions
│   └── stores/
│       ├── auth.test.ts   # Auth store (login/logout/init)
│       ├── scouts.test.ts # Scouts store CRUD + run/test
│       ├── scout-wizard.test.ts  # Two-step wizard flow
│       └── units.test.ts  # Units store load/search/markUsed
├── supabase/              # Backend (see supabase/CLAUDE.md)
├── specs/                 # Detailed specifications
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── PIPELINES.md
│   ├── FRONTEND.md
│   ├── AUTH.md
│   └── DEPLOYMENT.md
└── docs/
    ├── README.md
    ├── SETUP.md
    └── MANUAL_SETUP.md
```

## Monorepo Integration

This app lives in the `labs` monorepo. Shared imports:

```typescript
import { Button, Card, Loading, ErrorBoundary } from '@shared/components';
import { auth } from '@shared/stores/auth';
import '@shared/styles/global.css';
```

- Dev: `https://localhost:3200/dorfkoenig/`
- Prod: `https://wepublish.github.io/labs/dorfkoenig/`
- Commands run from repo root: `npm run dev`, `npm run build`, `npm run typecheck`

## Architecture Overview

```
Frontend (Svelte 5 SPA)
  → lib/api.ts (fetch wrapper)
    → Supabase Edge Functions (Deno)
      → PostgreSQL + pgvector
      → External APIs (Firecrawl, OpenRouter, Resend)

Scheduling:
  pg_cron (*/15 min) → dispatch_due_scouts() → pg_net HTTP → execute-scout Edge Function
```

## Key Types (`lib/types.ts`)

| Type | Key Fields |
|------|-----------|
| `Scout` | id, user_id, name, url, criteria, location, topic, frequency, is_active, notification_email, last_execution_status?, last_criteria_matched?, last_change_status?, last_summary_text? |
| `Execution` | id, scout_id, status, change_status, criteria_matched, is_duplicate, summary_text, units_extracted |
| `InformationUnit` | id, statement, unit_type (fact/event/entity_update), entities[], location, topic, source_url, used_in_article |
| `Draft` | title, headline, sections[], gaps[], sources[], word_count |
| `TestResult` | scrape_result, criteria_analysis, would_notify, would_extract_units |

## Store APIs

### `scouts` (`stores/scouts.ts`)
`load()`, `get(id)`, `create(input)`, `update(id, input)`, `delete(id)`, `run(id, opts?)`, `test(id)`, `clearError()`
Derived: `scoutsCount`

### `units` (`stores/units.ts`)
`loadLocations()`, `load(city?, unusedOnly?, topic?)`, `search(query, city?, topic?)`, `setLocation(city)`, `setTopic(topic)`, `clearSearch()`, `markUsed(ids[])`, `clearError()`

### `executions` (`stores/executions.ts`)
`load(scoutId?, reset?)`, `loadMore(scoutId?)`, `getDetail(id)`, `clearError()`
Pagination: page size 20, `hasMore` flag.

### `auth` (`stores/auth.ts`)
Re-exports `@shared/stores/auth`. Functions: `initAuth()`, `login(userId)`, `logout()`, `getUserId()`, `getUser()`, `isAuthenticated()`
Mock auth via `localStorage` key `dev_user_id`.

## API Client (`lib/api.ts`)

All API calls go through `lib/api.ts`:

```typescript
// Pattern: Supabase URL + anon key Bearer + x-user-id header
const url = `${SUPABASE_URL}/functions/v1/${endpoint}`;
headers: {
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'x-user-id': userId,  // from auth store
}
// Response auto-unwraps { data: ... }
```

Type-safe helpers: `scoutsApi`, `unitsApi`, `composeApi`, `executionsApi`.

## Routing (`App.svelte`)

Hash-based routing (required for GitHub Pages + iframe embedding):

| Hash | Component | Params |
|------|-----------|--------|
| `#/dashboard` or `#/` | Dashboard | - |
| `#/scout/{id}` | ScoutDetail | `scoutId` |
| `#/history` | History | - |
| `#/compose` | Compose | - |

Auth gate: shows `Loading` while checking, `Login` if no user, `Layout > Route` if authenticated.

## Svelte 5 Patterns

```svelte
<script lang="ts">
  // Runes
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => console.log(count));

  // Props
  let { scoutId }: { scoutId: string } = $props();
</script>

<!-- Children via Snippet -->
{@render children()}
```

Stores use `writable`/`derived` from `svelte/store` (not runes). Subscribe in components with `$storeName`.

## Critical Architecture Notes

1. **Hash routing required** -- GitHub Pages SPA + iframe embedding. Do not switch to path-based routing.
2. **x-user-id header auth** -- Mock auth for dev. Edge Functions read `x-user-id` header, not JWT claims. `verify_jwt = false` on all functions.
3. **Firecrawl changeTracking tag** -- Format: `scout-{scoutId}`. Firecrawl tracks content per tag for diff detection.
4. **Test mode baseline isolation** -- Test runs use separate Firecrawl tags to avoid polluting production baselines.
5. **Unit extraction requires location or topic** -- Information units only extracted if scout has a location or topic set. Both are optional but at least one is required for scout creation.
6. **German-only UI** -- All user-facing text, error messages, and LLM prompts are in German.

## Environment Variables

### Frontend (`.env.local`)
- `VITE_SUPABASE_URL` -- Supabase project URL
- `VITE_SUPABASE_ANON_KEY` -- Supabase anon key

### Edge Function Secrets (Dashboard > Settings > Edge Functions)
- `OPENROUTER_API_KEY` -- LLM via OpenRouter (model: `openai/gpt-4o-mini`)
- `FIRECRAWL_API_KEY` -- Web scraping + change tracking
- `RESEND_API_KEY` -- Email notifications

### Vault Secrets (SQL `vault.create_secret`)
- `project_url` -- Supabase project URL (for pg_cron → pg_net calls)
- `service_role_key` -- Service role key (bypasses RLS for scheduled jobs)

## Documentation Index

| File | Content |
|------|---------|
| `specs/ARCHITECTURE.md` | System design, data flow, component diagrams |
| `specs/DATABASE.md` | Full schema, indexes, RLS policies, DB functions |
| `specs/API.md` | Edge Function endpoints, request/response formats |
| `specs/PIPELINES.md` | 9-step execution pipeline, scheduling, deduplication |
| `specs/FRONTEND.md` | Components, stores, routing, UI patterns |
| `specs/AUTH.md` | Mock auth flow, x-user-id, future JWT plan |
| `specs/DEPLOYMENT.md` | CI/CD, GitHub Pages, Supabase deployment |
| `docs/SETUP.md` | Step-by-step setup guide |
| `docs/MANUAL_SETUP.md` | Manual setup via Dashboard (no CLI) |
| `supabase/CLAUDE.md` | Backend-specific agent guide |

## Testing

`npm test` (single run) or `npm run test:watch`. Vitest 4.0.18, Node environment.

See `__tests__/CLAUDE.md` for the full test map, conventions, and instructions for adding tests.
