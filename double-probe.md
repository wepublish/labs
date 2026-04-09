# Double-Probe: Firecrawl Baseline Verification

## Problem

Firecrawl's changeTracking API lets you tag scrapes so future scrapes can detect content changes. But some URLs silently drop baselines — the API accepts the tag, stores a timestamp, but discards the actual content. Future change detection returns `changeStatus: "new"` every time instead of `"same"` or `"changed"`, making it useless.

There's no Firecrawl API to check whether a baseline was stored correctly. The only way to know is to scrape twice and inspect the second response.

## Solution: Double-Probe

Two sequential changeTracking calls with the same tag. The second call reveals whether the baseline is real.

### Flow

```
Call 1 (establish baseline)
  → Scrape URL with changeTracking tag
  → If fails: scrape error → surface to user, fall back to hash

  500ms delay (Firecrawl persistence window)

Call 2 (verify baseline)
  → Scrape same URL with same tag
  → If fails: call 2 timeout → fall back to hash, return call 1 content

  Inspect call 2 response:
  ┌─────────────────────┬──────────────────────┬──────────────────────┐
  │ previousScrapeAt    │ changeStatus         │ Verdict              │
  ├─────────────────────┼──────────────────────┼──────────────────────┤
  │ has timestamp       │ 'same' or 'changed'  │ ✅ VERIFIED          │
  │                     │                      │ Baseline has content │
  │                     │                      │ → use changeTracking │
  ├─────────────────────┼──────────────────────┼──────────────────────┤
  │ has timestamp       │ 'new' or null        │ ❌ EMPTY BASELINE    │
  │                     │                      │ Timestamp stored but │
  │                     │                      │ no content to compare│
  │                     │                      │ → fall back to hash  │
  ├─────────────────────┼──────────────────────┼──────────────────────┤
  │ null                │ (any)                │ ❌ BASELINE DROPPED  │
  │                     │                      │ Firecrawl discarded  │
  │                     │                      │ the baseline entirely│
  │                     │                      │ → fall back to hash  │
  └─────────────────────┴──────────────────────┴──────────────────────┘
```

### Key Insight

Before this hardening, the probe only checked `previousScrapeAt`. A non-null timestamp was treated as proof the baseline was usable. But Firecrawl can store a timestamp while discarding the content — a "ghost baseline."

The fix: also check `changeStatus`. If Firecrawl actually compared content against the baseline, it returns `"same"` (identical) or `"changed"` (different). If it returns `"new"` despite having a timestamp, the baseline has no content — change detection won't work.

### The Two Provider Modes

Based on the double-probe result, each URL is assigned a provider:

| Provider | Change Detection Method | When |
|----------|------------------------|------|
| `firecrawl` | Firecrawl changeTracking (diff-based) | Baseline verified with content |
| `firecrawl_plain` | SHA-256 content hash comparison | Baseline empty, dropped, or scrape failed |

The provider is stored on the scout record. Production runs use the stored provider — they don't re-probe.

### Hash Fallback (`firecrawl_plain`)

When changeTracking can't be trusted, the system computes a SHA-256 hash of the scraped content (with whitespace normalization) and stores it on the scout. On subsequent runs, it compares the new hash against the stored hash. Different hash = content changed.

```
Content → normalize whitespace → SHA-256 → compare with stored hash
```

This is less granular than changeTracking (no diff, just "changed" or "same") but works for any URL that can be scraped.

### Timeout Handling

Each Firecrawl call within the probe has a 30s timeout. For slow sites, the probe can take up to 60s+ (two sequential calls). If either call times out:

- The scrape result surfaces the timeout error to the user
- The user sees "Erneut testen" (retry) in the UI
- No provider or baseline is stored
- The user can retry when the site is more responsive

This is deliberate — a timeout is better than storing an unverified baseline.

### Real-World URL Behaviors

Tested against three URL categories:

| URL | Behavior | Provider |
|-----|----------|----------|
| nytimes.com | Blocked by bot protection, scrape fails | Error surfaced |
| neunkirch.ch | Slow Swiss municipal site, non-deterministic: sometimes succeeds with dropped baselines, sometimes times out | `firecrawl_plain` or graceful error |
| politico.com | Fast, baselines persist with content | `firecrawl` (verified) |

### Implementation Reference

- **Probe function**: `_shared/firecrawl.ts` → `doubleProbe()`
- **Timeout constant**: `_shared/constants.ts` → `DOUBLE_PROBE_TIMEOUT_MS` (30s)
- **Called from**: `scouts/index.ts` → `testScout()` (test/preview endpoint only)
- **Benchmark**: `_tests/integration/benchmark_web_test.ts`
