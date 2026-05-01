# Scout Scrape Resilience Specification

Status: implemented and deployed
Date: 2026-05-01
Owner: Dorfkoenig page-monitor pipeline

## Context

On 2026-05-01, two bz Basel scouts repeatedly failed during a forced catch-up run:

- `15aa6111` — Baselland, `https://www.bzbasel.ch/basel/baselland`
- `aa38e00f` — Arlesheim, `https://www.bzbasel.ch/gemeinde/arlesheim-4144`

Manual checks showed both URLs were live, returned HTTP `200`, and contained useful article listings. The failure was not a dead URL.

The failure reproduced once with Firecrawl using the exact production request shape:

```ts
formats: ['markdown', 'rawHtml', { type: 'changeTracking', tag: `scout-${scoutId}` }]
timeout: 60_000
```

For the Baselland page, that combined request timed out after 70s, while markdown-only and rawHtml-only requests succeeded quickly. Repeated combined requests later succeeded around 9s. Sequential production retries also succeeded:

- Baselland: completed, 9 units extracted, scrape duration 9749ms.
- Arlesheim: completed, 6 units extracted, scrape duration 9980ms.

This points to intermittent upstream scrape latency, likely amplified by concurrent same-domain requests.

## Goals

1. A transient Firecrawl timeout must not fail the whole scout when a usable fallback scrape can be obtained.
2. Listing-page scouts should still get subpage extraction when raw HTML is available.
3. If raw HTML is unavailable but markdown is available, the scout should continue with Phase A extraction and skip Phase B rather than fail.
4. Scheduled dispatch should avoid starting multiple same-host web scouts concurrently.
5. Execution records should show which scrape path was used, so future failures are diagnosable without ad hoc probing.

## Non-Goals

- Do not replace Firecrawl as the default scraper.
- Do not disable change tracking globally.
- Do not switch bz Basel scouts to `firecrawl_plain` solely because of this incident.
- Do not broaden unit deduplication behavior. Provenance hardening remains covered by `20260501020000_harden_canonical_unit_location_merge.sql`.

## Implemented Behavior

### 1. Resilient Primary Scrape

`execute-scout` replaces the single primary scrape call with a small orchestrator:

```ts
const scrapeResult = await scrapePrimaryPageResilient({
  url: scout.url,
  timeout: PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
  changeTrackingTag: useChangeTracking ? `scout-${scoutId}` : undefined,
});
```

The orchestrator should try these paths in order:

1. **Combined primary**
   - `formats: ['markdown', 'rawHtml']`
   - `changeTrackingTag` when provider is `firecrawl`
2. **Retry combined primary**
   - Only for timeout, network abort, 429, or 5xx.
   - Backoff: 2-5 seconds jittered.
3. **Split fallback**
   - First scrape markdown with change tracking.
   - Separately scrape rawHtml without change tracking.
4. **Markdown-only fallback**
   - If markdown succeeds and rawHtml fails, return success with `rawHtml: null`.
   - Mark `rawHtmlAvailable: false`.

Only fail the scout when no markdown content can be obtained.

### 2. Phase B Degradation

Phase B currently needs `rawHtml` to extract candidate links from listing pages. With markdown-only fallback:

- Phase A may still extract units from the listing markdown.
- Deterministic listing detection may still mark the page as a listing.
- Phase B must be skipped when `rawHtml` is missing.
- The execution should record a warning such as `phase_b_skipped_raw_html_unavailable`.

This is preferable to failing the run because the page still contributes content and keeps `last_run_at` healthy.

### 3. Same-Host Dispatch Throttling

`dispatch_due_scouts()` avoids dispatching a due web scout if another running web scout for the same URL host started recently.

Suggested rule:

```sql
NOT EXISTS (
  SELECT 1
  FROM scout_executions se
  JOIN scouts running_scout ON running_scout.id = se.scout_id
  WHERE se.status = 'running'
    AND se.started_at > now() - interval '10 minutes'
    AND running_scout.scout_type = 'web'
    AND lower(regexp_replace(regexp_replace(running_scout.url, '^https?://', ''), '/.*$', ''))
        = lower(regexp_replace(regexp_replace(candidate.url, '^https?://', ''), '/.*$', ''))
)
```

Prefer extracting host normalization into a SQL helper, for example:

```sql
CREATE OR REPLACE FUNCTION normalize_url_host(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(coalesce(p_url, '')), '^https?://(www\.)?', ''),
      '/.*$',
      ''
    ),
    ''
  );
$$;
```

Dispatch should still process other hosts normally. Same-host scouts can run on the next 15-minute tick.

### 4. Manual Catch-Up Runner Behavior

Manual catch-up tooling should group web scouts by host and run same-host scouts sequentially. A safe default is:

- Dispatch at most one active execution per normalized host.
- Wait for terminal status before dispatching the next scout for the same host.
- Keep different hosts concurrent only if the operator explicitly requests parallel catch-up.

### 5. Observability

Scrape diagnostics are stored on execution records:

```sql
ALTER TABLE scout_executions
  ADD COLUMN IF NOT EXISTS scrape_strategy text,
  ADD COLUMN IF NOT EXISTS scrape_attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scrape_warning text;
```

Expected `scrape_strategy` values:

- `combined`
- `combined_retry`
- `split`
- `markdown_only_fallback`

Expected warning examples:

- `combined_timeout`
- `raw_html_timeout`
- `phase_b_skipped_raw_html_unavailable`

## Implementation

- `scrapePrimaryPageResilient()` lives in `supabase/functions/_shared/firecrawl.ts`.
- `execute-scout/index.ts` records scrape diagnostics on every primary scrape path and appends `phase_b_skipped_raw_html_unavailable` when markdown is usable but raw HTML is absent.
- `20260501030000_scout_scrape_resilience.sql` adds diagnostic columns, `normalize_url_host(text)`, and same-host dispatch throttling.
- The migration and `execute-scout` function were deployed on 2026-05-01.

## Test Plan

### Unit Tests

- Combined scrape success returns `scrape_strategy = combined`.
- Combined timeout followed by retry success returns `combined_retry`.
- Combined timeout followed by split success returns `split`.
- Markdown success plus rawHtml timeout returns success with `markdown_only_fallback`.
- All markdown attempts fail returns failure with original scrape error.
- Phase B is skipped when `rawHtml` is null.

### Integration Smoke

Use the two bz Basel scouts:

- `https://www.bzbasel.ch/basel/baselland`
- `https://www.bzbasel.ch/gemeinde/arlesheim-4144`

Smoke requirements:

- Both complete when run sequentially.
- Forced extraction stores units.
- No debug units are attached.
- No mixed Münchenstein/Arlesheim/Baselland provenance suspects appear in new occurrence rows.

### Dispatch Verification

With two due scouts on the same host:

- First run of `dispatch_due_scouts()` dispatches only one same-host scout.
- A later run dispatches the second after the first is terminal or older than the running guard.
- Scouts on different hosts still dispatch in the same batch according to the existing limit.

## Acceptance Criteria

- A transient Firecrawl timeout on combined `markdown + rawHtml + changeTracking` no longer fails the scout if markdown can be retrieved.
- Same-host web scouts are not dispatched concurrently by cron.
- Successful fallback executions update `last_run_at` and reset `consecutive_failures`.
- Failed executions identify the failing phase and strategy in stored diagnostics.
- The bz Basel scouts can be run without special manual sequencing and should not repeatedly hit scrape timeouts.

## Operational Notes

- Keep provider `firecrawl` for bz Basel unless change tracking itself becomes consistently unreliable.
- If a domain continues to show instability, add a domain-specific policy only after measuring fallback rates.
- Review scrape diagnostics weekly during the first week after rollout.

## Deployment Smoke

After deployment, an async smoke run against the Baselland bz Basel scout completed with unit extraction disabled:

- execution `e705fd75`
- `status = completed`
- `criteria_matched = true`
- `units_extracted = 0`
- `scrape_duration_ms = 138063`
- `scrape_strategy = split`
- `scrape_attempts = 4`
- `scrape_warning = combined_timeout,combined_retry_timeout`

This confirmed the deployed fallback path recovered from repeated combined scrape timeouts by splitting markdown and raw HTML requests.

## Already Completed on 2026-05-01

The following hardening and resilience work was patched and deployed before this scrape-resilience spec was written:

- Deployed `20260501020000_harden_canonical_unit_location_merge.sql`, which prevents canonical unit merges across incompatible normalized `location.city` values when both sides have city context.
- Deployed `20260501021000_ensure_scout_dispatch_cron.sql`, which reschedules `dispatch-due-scouts` through `cron.unschedule` and `cron.schedule`.
- Added shared internal Edge Function auth in `_shared/internal-auth.ts`.
- Patched `execute-scout`, `execute-civic-scout`, `process-newspaper`, `bajour-auto-draft`, and `civic-notify-promises` to require an internal bearer token.
- Hardened `process-newspaper` so `job_id`, `user_id`, and `storage_path` must match the stored `newspaper_jobs` row before a signed storage URL is created.
- Hardened `bajour-auto-draft` to exclude debug/example units from draft candidate selection.
- Added `cleanup-debug-contamination.sql` as a review-first cleanup script for the two known debug canonical units; it intentionally ends in `ROLLBACK`.
- Ran a forced catch-up for all active eligible scouts after deploy. The initial catch-up completed 29/31 scouts and stored 132 units plus 14 merges; the two bz Basel scouts later completed when retried sequentially, storing 15 additional occurrence rows.
- Verified the catch-up and sequential retries did not attach new occurrences to the two debug units and did not produce Münchenstein/Arlesheim/Baselland mixed-location suspects.

- Deployed `20260501030000_scout_scrape_resilience.sql`, adding scrape diagnostics, `normalize_url_host(text)`, and same-host dispatch throttling.
- Deployed the updated `execute-scout` function with `scrapePrimaryPageResilient()`.
- Added unit tests for combined success, retry success, split fallback, markdown-only fallback, and markdown failure.

This spec now records the completed Firecrawl fallback behavior, same-host dispatch throttling, and scrape diagnostics.
