import {
  assertCondition,
  cleanupTestUser,
  createLiveTestContext,
  logStep,
} from './live_test_utils.ts';

const TEST_EMBEDDING = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));

async function insertScoutAndExecution(
  name: string,
): Promise<{ scoutId: string; executionId: string }> {
  const ctx = createLiveTestContext();
  const { data: scout, error: scoutError } = await ctx.serviceClient
    .from('scouts')
    .insert({
      user_id: ctx.testUserId,
      name,
      url: 'https://example.com/smoke',
      criteria: '',
      frequency: 'daily',
      is_active: true,
      location_mode: 'manual',
      location: { city: 'Arlesheim', country: 'Switzerland' },
      scout_type: 'web',
    })
    .select('id')
    .single();

  if (scoutError || !scout) {
    throw scoutError ?? new Error('Failed to create smoke scout');
  }

  const { data: execution, error: executionError } = await ctx.serviceClient
    .from('scout_executions')
    .insert({
      scout_id: scout.id,
      user_id: ctx.testUserId,
      status: 'running',
    })
    .select('id')
    .single();

  if (executionError || !execution) {
    throw executionError ?? new Error('Failed to create smoke execution');
  }

  return {
    scoutId: scout.id,
    executionId: execution.id,
  };
}

async function upsertCanonical(
  scoutId: string,
  executionId: string,
  sourceUrl: string,
  options: {
    statement?: string;
    entities?: string[];
    eventDate?: string;
    contentSha?: string | null;
  } = {},
): Promise<{ unit_id: string; occurrence_id: string | null; merged_existing: boolean }> {
  const ctx = createLiveTestContext();
  const statement = options.statement ?? 'Der Gemeinderat Arlesheim genehmigt im April 2026 den Neubau des Werkhofs.';
  const entities = options.entities ?? ['Gemeinderat Arlesheim', 'Werkhof'];
  const eventDate = options.eventDate ?? '2026-04-23';
  const { data, error } = await ctx.serviceClient.rpc('upsert_canonical_unit', {
    p_user_id: ctx.testUserId,
    p_statement: statement,
    p_unit_type: 'fact',
    p_source_url: sourceUrl,
    p_embedding: TEST_EMBEDDING,
    p_scout_id: scoutId,
    p_execution_id: executionId,
    p_entities: entities,
    p_source_domain: 'example.com',
    p_source_title: 'Smoke Test Source',
    p_location: { city: 'Arlesheim', country: 'Switzerland' },
    p_topic: 'Bau',
    p_event_date: eventDate,
    p_village_confidence: 'high',
    p_review_required: false,
    p_assignment_path: 'manual',
    p_publication_date: eventDate,
    p_sensitivity: 'none',
    p_is_listing_page: false,
    p_article_url: sourceUrl,
    p_quality_score: 90,
    p_source_type: 'scout',
    p_file_path: null,
    p_content_sha256: options.contentSha ?? null,
    p_statement_hash: null,
    p_context_excerpt: statement,
    p_extracted_at: new Date().toISOString(),
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  assertCondition(row?.unit_id, 'upsert_canonical_unit returned no unit_id');
  return row;
}

try {
  const ctx = createLiveTestContext();
  await cleanupTestUser(ctx);

  logStep('Canonical dedup smoke: create same-scout and cross-scout provenance');
  const scoutAExec1 = await insertScoutAndExecution('Smoke Dedup Scout A');
  const scoutAExec2 = await insertScoutAndExecution('Smoke Dedup Scout A Rerun');
  const scoutBExec1 = await insertScoutAndExecution('Smoke Dedup Scout B');

  const first = await upsertCanonical(
    scoutAExec1.scoutId,
    scoutAExec1.executionId,
    'https://example.com/smoke/a',
  );
  const second = await upsertCanonical(
    scoutAExec1.scoutId,
    scoutAExec2.executionId,
    'https://example.com/smoke/a-rerun',
  );
  const third = await upsertCanonical(
    scoutBExec1.scoutId,
    scoutBExec1.executionId,
    'https://example.com/smoke/b',
  );
  const paraphrase = await upsertCanonical(
    scoutBExec1.scoutId,
    scoutBExec1.executionId,
    'https://example.com/smoke/b-paraphrase',
    {
      statement: 'Im April 2026 genehmigt der Gemeinderat Arlesheim den Neubau des Werkhofs.',
      entities: ['Gemeinderat Arlesheim', 'Werkhof'],
    },
  );
  const unrelated = await upsertCanonical(
    scoutBExec1.scoutId,
    scoutBExec1.executionId,
    'https://example.com/smoke/b-unrelated',
    {
      statement: 'Der Gemeinderat Arlesheim eröffnet im April 2026 eine neue Velostation am Bahnhof.',
      entities: ['Gemeinderat Arlesheim', 'Velostation', 'Bahnhof'],
    },
  );

  assertCondition(first.merged_existing === false, 'First canonical upsert should create a new unit');
  assertCondition(second.merged_existing === true, 'Second canonical upsert should merge as same-scout rerun');
  assertCondition(third.merged_existing === true, 'Third canonical upsert should merge across scouts');
  assertCondition(paraphrase.merged_existing === true, 'Same-event paraphrase should merge');
  assertCondition(unrelated.merged_existing === false, 'Unrelated same-domain/date/entity fact should not merge');
  assertCondition(
    first.unit_id === second.unit_id && second.unit_id === third.unit_id && third.unit_id === paraphrase.unit_id,
    'Exact and paraphrased upserts should target one unit',
  );
  assertCondition(unrelated.unit_id !== first.unit_id, 'Unrelated fact should create a separate canonical unit');

  const { data: canonicalUnit, error: canonicalError } = await ctx.serviceClient
    .from('information_units')
    .select('id, occurrence_count, source_count')
    .eq('id', first.unit_id)
    .single();

  if (canonicalError || !canonicalUnit) {
    throw canonicalError ?? new Error('Canonical unit not found after dedup smoke');
  }

  assertCondition(canonicalUnit.occurrence_count === 4, `Expected occurrence_count=4, got ${canonicalUnit.occurrence_count}`);
  assertCondition(canonicalUnit.source_count === 4, `Expected source_count=4, got ${canonicalUnit.source_count}`);

  const { data: grouped, error: groupedError } = await ctx.serviceClient
    .from('unit_occurrences')
    .select('scout_id')
    .eq('unit_id', first.unit_id);

  if (groupedError) throw groupedError;

  const linkedScouts = new Set((grouped ?? []).map((row) => row.scout_id as string));
  assertCondition(linkedScouts.size === 2, `Expected linked scouts=2, got ${linkedScouts.size}`);

  logStep('Live canonical dedup smoke passed');
} finally {
  const ctx = createLiveTestContext();
  await cleanupTestUser(ctx);
}
