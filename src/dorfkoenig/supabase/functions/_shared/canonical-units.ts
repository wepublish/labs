import { createServiceClient } from './supabase-client.ts';

export type CanonicalUnitType = 'fact' | 'event' | 'entity_update' | 'promise';
export type CanonicalSourceType = 'scout' | 'manual_text' | 'manual_photo' | 'manual_pdf';

export interface CanonicalUnitInput {
  userId: string;
  statement: string;
  unitType: CanonicalUnitType;
  sourceUrl: string;
  sourceDomain?: string | null;
  sourceTitle?: string | null;
  location?: unknown | null;
  topic?: string | null;
  scoutId?: string | null;
  executionId?: string | null;
  entities?: string[];
  embedding: number[];
  eventDate?: string | null;
  villageConfidence?: string | null;
  reviewRequired?: boolean;
  assignmentPath?: string | null;
  publicationDate?: string | null;
  sensitivity?: string | null;
  isListingPage?: boolean;
  articleUrl?: string | null;
  qualityScore?: number | null;
  sourceType?: CanonicalSourceType;
  filePath?: string | null;
  contentSha256?: string | null;
  contextExcerpt?: string | null;
  extractedAt?: string | null;
}

export interface CanonicalUpsertResult {
  unitId: string;
  occurrenceId: string | null;
  mergedExisting: boolean;
  createdNew: boolean;
  attachedOccurrence: boolean;
}

export interface UnitRollup {
  sources: Array<{ title: string | null; url: string; domain: string }>;
  linkedScouts: string[];
}

export async function hashSha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeStatementText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function computeStatementHash(statement: string): Promise<string> {
  return hashSha256(normalizeStatementText(statement));
}

export async function upsertCanonicalUnit(
  supabase: ReturnType<typeof createServiceClient>,
  input: CanonicalUnitInput,
): Promise<CanonicalUpsertResult> {
  const statementHash = await computeStatementHash(input.statement);
  const { data, error } = await supabase.rpc('upsert_canonical_unit', {
    p_user_id: input.userId,
    p_statement: input.statement,
    p_unit_type: input.unitType,
    p_source_url: input.sourceUrl,
    p_embedding: input.embedding,
    p_scout_id: input.scoutId ?? null,
    p_execution_id: input.executionId ?? null,
    p_entities: input.entities ?? [],
    p_source_domain: input.sourceDomain ?? null,
    p_source_title: input.sourceTitle ?? null,
    p_location: input.location ?? null,
    p_topic: input.topic ?? null,
    p_event_date: input.eventDate ?? null,
    p_village_confidence: input.villageConfidence ?? null,
    p_review_required: input.reviewRequired ?? false,
    p_assignment_path: input.assignmentPath ?? null,
    p_publication_date: input.publicationDate ?? null,
    p_sensitivity: input.sensitivity ?? null,
    p_is_listing_page: input.isListingPage ?? false,
    p_article_url: input.articleUrl ?? null,
    p_quality_score: input.qualityScore ?? null,
    p_source_type: input.sourceType ?? 'scout',
    p_file_path: input.filePath ?? null,
    p_content_sha256: input.contentSha256 ?? null,
    p_statement_hash: statementHash,
    p_context_excerpt: input.contextExcerpt ?? null,
    p_extracted_at: input.extractedAt ?? null,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.unit_id) {
    throw new Error('upsert_canonical_unit returned no unit_id');
  }

  const occurrenceId = row.occurrence_id ?? null;
  const mergedExisting = Boolean(row.merged_existing);
  return {
    unitId: row.unit_id,
    occurrenceId,
    mergedExisting,
    createdNew: !mergedExisting && occurrenceId !== null,
    attachedOccurrence: occurrenceId !== null,
  };
}

export async function fetchUnitRollups(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  unitIds: string[],
): Promise<Map<string, UnitRollup>> {
  if (unitIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('unit_occurrences')
    .select('unit_id, source_url, source_domain, source_title, scout_id, extracted_at')
    .eq('user_id', userId)
    .in('unit_id', unitIds)
    .order('extracted_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rollups = new Map<string, UnitRollup>();
  for (const occurrence of data ?? []) {
    const unitId = occurrence.unit_id as string;
    const existing = rollups.get(unitId) ?? { sources: [], linkedScouts: [] };

    if (!existing.sources.some((source) => source.url === occurrence.source_url)) {
      existing.sources.push({
        title: occurrence.source_title,
        url: occurrence.source_url,
        domain: occurrence.source_domain,
      });
    }

    const scoutId = occurrence.scout_id as string | null;
    if (scoutId && !existing.linkedScouts.includes(scoutId)) {
      existing.linkedScouts.push(scoutId);
    }

    rollups.set(unitId, existing);
  }

  return rollups;
}
