# Dorfkoenig Backend - Agent Guide

PostgreSQL + pgvector database with Edge Functions (Deno runtime) and 6 shared modules. All functions have `verify_jwt = false` and authenticate via `x-user-id` header or service role key.

> **Active overhaul:** `specs/DRAFT_QUALITY.md` is the source of truth for in-flight changes to `bajour-auto-draft`, `compose`, extraction prompts, and the `bajour_drafts` / `information_units` schemas. Any PR touching these must link the spec and bump prompt versions per §3.6. Deferred follow-ups in `specs/followups/`.

## Edge Functions

| Function | Purpose | Auth | Trigger |
|----------|---------|------|---------|
| `scouts` | CRUD for scout configurations. `listScouts()` enriches each scout with latest execution data (`last_execution_status`, `last_criteria_matched`, `last_change_status`, `last_summary_text`). | x-user-id header | Frontend API calls |
| `execute-scout` | 9-step execution pipeline | Service role (pg_cron) or x-user-id | pg_cron dispatch or manual run |
| `units` | List, search, mark-used for information units | x-user-id header | Frontend API calls |
| `compose` | Generate article drafts from selected units | x-user-id header | Frontend API calls |
| `executions` | List and get execution history | x-user-id header | Frontend API calls |
| `bajour-drafts` | CRUD for Bajour village newsletter drafts (GET list, POST create, PATCH update) | x-user-id header | Frontend API calls |
| `bajour-select-units` | AI-powered selection of relevant information units for a village | x-user-id header | Frontend API calls |
| `bajour-auto-draft` | Automated daily draft pipeline per village (select → compose → validate → save → verify). Compose routed through `_shared/compose-draft.ts`. Feature flags: `FEATURE_BULLET_SCHEMA`, `FEATURE_QUALITY_GATING`, `FEATURE_EMPTY_PATH_EMAIL`, `FEATURE_METRICS_CAPTURE`. Empty paths (no_units / all_below_quality_threshold / llm_under_produced) email `ADMIN_EMAILS` via `buildDraftFailureEmail`. | Service role (pg_cron) | pg_cron dispatch |
| `bajour-send-verification` | Send draft to village correspondents via WhatsApp for verification | x-user-id header | Frontend API calls |
| `bajour-whatsapp-webhook` | Receive WhatsApp quick-reply callbacks. Calls `append_bajour_response` RPC (any-reject-wins) and emails `ADMIN_EMAILS` on every `abgelehnt` with a signed deep-link. `FEATURE_FEEDBACK_CAPTURE=true` additionally harvests rejected bullets from `bullets_json`, sanitises each via `feedback-sanitise.ts`, and inserts them into `bajour_feedback_examples` (idempotent by `draft_id`). | None (webhook) | Meta WhatsApp API |
| `bajour-get-draft-admin` | Service-role read of a single draft, authorized by HMAC-signed URL (`ADMIN_LINK_SECRET`). Used by the admin deep-link in rejection emails. | Signed URL params | Frontend (admin email link) |
| `bajour-send-mailchimp` | Aggregate verified drafts into a Mailchimp campaign. Uses embedded template HTML (not `getContent` API). Replaces `text:\w+` placeholders with combined village content via regex. Sibling file `template.ts` holds the 23k template. | x-user-id header | Frontend API calls |
| `news` | Public GET endpoint returning confirmed drafts grouped by village within a date range. Auth via `?auth=` or `Authorization: Bearer` (`NEWS_API_TOKEN`). Params: `?date=YYYY-MM-DD&range=N` (default: today ±3 days). | Shared secret | WePublish overview page |
| `process-newspaper` | Async newspaper PDF extraction: Firecrawl parse → chunk → LLM extract → dedup → store units. Updates `newspaper_jobs` for Realtime progress. | Service role (manual-upload trigger) | manual-upload pdf_confirm |

## Shared Modules (`functions/_shared/`)

| File | Purpose | External API |
|------|---------|-------------|
| `cors.ts` | CORS headers, `handleCors()`, `jsonResponse()`, `errorResponse()` | - |
| `supabase-client.ts` | `createAnonClient()`, `createServiceClient()`, `getUserId(req)`, `requireUserId(req)`, DB types | - |
| `openrouter.ts` | `chat()` (LLM), `generateEmbedding()`, `generateEmbeddings()`, `cosineSimilarity()` | OpenRouter API |
| `embeddings.ts` | Wrapper: `generate()`, `generateBatch()`, `similarity()`, `areSimilar()`, `findMostSimilar()`, `deduplicate()` | OpenRouter (via openrouter.ts) |
| `firecrawl.ts` | `scrape()` with change tracking, `doubleProbe()` (provider detection), `computeContentHash()`, `getDomain()` | Firecrawl v2 API |
| `resend.ts` | `sendEmail()`, `buildScoutAlertEmail()`, `buildDraftFailureEmail()` (empty-path admin notifications) | Resend API |
| `prompts.ts` | `INFORMATION_SELECT_PROMPT`, `buildInformationSelectPrompt()`, `DRAFT_COMPOSE_PROMPT`, `DRAFT_COMPOSE_PROMPT_V2`, `buildDraftComposePromptV2()`, `formatUnitsForCompose()`, `DEFAULT_PROMPT_VERSIONS` | - |
| `zeitung-extraction-prompt.ts` | Newspaper extraction: ranking table, German system prompt, markdown chunking, junk filter. v2 (bumped 2026-04-23) adds `publicationDate`, `sensitivity`. | OpenRouter API |
| `web-extraction-prompt.ts` | Web scout extraction. v3 (bumped 2026-04-23) adds `publicationDate`, `sensitivity`, `articleUrl`, `isListingPage`; listing-page refusal rule. | OpenRouter API |
| `unit-extraction.ts` | Shared extract+insert path (execute-scout, execute-civic-scout). Computes `quality_score` via `quality-scoring.ts` on every insert. | - |
| `compose-draft.ts` | Pure `composeDraftFromUnits` (v1 markdown) + `composeDraftFromUnitsV2` (bullet schema, with post-validation chain). | OpenRouter API |
| `draft-quality.ts` | DRAFT_QUALITY.md §3 enforcement: emoji palette, forbidden-phrase banlist, anti-pattern table, `AGNOSTIC_POSITIVE_SEEDS`, `KIND_CAPS`, 4 validators (`validateUrlWhitelist`, `validateForbiddenPhrases`, `validateEmojiPalette`, `validateKindCounts`), `runValidatorChain`. | - |
| `quality-scoring.ts` | Deterministic 0–100 `computeQualityScore` + `explainQualityScore` (reasons re-computed on read). | - |
| `feedback-sanitise.ts` | `sanitiseBulletForFeedback` — 5-step sanitiser for captured rejections (length, code fences, HTML, instruction markers, non-Latin, URL allowlist). | - |

## 9-Step Execution Pipeline (`execute-scout/index.ts`)

1. **Scrape** -- Provider-aware: `firecrawl` scouts use changeTracking tag `scout-{scoutId}`, `firecrawl_plain` scouts scrape without changeTracking.
2. **Check changes** -- Provider-aware: `firecrawl` uses changeTracking `changeStatus`, `firecrawl_plain` uses hash comparison (`content_hash`). Early exit if `same`.
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
- PK: `id` (UUID), `user_id` (TEXT), `name`, `url`, `criteria`, `location` (JSONB), `frequency` (daily/weekly/monthly), `is_active`, `last_run_at`, `consecutive_failures`, `notification_email`, `provider` (TEXT, nullable: `firecrawl` | `firecrawl_plain`), `content_hash` (TEXT, nullable: SHA-256 for hash-based change detection)

**`scout_executions`** -- Execution history with dedup embeddings
- PK: `id` (UUID), FK: `scout_id` → scouts (CASCADE), `user_id`, `status` (running/completed/failed), `change_status`, `criteria_matched`, `summary_text`, `summary_embedding` vector(1536), `is_duplicate`, `duplicate_similarity`, `notification_sent`, `units_extracted`, `scrape_duration_ms`

**`information_units`** -- Atomic facts for Compose panel
- PK: `id` (UUID), FK: `scout_id` → scouts (CASCADE), `execution_id` → scout_executions (CASCADE), `user_id`, `statement`, `unit_type` (fact/event/entity_update), `entities` TEXT[], `source_url`, `source_domain`, `location` (JSONB), `embedding` vector(1536) NOT NULL, `used_in_article`, `expires_at` (90 days default, extended 60 days on use)
- **DRAFT_QUALITY.md §3.2–3.3 enrichments (added 2026-04-23):** `quality_score` (INT 0–100), `publication_date` (DATE), `sensitivity` (none|death|accident|crime|minor_safety), `is_listing_page` (BOOL), `article_url` (TEXT). Index `idx_units_village_quality_dates` supports the compound filter.

**`bajour_feedback_examples`** -- Rejected-bullet capture (DRAFT_QUALITY.md §3.7, added 2026-04-23)
- PK: `id` BIGINT IDENTITY, FK: `draft_id` → `bajour_drafts` (SET NULL), `village_id`, `kind` ('positive' | 'negative'), `bullet_text`, `editor_reason`, `source_unit_ids` UUID[], `edition_date` DATE, `created_at`.
- Capture-only in current scope; retrieval deferred (`specs/followups/self-learning-system.md`).
- RLS: service_role ALL; `authenticated` SELECT scoped to `bajour_pilot_villages_list`.

**`draft_quality_metrics`** -- Per-draft score snapshot (DRAFT_QUALITY.md §5.1, added 2026-04-23)
- PK: `id` BIGINT IDENTITY, FK: `draft_id` → `bajour_drafts` (CASCADE), `village_id`, `computed_at`, `metrics` JSONB, `aggregate_score` INT, `warnings` TEXT[], `schema_version` INT.
- Written inline at end of `bajour-auto-draft` and `compose` when `FEATURE_METRICS_CAPTURE=true`.
- Consumed by `weekly_quality_summary()` SQL function.
- RLS: service_role ALL; `authenticated` SELECT scoped to `bajour_pilot_villages_list`.

**`bajour_drafts`** -- (existing) gained `schema_version` (INT DEFAULT 1) and `bullets_json` (JSONB) on 2026-04-23. `schema_version=2` drafts render via `renderDraftV2ToMarkdown` and the `DraftContent.svelte` v2 branch.

**`user_prompts`** -- (existing) gained `based_on_version` (INT DEFAULT 1) on 2026-04-23 per DRAFT_QUALITY.md §3.6 — tracks which `DEFAULT_PROMPT_VERSIONS[*]` a per-user override derived from.

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `check_duplicate_execution(scout_id, embedding, threshold, lookback_days)` | Cosine similarity dedup against recent executions |
| `search_units_semantic(user_id, embedding, location_city?, topic?, unused_only?, min_similarity?, limit?)` | Semantic search for Compose panel |
| `should_run_scout(frequency, last_run_at)` | Check if scout is due |
| `dispatch_due_scouts()` | pg_cron: find due scouts, dispatch via pg_net to execute-scout |
| `cleanup_expired_data()` | pg_cron: delete expired units, old executions, fix stuck runs |
| `dispatch_auto_drafts()` | Core dispatcher: calls `bajour-auto-draft` edge function per village. Not called directly by cron — invoked by `dispatch_auto_drafts_tz_safe()` after timezone check. |
| `dispatch_auto_drafts_tz_safe()` | pg_cron wrapper: checks if current hour in Europe/Zurich is 18, then calls `dispatch_auto_drafts()`. Dual-scheduled at 16:00 and 17:00 UTC to cover both DST states. |
| `resolve_bajour_timeouts_tz_safe()` | pg_cron wrapper: checks if current hour in Europe/Zurich is 22, then calls `resolve_bajour_timeouts()`. Dual-scheduled at 20:00 and 21:00 UTC to cover both DST states. |
| `update_updated_at()` | Trigger: auto-update `updated_at` on scouts |
| `extend_unit_ttl()` | Trigger: extend `expires_at` when `used_in_article` set to true |
| `weekly_quality_summary()` | Advisory metrics per village over last 7d vs rolling 28d baseline. Returns `drafts_last_7d`, `drafts_last_28d`, `empty_drafts_last_7d`, `mean_score_7d/28d`, `stddev_score_28d`, `delta_sigma` (NULL when `drafts_last_28d < 10`), `top_warning`, `pilot_fixture_missing`. Alert threshold: `abs(delta_sigma) > 2 AND drafts_last_28d >= 10`. Run manually (e.g. weekly into Obsidian). |

### Active pg_cron Jobs (7 total)

| Job name | Schedule (UTC) | Purpose |
|----------|---------------|---------|
| `dispatch-due-scouts` | `*/15 * * * *` | Dispatch due scouts every 15 minutes |
| `cleanup-expired-data` | `0 3 * * *` | Delete expired units, old executions, fix stuck runs |
| `dispatch-auto-drafts-summer` | `0 16 * * *` | 18:00 CEST (Apr–Oct); `_tz_safe` wrapper guards against off-season execution |
| `dispatch-auto-drafts-winter` | `0 17 * * *` | 18:00 CET (Nov–Mar); `_tz_safe` wrapper guards against off-season execution |
| `resolve-timeouts-summer` | `0 20 * * *` | 22:00 CEST (Apr–Oct); `_tz_safe` wrapper guards against off-season execution |
| `resolve-timeouts-winter` | `0 21 * * *` | 22:00 CET (Nov–Mar); `_tz_safe` wrapper guards against off-season execution |
| *(implicit cleanup)* | — | Stuck execution timeout handled inside `cleanup_expired_data()` |

**Dual-schedule pattern:** The `_tz_safe()` wrappers check `EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Zurich')` before proceeding. Both UTC slots fire daily but only one matches the actual Zurich hour, so only one executes. This avoids the pg_cron 5-parameter timezone overload that is not available on this Supabase instance.

**`bajour_drafts`** -- Village newsletter drafts with verification workflow
- PK: `id` (UUID), `user_id` (TEXT), `village_id`, `village_name`, `title`, `body`, `selected_unit_ids` (UUID[]), `custom_system_prompt`, `publication_date` (DATE, default CURRENT_DATE), `verification_status` (ausstehend/bestätigt/abgelehnt), `verification_responses` (JSONB[]), `verification_sent_at`, `verification_resolved_at`, `verification_timeout_at`, `whatsapp_message_ids` (JSONB)

**`auto_draft_runs`** -- Audit log for automated daily draft pipeline per village
- PK: `id` (BIGINT IDENTITY), `village_id` (TEXT), `status` (TEXT, CHECK: pending/running/completed/failed/skipped), `error_message` (TEXT, nullable), `draft_id` (UUID, FK → bajour_drafts, nullable), `started_at` (TIMESTAMPTZ), `completed_at` (TIMESTAMPTZ, nullable)

**`bajour_correspondents`** -- Village correspondents for WhatsApp verification
- PK: `id` (UUID), `village_id` (TEXT), `name` (TEXT), `phone` (TEXT, without '+' prefix), `is_active` (BOOLEAN), `created_at`, `updated_at`
- Phone format: no '+' prefix (matches Meta webhook format). WhatsApp send prepends '+'.
- Unique constraint: (village_id, phone). Phone format check: `^[1-9][0-9]{6,14}$`
- Managed via Supabase table editor or SQL. No redeployment needed.

**`newspaper_jobs`** -- Async PDF processing status tracker with Realtime
- PK: `id` (UUID), `user_id` (TEXT), `storage_path` (TEXT), `publication_date` (DATE), `label` (TEXT), `status` (processing/completed/failed), `stage` (parsing_pdf/chunking/extracting/storing, nullable), `chunks_total`, `chunks_processed`, `units_created`, `skipped_items` (TEXT[]), `error_message`, `created_at`, `completed_at`
- RLS: user SELECT on own rows, service_role ALL
- Realtime enabled for live progress updates
- Stuck jobs (8+ min in `processing`) are marked `failed` by `cleanup_expired_data()`

### RLS Policies

All tables have RLS enabled. Policies check `x-user-id` header OR `service_role`:
- **scouts**: user CRUD on own rows
- **scout_executions**: user SELECT on own rows, service_role ALL
- **information_units**: user SELECT + UPDATE on own rows, service_role ALL
- **bajour_drafts**: user CRUD on own rows, service_role ALL
- **bajour_correspondents**: service_role ALL, authenticated users SELECT (active only)

## Critical Architecture Notes

1. **`verify_jwt = false`** -- All Edge Functions. Auth is via `x-user-id` header (mock auth) or service role key. See `config.toml`.
2. **Service client for pipeline** -- `execute-scout` uses `createServiceClient()` (bypasses RLS) because it's triggered by pg_cron with service role key.
3. **Firecrawl tag format** -- `scout-{scoutId}`. Firecrawl tracks content per tag. Do not change format or existing baselines break.
10. **Provider detection (double-probe)** -- `testScout()` runs `doubleProbe()` which makes 2 sequential Firecrawl calls to detect if a URL's changeTracking baselines persist. Result: `firecrawl` (baselines persist, use changeTracking) or `firecrawl_plain` (baselines dropped, use hash comparison). Stored on the scout as `provider` + `content_hash`. Legacy scouts with `provider=null` default to `firecrawl` behavior.
4. **Embedding dimensions** -- 1536 (OpenAI `text-embedding-3-small` via OpenRouter). Schema enforces `vector(1536)`.
5. **pg_cron stagger (jittered)** -- `dispatch_due_scouts()` uses `pg_sleep(10 + RANDOM()*5)` for web scouts, `pg_sleep(20 + RANDOM()*10)` for civic. Jitter breaks cross-user synchronisation at the 15-min tick boundary so Firecrawl/OpenRouter rate limits don't cascade.
6. **CASCADE deletes** -- Deleting a scout cascades to executions and units.
7. **Dedup thresholds** -- Execution: 0.85, Unit within batch: 0.75, Semantic search minimum: 0.3.
8. **Max 3 consecutive failures** -- Scouts with 3+ failures are excluded from dispatch.
9. **Stuck execution timeout** -- 10 minutes. `cleanup_expired_data()` marks stuck runs as failed.
11. **JSONB `.contains()` gotcha** -- `bajour_drafts.whatsapp_message_ids` is JSONB (not TEXT[]). supabase-js `.contains(col, [val])` generates the PostgREST filter `cs.{val}` (PG array literal), which **silently returns zero rows** on JSONB columns -- no error, just an empty result set. The fix: `.contains(col, JSON.stringify([val]))` generates `cs.["val"]` (correct JSON literal for JSONB containment via the `@>` operator). This applies to any JSONB array column queried with `.contains()`.
12. **Fire-PDF `fast` mode is mandatory** for PDF ingest (`process-newspaper`, `execute-civic-scout`). Default `auto` and `ocr` mis-classify InDesign-export newspapers and hallucinate via the vision model (wrong dates, garbled titles, looped phrases). `fast` gives 10× more section markers + zero hallucinations on embedded-text PDFs. Reproduce: `scripts/benchmark-pdf-parse-modes.sh`. Full rationale: `specs/PIPELINES.md § Fire-PDF mode decision`.

## CLI Commands

All Supabase CLI commands require `--workdir` flag from repo root. The `--workdir` points to the directory that **contains** the `supabase/` subdirectory (i.e. `./src/dorfkoenig`, NOT `./src/dorfkoenig/supabase`):

```bash
# Link project
supabase link --project-ref <ref> --workdir ./src/dorfkoenig

# Push schema
supabase db push --workdir ./src/dorfkoenig

# Deploy all functions
supabase functions deploy --workdir ./src/dorfkoenig

# Deploy single function (--no-verify-jwt matches config.toml)
supabase functions deploy scouts --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb --workdir ./src/dorfkoenig
```

## Adding a New Edge Function

1. Create `functions/{name}/index.ts`
2. Import shared modules: `cors.ts`, `supabase-client.ts`, etc.
3. Use `handleCors(req)` at the top of `Deno.serve`
4. Use `requireUserId(req)` for user-facing functions
5. Use `createServiceClient()` only for internal/scheduled functions
6. Add `[functions.{name}]` section to `config.toml` with `verify_jwt = false`
7. Return responses via `jsonResponse()` / `errorResponse()`
8. Deploy: `supabase functions deploy {name} --no-verify-jwt --project-ref ayksajwtwyjhvpqngvcb --workdir ./src/dorfkoenig`
