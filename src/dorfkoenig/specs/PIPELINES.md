# coJournalist-Lite Pipeline Specification

## Overview

The execute-scout pipeline is the core of coJournalist-Lite. It performs web scraping, change detection, criteria analysis, deduplication, information extraction, and notification delivery.

## Execute Scout Pipeline (9 Steps)

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

Fetch URL content using Firecrawl with change tracking.

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
| `0.85` | Production - strict deduplication |
| `0.75` | Testing - allows more through |
| `0.90` | Very strict - only exact matches |

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

Within-run deduplication (0.75 threshold) prevents storing near-identical units:

```typescript
export async function storeUnits(
  units: InformationUnit[],
  userId: string,
  scoutId: string,
  executionId: string,
  sourceUrl: string,
  sourceDomain: string,
  sourceTitle: string,
  location: object | null
): Promise<number> {
  const storedUnits: { embedding: number[]; statement: string }[] = [];
  let storedCount = 0;

  for (const unit of units) {
    const embedding = await embeddings.generate(unit.statement);

    // Within-run dedup: check against already stored units
    const isDuplicate = storedUnits.some(stored => {
      const similarity = cosineSimilarity(embedding, stored.embedding);
      return similarity >= 0.75;
    });

    if (isDuplicate) continue;

    const { error } = await supabase
      .from('information_units')
      .insert({
        user_id: userId,
        scout_id: scoutId,
        execution_id: executionId,
        statement: unit.statement,
        unit_type: unit.unitType,
        entities: unit.entities,
        source_url: sourceUrl,
        source_domain: sourceDomain,
        source_title: sourceTitle,
        location,
        embedding,
      });

    if (!error) {
      storedUnits.push({ embedding, statement: unit.statement });
      storedCount++;
    }
  }

  return storedCount;
}
```

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
    <p>Diese E-Mail wurde automatisch von coJournalist-Lite gesendet.</p>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'coJournalist <noreply@resend.dev>',
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
