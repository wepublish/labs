# Newspaper PDF Extraction — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Feature:** Extract information units from uploaded local newspaper PDFs

## Overview

Extend the existing manual PDF upload flow to parse newspaper content via Firecrawl, extract community-relevant information units via LLM, assign them to known villages, and store them with dates for use in village newsletters.

When a journalist uploads a weekly newspaper PDF (e.g., Wochenblatt für das Birseck und das Dorneck), the system parses the full PDF, identifies articles relevant to the 10 Basel-area municipalities, extracts atomic facts with dates, deduplicates against existing units per village, and stores them as `information_units` with `source_type: 'manual_pdf'` and `topic: 'Wochenblatt'`.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PDF parser | Firecrawl | Already integrated, better article coherence than LlamaParse (benchmarked on real Wochenblatt) |
| Processing model | Async edge function | 2-3 min pipeline too long for synchronous response |
| Chunking | Boundary-aware (split on headings/section breaks) | Preserves article integrity better than fixed-size chunks |
| Village assignment | LLM assigns from gemeinden.json list | No manual location field; content outside known villages dropped in post-processing |
| Dedup scope | Per-village against existing units | Cheaper than full cross-check, catches scout/newspaper overlap |
| Status tracking | `newspaper_jobs` table + Supabase Realtime | Same pattern as `bajour_drafts` verification |
| System prompt location | `_shared/zeitung-extraction-prompt.ts` | Separate file for easy iteration on ranking table and filtering logic |
| Progress UI | Reuse `ProgressIndicator.svelte` with time estimate | Journalist sees real progress via Realtime subscription |

## Architecture

```
UploadModal (PDF tab)
  → manualUploadApi.requestUploadUrl()     // presigned URL
  → manualUploadApi.uploadFile()           // direct to Storage
  → manualUploadApi.confirmUpload()        // pdf_confirm
    → manual-upload edge function
      → validates magic bytes, confirms file exists
      → creates newspaper_jobs row (status: 'processing')
      → triggers process-newspaper via fetch() + 50ms flush delay
      → returns { status: 'processing', job_id }
    → Frontend subscribes to Realtime on newspaper_jobs(id=job_id)

process-newspaper edge function (async, ~90-200s):
  1. Get signed download URL for PDF in Supabase Storage
  2. Firecrawl scrape(url, formats: ['markdown']) → full markdown (~250K chars)
  3. Preprocess: collapse whitespace, strip OCR artifacts, remove page headers
  4. Boundary-aware chunking: split on headings/section breaks, ~15K target
  5. Pre-filter: skip chunks where >40% of lines are ad signals
  6. For each valid chunk (concurrency 3-4):
     a. Call OpenRouter GPT-4o-mini with zeitung-extraction-prompt
     b. Parse response: { units[], skipped[] }
     c. Collect all units
  7. Post-process:
     a. Filter out village: null units
     b. Generate embeddings (batch via embeddings.generateBatch())
     c. Deduplicate within batch (0.75 cosine threshold)
     d. Per-village dedup against existing units in DB (0.75 threshold, via vector similarity query scoped to user_id + location.city)
  8. Store unique units in information_units table
  9. Update newspaper_jobs: status='completed', units_created=N
  10. On error: status='failed', error_message (partial results kept)
```

## New Files

### 1. `_shared/zeitung-extraction-prompt.ts`

The filtering and extraction logic in a single, easily editable file.

**Contents:**

**A. Ranking table** — TypeScript constant for programmatic validation:
```typescript
export const CONTENT_RANKING = [
  { key: 'community_events',    priority: 'high',   include: true  },
  { key: 'municipal_notices',   priority: 'high',   include: true  },
  { key: 'infrastructure',      priority: 'high',   include: true  },
  { key: 'council',             priority: 'medium', include: true  },
  { key: 'feature',             priority: 'medium', include: true  },
  { key: 'nature_environment',  priority: 'medium', include: true  },
  { key: 'church_association',  priority: 'low',    include: true  },
  { key: 'advertisements',      priority: 'none',   include: false },
  { key: 'puzzles',             priority: 'none',   include: false },
  { key: 'masthead',            priority: 'none',   include: false },
] as const;
```

**B. German system prompt** (natural language, not serialized JSON):
- INHALTSFILTER section: what to extract vs ignore, with German examples
- EXTRAKTIONSREGELN: max 10 units per chunk, prefer high priority when over limit
- GEMEINDEZUORDNUNG: village list interpolated, assignment rules (primary affected municipality, not mere mention), `village: null` for unmatched
- DATUMSEXTRAKTION: publication date injected, explicit rules for relative dates ("nächsten Mittwoch" resolved against publication date), vague dates → null
- PRIORITÄT: high/medium/low mapping to categories
- KATEGORIE: enum values matching CONTENT_RANKING keys
- AUSGABEFORMAT: JSON with units[] (statement, unitType, entities, eventDate, village, priority, category) and skipped[] (for observability)
- SICHERHEITSHINWEIS: prompt injection defense (same pattern as existing scouts)

**C. Helper functions:**
- `buildNewspaperExtractionPrompt(villages: string[], publicationDate: string)` → `{ system: string, buildUserMessage: (chunk: string) => string }`
- `chunkNewspaperMarkdown(markdown: string, maxChars?: number)` → `string[]` — boundary-aware splitting on headings, ALL CAPS lines, triple newlines, horizontal rules
- `preprocessMarkdown(markdown: string)` → `string` — collapse whitespace, remove page headers/footers, strip OCR artifacts
- `isLikelyJunkChunk(chunk: string)` → `boolean` — skip chunks with >40% ad signal lines (CHF, Tel., www., Rabatt, Sudoku, etc.)

**D. TypeScript types:**
- `ExtractionUnit` — statement, unitType, entities, eventDate, village, priority, category
- `ExtractionResult` — { units: ExtractionUnit[], skipped: string[] }
- `ContentCategory` — union type from CONTENT_RANKING keys
- `Priority` — 'high' | 'medium' | 'low'

### 2. `process-newspaper/index.ts`

New edge function. Auth: service role key only.

**Config (`config.toml`):**
```toml
[functions.process-newspaper]
verify_jwt = false
```

**Pipeline steps** as described in Architecture section above. Key implementation details:
- Uses `createServiceClient()` (bypasses RLS)
- Signed URL: `supabase.storage.from('uploads').createSignedUrl(path, 3600)`
- Firecrawl: `firecrawl.scrape({ url: signedUrl, formats: ['markdown'], timeout: 120000 })`
- LLM calls parallelized with concurrency limit of 3-4
- Each chunk try/catch — failures logged, processing continues
- Updates `newspaper_jobs.units_created` after each successful chunk (Realtime pushes to client)
- Duplicate upload guard: check for existing `processing` job with same `storage_path` before starting

### 3. Migration: `newspaper_jobs` table

```sql
CREATE TABLE newspaper_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  publication_date DATE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  chunks_total INTEGER DEFAULT 0,
  chunks_processed INTEGER DEFAULT 0,
  units_created INTEGER DEFAULT 0,
  skipped_items TEXT[] DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE newspaper_jobs ENABLE ROW LEVEL SECURITY;

-- Users read their own jobs
CREATE POLICY "Users can read their own jobs" ON newspaper_jobs
  FOR SELECT USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

-- Service role full access
CREATE POLICY "Service role can manage jobs" ON newspaper_jobs
  FOR ALL USING (current_setting('role', true) = 'service_role');

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE newspaper_jobs;
```

### 4. `scripts/benchmark-newspaper.ts`

Deno script for local testing of the full pipeline.

**Usage:**
```bash
deno run --allow-net --allow-read scripts/benchmark-newspaper.ts \
  --pdf /path/to/newspaper.pdf \
  --firecrawl-key fc-xxx \
  --openrouter-key sk-or-xxx \
  [--publication-date 2026-03-19]
```

**What it does:**
1. Accepts a `--url` flag for a pre-hosted PDF, or uploads to tmpfiles.org automatically
2. Runs Firecrawl parse → markdown
3. Runs preprocessing → chunking → junk filter
4. Runs LLM extraction per chunk using actual `zeitung-extraction-prompt.ts`
5. Reports metrics:
   - Parse: chars extracted, time
   - Chunks: total, filtered as junk, processed
   - Units: total extracted, by village, by priority, by category
   - Skipped items list
   - Token usage estimate
6. Outputs extracted units as a readable markdown table for human review

**Purpose:** Iterate on the prompt and ranking table without deploying. Run, review output, tweak `zeitung-extraction-prompt.ts`, repeat.

## Modified Files

### 5. `manual-upload/index.ts` — `handleFileConfirm()` changes

When `content_type === 'pdf_confirm'`:

**Before:** Creates a single `information_unit` from the user's `description` text.

**After:**
1. Validates file (magic bytes, storage existence) — unchanged
2. Creates `newspaper_jobs` row with `status: 'processing'`
3. Triggers `process-newspaper` via fetch (50ms flush delay before returning)
4. Returns `{ status: 'processing', job_id, storage_path }` instead of `{ units_created: 1, unit_ids: [...] }`

**Validation changes:**
- `description` becomes optional (label, not required for extraction)
- `location` no longer required/accepted for PDF uploads (LLM assigns villages)
- `publication_date` accepted as new field (YYYY-MM-DD string, nullable in DB but required by frontend UI)

**Photo confirm (`photo_confirm`) remains unchanged** — still creates a single unit from description. Photo upload is hidden in UI but the backend stays functional.

### 6. `UploadModal.svelte` — UI changes

**Tab bar:**
- Hide the photo tab (comment out, keep code for future image embedding)
- Two tabs remain: Text, PDF

**PDF tab form:**
- Remove the location/topic `ScopeToggle` when PDF tab is active
- Description field: relabel to "Bezeichnung (optional)", placeholder "z.B. Wochenblatt 19. März 2026"
- Add publication date picker: `<input type="date">`, label "Publikationsdatum", required for PDF
- Source title field: keep as-is (Quellenangabe)

**Upload state for PDF:**
- After `pdf_confirm` returns `{ status: 'processing', job_id }`, transition to a new `'processing'` upload state (distinct from `'uploading'`)
- Subscribe to Supabase Realtime on `newspaper_jobs` filtered by `id = job_id`
- Show `ProgressIndicator` with:
  - `message`: "Zeitung wird analysiert..."
  - `progress`: calculated from `chunks_processed / chunks_total * 100`
  - `hintText`: time estimate based on chunks_total (e.g., "Geschätzte Dauer: ca. 2 Minuten" — roughly 15s per chunk as baseline)
- On Realtime update with `status: 'completed'`: transition to success state showing units_created count
- On Realtime update with `status: 'failed'`: transition to error state with error_message
- No auto-close timer during processing (unlike the 2s auto-close for text upload success)

**Progress time estimate formula:**
```
estimatedSeconds = chunksTotal * 15  // ~15s per chunk (Firecrawl + LLM + embed)
// Update as chunks complete: remainingSeconds = (chunksTotal - chunksProcessed) * avgSecondsPerChunk
```

### 7. `UploadPdfTab.svelte` — form changes

- Description field: optional, relabeled "Bezeichnung (optional)", placeholder "z.B. Wochenblatt 19. März 2026"
- Add publication date input: `<input type="date">` with label "Publikationsdatum"
- New prop: `publicationDate: string`, `onpublicationdatechange: (date: string) => void`

### 8. `lib/api.ts` — API type updates

- `manualUploadApi.confirmUpload` response type: add `{ status: 'processing', job_id }` variant for PDF
- Add `newspaperJobsApi` or inline Realtime subscription helper for `newspaper_jobs`

### 9. `lib/types.ts` — type additions

```typescript
export interface NewspaperJob {
  id: string;
  user_id: string;
  storage_path: string;
  publication_date: string | null;
  label: string | null;
  status: 'processing' | 'completed' | 'failed';
  chunks_total: number;
  chunks_processed: number;
  units_created: number;
  skipped_items: string[];
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}
```

## Documentation Updates

### 10. `specs/PIPELINES.md`
Add new section "Newspaper PDF Processing Pipeline" describing the 10-step pipeline, chunking strategy, ranking table, and dedup behavior.

### 11. `supabase/CLAUDE.md`
- Add `process-newspaper` to edge functions table
- Add `newspaper_jobs` to database schema section
- Add `zeitung-extraction-prompt.ts` to shared modules table

### 12. `CLAUDE.md` (dorfkoenig root)
- Update directory structure to include new files
- Add note about newspaper extraction feature

## Villages

The 10 municipalities from `gemeinden.json` that the LLM assigns to:

| ID | Name | Canton |
|----|------|--------|
| aesch | Aesch | BL |
| allschwil | Allschwil | BL |
| arlesheim | Arlesheim | BL |
| binningen | Binningen | BL |
| bottmingen | Bottmingen | BL |
| muenchenstein | Münchenstein | BL |
| muttenz | Muttenz | BL |
| pratteln | Pratteln | BL |
| reinach | Reinach | BL |
| riehen | Riehen | BS |

Content about municipalities not in this list (e.g., Dornach, Pfeffingen, Hochwald from the Wochenblatt test) gets `village: null` and is filtered out in post-processing.

## Cost Estimate

Per newspaper upload (~12 pages):

| Service | Cost |
|---------|------|
| Firecrawl (1 PDF scrape) | ~$0.01 |
| OpenRouter GPT-4o-mini (8-10 chunks) | ~$0.02-0.04 |
| OpenRouter embeddings (batch) | ~$0.001 |
| **Total** | **~$0.03-0.05** |

At 10 uploads/hour rate limit: max $0.50/hour.

## Constraints

- Edge function wall clock timeout: 400s. Pipeline estimated 90-200s. LLM calls parallelized (concurrency 3-4) for safety margin.
- Firecrawl's PDF-to-markdown doesn't perfectly handle multi-column newspaper layouts (some text fragmentation). The LLM extraction prompt handles this with a "partial content" instruction.
- `response_format: { type: 'json_object' }` on OpenRouter calls guarantees valid JSON output.
- Duplicate upload guard: check `newspaper_jobs` for existing `processing` job with same `storage_path` before starting.

## Benchmark Results (2026-04-09)

Tested on Wochenblatt für das Birseck und das Dorneck, Nr. 12, 19. März 2026 (12 pages, 12.9 MB PDF):

| Parser | Output size | Article coherence | Page breaks | Tables | Duration |
|--------|------------|-------------------|-------------|--------|----------|
| Firecrawl | 254K chars, 3871 lines | Good — maintains text flow | None | None | ~47s |
| LlamaParse | 127K chars, 2335 lines | Mixed — columns interleave | 27 separators | 88 rows | ~10s |

**Decision: Firecrawl** — article coherence matters more for LLM extraction accuracy. LlamaParse's better table extraction doesn't outweigh the column interleaving problem.

Raw benchmark output saved in `scripts/benchmark-output/`.
