/**
 * Content-hash cache for auto-mode LLM extraction.
 *
 * Key: (content_hash, criteria_hash, prompt_version). On a scout re-run with
 * identical content + criteria + prompt version, we skip the LLM call and
 * reuse the stored units. Prompt-version bumps in web-extraction-prompt.ts
 * invalidate cache entries naturally (new key, new row).
 */

import type { createServiceClient } from './supabase-client.ts';
import type { WebExtractionResult } from './web-extraction-prompt.ts';

type SupabaseClient = ReturnType<typeof createServiceClient>;

/**
 * Stable short hash of a criteria string (or empty marker for no criteria).
 * Uses SHA-256 truncated to 32 hex chars — same whitespace normalisation as
 * firecrawl.computeContentHash so equivalent criteria strings collide.
 */
export async function computeCriteriaHash(criteria: string | null | undefined): Promise<string> {
  const normalized = (criteria ?? '').replace(/\s+/g, ' ').trim();
  const encoded = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getCachedExtraction(
  supabase: SupabaseClient,
  contentHash: string,
  criteriaHash: string,
  promptVersion: number,
): Promise<WebExtractionResult | null> {
  const { data, error } = await supabase
    .from('extraction_cache')
    .select('units')
    .eq('content_hash', contentHash)
    .eq('criteria_hash', criteriaHash)
    .eq('prompt_version', promptVersion)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return data.units as WebExtractionResult;
}

export async function setCachedExtraction(
  supabase: SupabaseClient,
  contentHash: string,
  criteriaHash: string,
  promptVersion: number,
  result: WebExtractionResult,
): Promise<void> {
  const { error } = await supabase
    .from('extraction_cache')
    .upsert(
      {
        content_hash: contentHash,
        criteria_hash: criteriaHash,
        prompt_version: promptVersion,
        units: result,
      },
      { onConflict: 'content_hash,criteria_hash,prompt_version' },
    );

  if (error) {
    console.warn('[extraction-cache] set failed:', error.message);
  }
}
