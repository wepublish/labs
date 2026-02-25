# Dorfkoenig Backend - Agent Guide

PostgreSQL + pgvector database with 5 Edge Functions (Deno runtime) and 6 shared modules. All functions have `verify_jwt = false` and authenticate via `x-user-id` header or service role key.

## Edge Functions

| Function | Purpose | Auth | Trigger |
|----------|---------|------|---------|
| `scouts` | CRUD for scout configurations. `listScouts()` enriches each scout with latest execution data (`last_execution_status`, `last_criteria_matched`, `last_change_status`, `last_summary_text`). | x-user-id header | Frontend API calls |
| `execute-scout` | 9-step execution pipeline | Service role (pg_cron) or x-user-id | pg_cron dispatch or manual run |
| `units` | List, search, mark-used for information units | x-user-id header | Frontend API calls |
| `compose` | Generate article drafts from selected units | x-user-id header | Frontend API calls |
| `executions` | List and get execution history | x-user-id header | Frontend API calls |

## Shared Modules (`functions/_shared/`)

| File | Purpose | External API |
|------|---------|-------------|
| `cors.ts` | CORS headers, `handleCors()`, `jsonResponse()`, `errorResponse()` | - |
| `supabase-client.ts` | `createAnonClient()`, `createServiceClient()`, `getUserId(req)`, `requireUserId(req)`, DB types | - |
| `openrouter.ts` | `chat()` (LLM), `generateEmbedding()`, `generateEmbeddings()`, `cosineSimilarity()` | OpenRouter API |
| `embeddings.ts` | Wrapper: `generate()`, `generateBatch()`, `similarity()`, `areSimilar()`, `findMostSimilar()`, `deduplicate()` | OpenRouter (via openrouter.ts) |
| `firecrawl.ts` | `scrape()` with change tracking, `getDomain()` | Firecrawl v2 API |
| `resend.ts` | `sendEmail()`, `buildScoutAlertEmail()` | Resend API |

## 9-Step Execution Pipeline (`execute-scout/index.ts`)

1. **Scrape** -- Firecrawl scrape with `changeTracking: { mode: 'git-diff', tag: 'scout-{scoutId}' }`
2. **Check changes** -- `determineChangeStatus()`: first_run / changed / same. Early exit if `same`.
3. **Analyze criteria** -- OpenRouter GPT-4o-mini: does content match scout's criteria? Returns `{ matches, summary, keyFindings }`. German prompts.
4. **Check duplicates** -- Generate embedding for summary, call `check_duplicate_execution()` DB function (threshold: 0.85, lookback: 30 days).
5. **Store execution** -- Update `scout_executions` row with results.
6. **Extract units** -- Only if `criteria_matched && (scout.location || scout.topic)`. OpenRouter extracts atomic facts. Embed each, deduplicate within batch (threshold: 0.75). Store in `information_units`.
7. **Send notification** -- Only if `matched && !duplicate && !skipNotification && notification_email`. Resend email with German template.
8. **Update scout** -- Set `last_run_at`, reset `consecutive_failures` to 0.
9. **Finalize** -- Set execution status to `completed`, return results.

On failure: set execution `status: 'failed'`, increment scout's `consecutive_failures`.

## Database Schema (`migrations/00000000000000_schema.sql`)

### Tables

**`scouts`** -- Web scout configurations
- PK: `id` (UUID), `user_id` (TEXT), `name`, `url`, `criteria`, `location` (JSONB), `frequency` (daily/weekly/monthly), `is_active`, `last_run_at`, `consecutive_failures`, `notification_email`

**`scout_executions`** -- Execution history with dedup embeddings
- PK: `id` (UUID), FK: `scout_id` → scouts (CASCADE), `user_id`, `status` (running/completed/failed), `change_status`, `criteria_matched`, `summary_text`, `summary_embedding` vector(1536), `is_duplicate`, `duplicate_similarity`, `notification_sent`, `units_extracted`, `scrape_duration_ms`

**`information_units`** -- Atomic facts for Compose panel
- PK: `id` (UUID), FK: `scout_id` → scouts (CASCADE), `execution_id` → scout_executions (CASCADE), `user_id`, `statement`, `unit_type` (fact/event/entity_update), `entities` TEXT[], `source_url`, `source_domain`, `location` (JSONB), `embedding` vector(1536) NOT NULL, `used_in_article`, `expires_at` (90 days default, extended 60 days on use)

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `check_duplicate_execution(scout_id, embedding, threshold, lookback_days)` | Cosine similarity dedup against recent executions |
| `search_units_semantic(user_id, embedding, location_city?, topic?, unused_only?, min_similarity?, limit?)` | Semantic search for Compose panel |
| `should_run_scout(frequency, last_run_at)` | Check if scout is due |
| `dispatch_due_scouts()` | pg_cron: find due scouts, dispatch via pg_net to execute-scout |
| `cleanup_expired_data()` | pg_cron: delete expired units, old executions, fix stuck runs |
| `update_updated_at()` | Trigger: auto-update `updated_at` on scouts |
| `extend_unit_ttl()` | Trigger: extend `expires_at` when `used_in_article` set to true |

### RLS Policies

All tables have RLS enabled. Policies check `x-user-id` header OR `service_role`:
- **scouts**: user CRUD on own rows
- **scout_executions**: user SELECT on own rows, service_role ALL
- **information_units**: user SELECT + UPDATE on own rows, service_role ALL

## Critical Architecture Notes

1. **`verify_jwt = false`** -- All Edge Functions. Auth is via `x-user-id` header (mock auth) or service role key. See `config.toml`.
2. **Service client for pipeline** -- `execute-scout` uses `createServiceClient()` (bypasses RLS) because it's triggered by pg_cron with service role key.
3. **Firecrawl tag format** -- `scout-{scoutId}`. Firecrawl tracks content per tag. Do not change format or existing baselines break.
4. **Embedding dimensions** -- 1536 (OpenAI `text-embedding-3-small` via OpenRouter). Schema enforces `vector(1536)`.
5. **pg_cron stagger** -- `dispatch_due_scouts()` calls `pg_sleep(10)` between dispatches to respect Firecrawl rate limits.
6. **CASCADE deletes** -- Deleting a scout cascades to executions and units.
7. **Dedup thresholds** -- Execution: 0.85, Unit within batch: 0.75, Semantic search minimum: 0.3.
8. **Max 3 consecutive failures** -- Scouts with 3+ failures are excluded from dispatch.
9. **Stuck execution timeout** -- 10 minutes. `cleanup_expired_data()` marks stuck runs as failed.

## CLI Commands

All Supabase CLI commands require `--workdir` flag from repo root:

```bash
# Link project
supabase link --project-ref <ref> --workdir ./src/dorfkoenig/supabase

# Push schema
supabase db push --workdir ./src/dorfkoenig/supabase

# Deploy all functions
supabase functions deploy --workdir ./src/dorfkoenig/supabase

# Deploy single function
supabase functions deploy scouts --workdir ./src/dorfkoenig/supabase

# View function logs
supabase functions logs execute-scout --workdir ./src/dorfkoenig/supabase
```

## MCP Deployment (No CLI)

Supabase CLI is not installed locally. Use the MCP `deploy_edge_function` tool to deploy Edge Functions. Import paths must use `./_shared/` (not `../_shared/`) when deploying via MCP, because the deploy tool places the entrypoint in a `source/` subdirectory. Include all shared module files with names like `_shared/cors.ts` so they become siblings to the entrypoint.

## Adding a New Edge Function

1. Create `functions/{name}/index.ts`
2. Import shared modules: `cors.ts`, `supabase-client.ts`, etc.
3. Use `handleCors(req)` at the top of `Deno.serve`
4. Use `requireUserId(req)` for user-facing functions
5. Use `createServiceClient()` only for internal/scheduled functions
6. Add `[functions.{name}]` section to `config.toml` with `verify_jwt = false`
7. Return responses via `jsonResponse()` / `errorResponse()`
8. Deploy: `supabase functions deploy {name} --workdir ./src/dorfkoenig/supabase`
