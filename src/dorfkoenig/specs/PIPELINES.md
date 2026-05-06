# Dorfkoenig Pipeline Specification

## Overview

The execute-scout pipeline is the core of Dorfkoenig. It performs web scraping, change detection, criteria analysis, deduplication, information extraction, and notification delivery.

> **DRAFT_QUALITY overhaul shipped 2026-04-23; withheld gate added 2026-05-05** (see `specs/DRAFT_QUALITY.md`). The `bajour-auto-draft` pipeline gained: compound date filter + quality gate (§3.2), v2 bullet-only schema (§3.1), deterministic post-validation chain (§3.5), empty-path admin notifications (§3.1.4), inline metric capture (§5.1), and a post-compose withheld flow for generated-but-weak drafts. Extraction paths (Step 6 below, plus `manual-upload` and `process-newspaper`) gained `publication_date`, `sensitivity`, `is_listing_page`, `article_url` + `quality_score`. All gated by `FEATURE_*` env vars where noted. Feature-flag reference in `specs/DATABASE.md § DRAFT_QUALITY overhaul`.

## Execute Scout Pipeline (9 Steps + Phase B)

> **Phase B listing-subpage follow** was added 2026-04-23 as Step 6b. Fires only when Phase A's LLM extraction returns `isListingPage: true` (the web-extraction prompt's "LISTENSEITEN-VERWEIGERUNG" refusal rule). Otherwise the pipeline runs exactly the prior 9 steps. See §Step 6b below and `specs/SUBPAGE_FOLLOW.md` for details.


```
┌─────────────────────────────────────────────────────────────┐
│                     Execute Scout Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. SCRAPE ──► 2. CHECK CHANGES ──► 3. ANALYZE CRITERIA     │
│                      │                       │               │
│                      │ (same)                │               │
│                      ▼                       ▼               │
│                 [EARLY EXIT]          4. CHECK DUPLICATES    │
│                                              │               │
│                                              │ (duplicate)   │
│                                              ▼               │
│                                         [SKIP NOTIFY]        │
│                                              │               │
│                                              ▼               │
│  5. STORE EXECUTION ◄────────────────────────┘               │
│         │                                                    │
│         ▼                                                    │
│  6. EXTRACT UNITS (if location or topic provided)            │
│         │                                                    │
│         ▼                                                    │
│  7. SEND NOTIFICATION (if not duplicate)                     │
│         │                                                    │
│         ▼                                                    │
│  8. UPDATE SCOUT                                             │
│         │                                                    │
│         ▼                                                    │
│  9. RETURN RESULTS                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Scrape

Fetch URL content using Firecrawl. Provider-aware: `firecrawl` scouts use changeTracking with tag `scout-{scoutId}`, `firecrawl_plain` scouts scrape without changeTracking and rely on hash-based change detection.

### Provider Detection (Double-Probe)

On first test (`POST /scouts/:id/test`), the pipeline runs a **double-probe**: two sequential Firecrawl calls with the same changeTracking tag. If the second call reports `previousScrapeAt`, baselines are persisted and the scout gets `provider: 'firecrawl'`. Otherwise, baselines are dropped and the scout gets `provider: 'firecrawl_plain'` with a SHA-256 `content_hash` for hash-based change detection.

### Hash-Based Change Detection

For `firecrawl_plain` scouts, content changes are detected by comparing SHA-256 hashes of whitespace-normalized markdown. The `computeContentHash()` function normalizes runs of whitespace to single space and trims before hashing, preventing false "changed" detections from Firecrawl's non-deterministic trailing whitespace.

### Implementation

```typescript
// execute-scout/scrape.ts
import { firecrawl } from '../_shared/firecrawl.ts';

interface ScrapeResult {
  success: boolean;
  content: string;
  title: string;
  changeStatus: 'changed' | 'same' | 'first_run' | 'error';
  metadata: {
    wordCount: number;
    links: number;
    scrapeDurationMs: number;
  };
  error?: string;
}

export async function scrapeUrl(
  url: string,
  scoutId: string,
  isPreview: boolean = false
): Promise<ScrapeResult> {
  const startTime = Date.now();

  try {
    const response = await firecrawl.scrape({
      url,
      formats: ['markdown'],
      // Per-scout baseline for change tracking
      changeTracking: isPreview ? undefined : {
        mode: 'git-diff',
        tag: `scout-${scoutId}`,
      },
      timeout: 30000,
    });

    if (!response.success) {
      return {
        success: false,
        content: '',
        title: '',
        changeStatus: 'error',
        metadata: { wordCount: 0, links: 0, scrapeDurationMs: Date.now() - startTime },
        error: response.error || 'Scraping failed',
      };
    }

    // Determine change status
    let changeStatus: ScrapeResult['changeStatus'] = 'changed';
    if (response.changeTracking) {
      if (response.changeTracking.isFirstScrape) {
        changeStatus = 'first_run';
      } else if (!response.changeTracking.hasChanged) {
        changeStatus = 'same';
      }
    }

    return {
      success: true,
      content: response.markdown || '',
      title: response.metadata?.title || '',
      changeStatus,
      metadata: {
        wordCount: (response.markdown || '').split(/\s+/).length,
        links: (response.markdown?.match(/\[.*?\]\(.*?\)/g) || []).length,
        scrapeDurationMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      title: '',
      changeStatus: 'error',
      metadata: { wordCount: 0, links: 0, scrapeDurationMs: Date.now() - startTime },
      error: error.message,
    };
  }
}
```

### Firecrawl Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `formats` | `['markdown']` | Clean text for LLM analysis |
| `changeTracking.mode` | `'git-diff'` | Track content changes |
| `changeTracking.tag` | `scout-{id}` | Per-scout baseline |
| `timeout` | `30000` | 30s max scrape time |

---

## Step 2: Check Changes

Early exit if content unchanged.

```typescript
// execute-scout/index.ts
if (scrapeResult.changeStatus === 'same') {
  // Update execution record with early exit
  await supabase
    .from('scout_executions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      change_status: 'same',
      criteria_matched: false,
    })
    .eq('id', executionId);

  return {
    status: 'completed',
    change_status: 'same',
    criteria_matched: false,
    is_duplicate: false,
    notification_sent: false,
    message: 'Keine Änderungen seit dem letzten Scan',
  };
}
```

---

## Step 3: Analyze Criteria

Use LLM to determine if content matches user-defined criteria.

### Implementation

```typescript
// execute-scout/analyze.ts
import { openrouter } from '../_shared/openrouter.ts';

interface AnalysisResult {
  matches: boolean;
  summary: string;        // German, max 150 chars
  keyFindings: string[];  // 1-5 bullet points
  confidence: number;     // 0-1
}

export async function analyzeCriteria(
  content: string,
  criteria: string,
  recentFindings: string[] = []
): Promise<AnalysisResult> {
  const systemPrompt = `Du bist ein Nachrichtenanalyst. Analysiere den Inhalt und prüfe, ob er den angegebenen Kriterien entspricht.

REGELN:
- Antworte NUR auf Deutsch
- Sei präzise und objektiv
- Berücksichtige die bisherigen Erkenntnisse, um Duplikate zu vermeiden
- Die Zusammenfassung darf maximal 150 Zeichen haben
- Extrahiere 1-5 Kernpunkte

AUSGABEFORMAT (JSON):
{
  "matches": boolean,
  "summary": "Kurze Zusammenfassung (max 150 Zeichen)",
  "keyFindings": ["Punkt 1", "Punkt 2"],
  "confidence": 0.0-1.0
}`;

  const userPrompt = `KRITERIEN:
${criteria}

BISHERIGE ERKENNTNISSE (zum Vergleich):
${recentFindings.length > 0 ? recentFindings.join('\n') : 'Keine'}

AKTUELLER INHALT:
${content.slice(0, 8000)}

Analysiere den Inhalt und antworte im JSON-Format.`;

  const response = await openrouter.chat({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  try {
    const result = JSON.parse(response.choices[0].message.content);
    return {
      matches: result.matches ?? false,
      summary: (result.summary || '').slice(0, 150),
      keyFindings: result.keyFindings || [],
      confidence: result.confidence ?? 0.5,
    };
  } catch {
    return {
      matches: false,
      summary: 'Analyse fehlgeschlagen',
      keyFindings: [],
      confidence: 0,
    };
  }
}
```

### Context Injection

Recent findings from previous executions are injected to:
1. Avoid reporting the same information twice
2. Focus on genuinely new developments
3. Improve deduplication accuracy

```typescript
// Fetch recent findings for context
const { data: recentExecutions } = await supabase
  .from('scout_executions')
  .select('summary_text')
  .eq('scout_id', scoutId)
  .eq('status', 'completed')
  .not('summary_text', 'is', null)
  .order('created_at', { ascending: false })
  .limit(5);

const recentFindings = recentExecutions?.map(e => e.summary_text) || [];
```

---

## Step 4: Check Duplicates

Use embedding similarity to detect duplicate findings.

### Implementation

```typescript
// execute-scout/dedup.ts
import { embeddings } from '../_shared/embeddings.ts';

interface DedupResult {
  isDuplicate: boolean;
  maxSimilarity: number;
  similarExecutionId: string | null;
}

export async function checkDuplicate(
  summary: string,
  scoutId: string,
  threshold: number = 0.85
): Promise<DedupResult> {
  // Generate embedding for new summary
  const embedding = await embeddings.generate(summary);

  // Check against recent executions using pgvector
  const { data } = await supabase.rpc('check_duplicate_execution', {
    p_scout_id: scoutId,
    p_embedding: embedding,
    p_threshold: threshold,
    p_lookback_days: 30,
  });

  if (!data || data.length === 0) {
    return {
      isDuplicate: false,
      maxSimilarity: 0,
      similarExecutionId: null,
    };
  }

  return {
    isDuplicate: data[0].is_duplicate,
    maxSimilarity: data[0].max_similarity,
    similarExecutionId: data[0].similar_execution_id,
  };
}
```

### Threshold Configuration

| Threshold | Use Case |
|-----------|----------|
| `0.85` | Execution-summary deduplication in `check_duplicate_execution()` |
| `0.93` cosine + `0.70` text | In-batch unit deduplication for extracted facts |
| `0.96` cosine + `0.70` text | High-confidence canonical semantic merge |
| `0.88` cosine + `0.82` text + context | Lower-cosine canonical merge only with strong text and contextual support |

---

## Step 5: Store Execution

Save execution record with embedding for future deduplication.

```typescript
// execute-scout/index.ts
const embedding = await embeddings.generate(analysis.summary);

const { error } = await supabase
  .from('scout_executions')
  .update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    change_status: scrapeResult.changeStatus,
    criteria_matched: analysis.matches,
    summary_text: analysis.summary,
    summary_embedding: embedding,
    is_duplicate: dedupResult.isDuplicate,
    duplicate_similarity: dedupResult.maxSimilarity,
    scrape_duration_ms: scrapeResult.metadata.scrapeDurationMs,
  })
  .eq('id', executionId);
```

---

## Step 6: Extract Units

Extract atomic information units if location or topic is provided.

### Implementation

```typescript
// execute-scout/extract.ts
import { openrouter } from '../_shared/openrouter.ts';
import { embeddings } from '../_shared/embeddings.ts';

interface InformationUnit {
  statement: string;
  unitType: 'fact' | 'event' | 'entity_update';
  entities: string[];
}

export async function extractUnits(
  content: string,
  sourceUrl: string,
  sourceTitle: string,
  location: object | null,
  topic: string | null
): Promise<InformationUnit[]> {
  if (!location && !topic) return [];

  const systemPrompt = `Du bist ein Faktenfinder. Extrahiere atomare Informationseinheiten aus dem Text.

REGELN:
- Jede Einheit ist ein vollständiger, eigenständiger Satz
- Enthalte WER, WAS, WANN, WO (wenn verfügbar)
- Maximal 8 Einheiten pro Text
- Nur überprüfbare Fakten, keine Meinungen
- Antworte auf Deutsch

EINHEITSTYPEN:
- fact: Überprüfbare Tatsache
- event: Angekündigtes oder stattfindendes Ereignis
- entity_update: Änderung bei einer Person/Organisation

AUSGABEFORMAT (JSON):
{
  "units": [
    {
      "statement": "Vollständiger Satz",
      "unitType": "fact|event|entity_update",
      "entities": ["Entity1", "Entity2"]
    }
  ]
}`;

  const userPrompt = `TEXT:
${content.slice(0, 6000)}

Extrahiere die wichtigsten Informationseinheiten.`;

  const response = await openrouter.chat({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  try {
    const result = JSON.parse(response.choices[0].message.content);
    return result.units || [];
  } catch {
    return [];
  }
}
```

### Unit Storage with Deduplication

Within-run deduplication uses two independent signals so unrelated short facts
do not collapse just because their embeddings are close:

- cosine similarity must be `>= 0.93`
- trigram/text similarity must also be `>= 0.70`

Canonical storage then routes each surviving unit through
`upsert_canonical_unit(...)`, which first handles exact statement/source/content
hash matches, then permits semantic canonical merges only when embedding and text
similarity both agree. Context such as same domain, nearby event date, or shared
entities can support a semantic merge, but cannot replace text similarity.

```typescript
const unitEmbeddings = await embeddings.generateBatch(units.map((u) => u.statement));
const uniqueIndices = embeddings.deduplicateSimilarStatements(
  units.map((u) => u.statement),
  unitEmbeddings,
  UNIT_DEDUP_STRONG_COSINE_THRESHOLD, // 0.93
  UNIT_DEDUP_TEXT_THRESHOLD,          // 0.70
);

for (const i of uniqueIndices) {
  await upsertCanonicalUnit(supabase, {
    statement: units[i].statement,
    embedding: unitEmbeddings[i],
    sourceType: 'scout',
    // scout/user/source/location metadata omitted
  });
}
```

---

## Step 6b: Phase B — Subpage-Follow (Listing Pages)

When the web-extraction LLM detects the index URL is a listing/overview page, it refuses extraction and returns `{ units: [], isListingPage: true, skipped: ['listing_page'] }`. Phase B then fetches each linked article individually.

Gate: `extractUnits && analysis.matches && hasScope && isListingPage && rawHtml`. Otherwise skipped silently.

### Algorithm

```text
1. links        ← extractLinksFromHtml(rawHtml, scout.url)   # host-lock + denylist
2. candidates   ← filterSubpageUrls(links, scout.url)         # path-prefix + traversal + domain
3. seen         ← SELECT DISTINCT source_url
                  FROM unit_occurrences
                  WHERE scout_id = $1 AND source_url IS NOT NULL
4. fresh        ← (candidates − seen)[0 : CAP]                 # CAP = 10
5. for url in fresh (sequential, firecrawlDelay between each):
     md ← firecrawl.scrape(url, formats:[markdown])
     result ← extractInformationUnits(md, { sourceUrl: url, ... })
     if result.isListingPage: skip             # single-hop, no recursion
     else: result.insertedCount adds to unitsExtracted
6. console.log "Phase B: processed N/M subpages (K units, F failed)"
```

### Why no new column

Seen-URL set derives from existing `unit_occurrences.source_url`, because
canonical rows may merge across scouts and sources. TTL on canonical units still
bounds old content naturally. Tradeoff: a subpage that produces zero units leaves
no occurrence row → re-scraped next run. Acceptable for current use case.

### Why single-hop

Preserves bounded cost + avoids runaway recursion on pathological sites. A subpage that re-triggers `isListingPage: true` is almost always a mis-classification or a section index; we skip rather than expand.

### Cost

Worst case per run: 1 index scrape + 10 subpage scrapes = 11 Firecrawl credits, ~15–25s wall time. Typical steady-state after initial seed: 0–2 subpages per run as only brand-new articles remain unseen.

### Files

- `supabase/functions/execute-scout/index.ts` — wiring
- `supabase/functions/_shared/subpage-filter.ts` — `filterSubpageUrls` (tested)
- `supabase/functions/_shared/civic-utils.ts` — reused `extractLinksFromHtml`, `validateDomain`, `firecrawlDelay`
- `scripts/benchmark-subpage-follow.ts` — end-to-end benchmark (`npm run benchmark:subpages`)
- `specs/SUBPAGE_FOLLOW.md` — portable spec for porting the mechanism to sibling projects

---

## Step 7: Send Notification

Send email notification via Resend if not a duplicate.

### Implementation

```typescript
// execute-scout/notify.ts
import { resend } from '../_shared/resend.ts';

interface NotificationParams {
  email: string;
  scoutName: string;
  summary: string;
  keyFindings: string[];
  sourceUrl: string;
  location?: { city: string };
}

export async function sendNotification(
  params: NotificationParams
): Promise<{ success: boolean; error?: string }> {
  const { email, scoutName, summary, keyFindings, sourceUrl, location } = params;

  const locationLabel = location?.city ? ` (${location.city})` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 24px; border-radius: 8px 8px 0 0; }
    .content { padding: 24px; background: #f9fafb; }
    .summary { font-size: 18px; margin-bottom: 16px; }
    .findings { background: white; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .findings li { margin-bottom: 8px; }
    .cta { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; }
    .footer { padding: 16px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Scout-Alarm: ${scoutName}${locationLabel}</h1>
  </div>
  <div class="content">
    <p class="summary">${summary}</p>
    ${keyFindings.length > 0 ? `
    <div class="findings">
      <h3>Kernpunkte:</h3>
      <ul>
        ${keyFindings.map(f => `<li>${f}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    <a href="${sourceUrl}" class="cta">Quelle ansehen</a>
  </div>
  <div class="footer">
    <p>Diese E-Mail wurde automatisch von Dorfkoenig gesendet.</p>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'Dorfkoenig <noreply@resend.dev>',
      to: email,
      subject: `Scout-Alarm: ${scoutName}${locationLabel}`,
      html,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Notification Logic

```typescript
// Only notify if:
// 1. Criteria matched
// 2. Not a duplicate
// 3. Not skipped by caller
// 4. Email is configured

if (
  analysis.matches &&
  !dedupResult.isDuplicate &&
  !skipNotification &&
  scout.notification_email
) {
  const notifyResult = await sendNotification({
    email: scout.notification_email,
    scoutName: scout.name,
    summary: analysis.summary,
    keyFindings: analysis.keyFindings,
    sourceUrl: scout.url,
    location: scout.location,
  });

  notificationSent = notifyResult.success;
  notificationError = notifyResult.error;
}
```

---

## Step 8: Update Scout

Update scout metadata after execution.

```typescript
// Reset consecutive failures on success
await supabase
  .from('scouts')
  .update({
    last_run_at: new Date().toISOString(),
    consecutive_failures: 0,
  })
  .eq('id', scoutId);
```

### Error Handling

```typescript
// On execution failure, increment consecutive_failures
await supabase
  .from('scouts')
  .update({
    consecutive_failures: scout.consecutive_failures + 1,
  })
  .eq('id', scoutId);

// Scout is auto-disabled when consecutive_failures >= 3
// (enforced by dispatch_due_scouts query filter)
```

---

## Step 9: Return Results

Return execution summary to caller.

```typescript
return {
  execution_id: executionId,
  status: 'completed',
  change_status: scrapeResult.changeStatus,
  criteria_matched: analysis.matches,
  is_duplicate: dedupResult.isDuplicate,
  notification_sent: notificationSent,
  units_extracted: unitsCount,
  duration_ms: Date.now() - startTime,
  summary: analysis.summary,
};
```

---

## Preview Mode (Test)

Preview mode runs the pipeline without side effects:

| Step | Normal Mode | Preview Mode |
|------|-------------|--------------|
| Scrape | With changeTracking | Without baseline |
| Store Execution | Yes | No |
| Extract Units | Yes | No |
| Send Notification | Yes | No |
| Update Scout | Yes | No |

```typescript
export async function testScout(scoutId: string): Promise<PreviewResult> {
  const scout = await getScout(scoutId);

  // Scrape without change tracking
  const scrapeResult = await scrapeUrl(scout.url, scoutId, true);

  // Analyze criteria
  const analysis = await analyzeCriteria(
    scrapeResult.content,
    scout.criteria,
    [] // No recent findings for preview
  );

  return {
    scrape_result: {
      title: scrapeResult.title,
      content_preview: scrapeResult.content.slice(0, 500),
      word_count: scrapeResult.metadata.wordCount,
    },
    criteria_analysis: {
      matches: analysis.matches,
      summary: analysis.summary,
      key_findings: analysis.keyFindings,
    },
    would_notify: analysis.matches && !!scout.notification_email,
    would_extract_units: !!(scout.location || scout.topic),
  };
}
```

---

## Error Recovery

### Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// Usage
const scrapeResult = await withRetry(() => scrapeUrl(url, scoutId));
```

### Graceful Degradation

If a non-critical step fails, continue with the pipeline:

```typescript
// Unit extraction failure shouldn't fail the entire execution
let unitsCount = 0;
if (extractUnits && (scout.location || scout.topic)) {
  try {
    const units = await extractUnits(scrapeResult.content, ...);
    unitsCount = await storeUnits(units, ...);
  } catch (error) {
    console.error('Unit extraction failed:', error);
    // Continue without units
  }
}
```

---

## Performance Considerations

### Timeouts

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| Firecrawl scrape | 30s | Complex pages may be slow |
| OpenRouter analysis | 60s | LLM response time |
| Embedding generation | 10s | Fast operation |
| Email send | 10s | Network latency |
| Total execution | 120s | Sum of operations |

### Concurrency

- Sequential pipeline steps (dependencies)
- Parallel embedding + notification (independent)
- Staggered dispatch (10s between scouts)

---

## Auto-Draft Pipeline

Daily at 17:00 Europe/Zurich:
1. pg_cron → dispatch_auto_drafts() → loops pilot villages
2. Per village: bajour-auto-draft edge function
   a. Resolve run date and reader-facing publication date
   b. Idempotency check (village + publication date)
   c. Select units (`INFORMATION_SELECT_PROMPT` + 48h publication-date news window + editable deterministic ranking from `user_settings.selection_ranking` + deterministic fallback)
   d. Generate draft (v2 bullet schema when enabled)
   e. Run validators and `_shared/auto-draft-quality.ts` gate
   f. Save to bajour_drafts, including `selection_diagnostics` with selected and rejected ranking details
   g. If clean: mark units used and send WhatsApp verification
   h. If weak: save as `verification_status='withheld'`, persist `quality_warnings`, email admins with Resend, and do not send WhatsApp
   i. Log to auto_draft_runs, including a compact selection snapshot for fallback/debugging

Daily at 22:00 Europe/Zurich:
3. pg_cron → resolve_bajour_timeouts() — auto-rejects unresponded drafts (silence = rejection, any-reject-wins policy)

Daily at 22:00:
4. CMS queries news endpoint → returns confirmed drafts by village

---

## Newspaper PDF Processing Pipeline

Triggered by `manual-upload` (pdf_confirm) → `process-newspaper` edge function.

### 10-Step Pipeline

1. **Get signed URL** — Generate signed download URL for PDF in Supabase Storage
2. **Firecrawl parse** — `/v2/scrape` with `formats: ['markdown']`, `parsers: [{ type: 'pdf', mode: 'fast' }]`, timeout 120s. **`fast` mode is mandatory** — see the Fire-PDF mode decision below.
3. **Preprocess** — Collapse whitespace, remove page headers/footers, strip OCR artifacts
4. **Chunk** — Boundary-aware splitting on markdown headings, ALL CAPS section headers, horizontal rules (~15K target per chunk)
5. **Pre-filter** — Skip chunks where >40% of lines contain ad/puzzle signals (CHF, Tel., www., Sudoku, etc.)
6. **LLM extraction** — GPT-4o-mini via OpenRouter with `zeitung-extraction-prompt.ts` prompt. Concurrency limit of 3-4. Each chunk returns `{ units[], skipped[] }`.
7. **Review sanitize + stage** — Normalize extracted units before they touch `newspaper_jobs.extracted_units`: drop malformed rows, coerce invalid `unit_type` values to `'fact'`, turn stringified null confidences back into SQL-null-compatible `null`, and discard invalid entity/location payloads. Store the surviving units on the job row with `status: 'review_pending'`.
8. **Editor review** — The UI renders the staged units, lets the editor choose which ones to keep, and posts the selected `uid`s back to `manual-upload` (`pdf_finalize`).
9. **Finalize insert** — `pdf_finalize` sanitizes the selected staged units again, then runs dual-signal in-batch dedup and routes the valid survivors through `upsert_canonical_unit(...)` with `source_type: 'manual_pdf'`, `topic: 'Wochenblatt'`, PDF provenance on `unit_occurrences`, and the upload's newspaper `source_url` as both `source_url` and `article_url`.
10. **Update job / error handling** — On success set `newspaper_jobs.status = 'completed'` with `units_created` for new canonical rows and `units_merged` for in-batch duplicates plus occurrences merged into existing canonical rows. The API also returns `units_saved = units_created + canonical-merge occurrences`. Per-chunk extraction errors remain non-fatal, while fatal finalize/extraction errors set `status: 'failed'`.

### Fire-PDF mode decision (2026-04-15)

We force `parsers: [{ type: 'pdf', mode: 'fast' }]` in both `process-newspaper` and `execute-civic-scout`. Rationale from the benchmark:

| Mode | Chars | Section markers | Dates | OCR hallucinations |
|---|---|---|---|---|
| `fast` | **144 063** | **41** | **35** | **0** |
| `ocr` | 92 559 | 4 | 5 | 6 |
| `auto` (default) | 92 559 | 4 | 5 | 6 |

`auto` and `ocr` were byte-identical (same md5) — Fire-PDF's classifier incorrectly flags InDesign-export newspapers as needing OCR on page 1, and the vision model then hallucinates (wrong dates, `"Grenzteilbahn für Baumenladen"` loops, garbled titles like `REHEINZ ZEITHUNG`). Newspapers and Swiss council-minutes PDFs always have embedded text, so `fast` (pure Rust text extraction via pdf-inspector, no OCR) is strictly better. Reproduce with `scripts/benchmark-pdf-parse-modes.sh <storage_path>`.

### Ranking Table

See `_shared/zeitung-extraction-prompt.ts` for the editable ranking table that determines what content is extracted vs ignored and its priority level.

### Deduplication

- **Within batch:** dual-signal check (`>= 0.93` cosine and `>= 0.70` trigram/text similarity)
- **Canonical DB merge:** `upsert_canonical_unit(...)` exact-match path first, then semantic merge only when embedding and text similarity both agree
- **Duplicate upload guard:** Checks `newspaper_jobs` for existing `processing` job with same `storage_path`

### Status Tracking

`newspaper_jobs` table with Supabase Realtime. Frontend subscribes to `postgres_changes` on the job row for live progress updates (chunks_processed / chunks_total).

### Regression Coverage

- `npm run test:manual-upload` — unit coverage for review-unit sanitization and finalize edge cases
- `npm run bench:manual-upload` — micro-benchmark for the review sanitizer used by `process-newspaper` and `manual-upload`
