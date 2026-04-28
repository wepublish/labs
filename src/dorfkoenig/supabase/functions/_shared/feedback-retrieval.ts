import type { AntiPattern, PositiveSeed } from './draft-quality.ts';
import { createServiceClient } from './supabase-client.ts';

export interface FeedbackExampleRow {
  kind: 'positive' | 'negative';
  bullet_text: string;
  editor_reason: string | null;
  created_at: string;
}

export interface ComposeFeedbackExamples {
  positiveExamples: PositiveSeed[];
  antiPatterns: AntiPattern[];
  villagePositiveCount: number;
  villageNegativeCount: number;
}

const MAX_POSITIVE_EXAMPLES = 6;
const MAX_NEGATIVE_EXAMPLES = 4;
const FETCH_LIMIT = 16;

export function buildComposeFeedbackExamples(opts: {
  rows: FeedbackExampleRow[];
  fallbackPositiveExamples: readonly PositiveSeed[];
  fallbackAntiPatterns: readonly AntiPattern[];
  maxPositiveExamples?: number;
  maxNegativeExamples?: number;
}): ComposeFeedbackExamples {
  const maxPositiveExamples = opts.maxPositiveExamples ?? MAX_POSITIVE_EXAMPLES;
  const maxNegativeExamples = opts.maxNegativeExamples ?? MAX_NEGATIVE_EXAMPLES;

  const positiveExamples: PositiveSeed[] = [];
  const antiPatterns: AntiPattern[] = [];
  const seenPositive = new Set<string>();
  const seenNegative = new Set<string>();

  const villagePositives = opts.rows.filter((row) =>
    row.kind === 'positive' && row.editor_reason?.trim() !== 'Externally published'
  );
  const villageNegatives = opts.rows.filter((row) => row.kind === 'negative');

  for (const row of villagePositives) {
    const bullet = row.bullet_text.trim();
    if (!bullet || seenPositive.has(bullet)) continue;
    seenPositive.add(bullet);
    positiveExamples.push({
      bullet,
      source_domain: 'Redaktionsbeispiel',
    });
    if (positiveExamples.length >= maxPositiveExamples) break;
  }

  for (const seed of opts.fallbackPositiveExamples) {
    if (positiveExamples.length >= maxPositiveExamples) break;
    if (seenPositive.has(seed.bullet)) continue;
    seenPositive.add(seed.bullet);
    positiveExamples.push({ ...seed });
  }

  for (const row of villageNegatives) {
    const bullet = row.bullet_text.trim();
    if (!bullet || seenNegative.has(bullet)) continue;
    seenNegative.add(bullet);
    antiPatterns.push({
      bullet,
      reason: row.editor_reason?.trim() || 'Redaktionsfeedback',
    });
    if (antiPatterns.length >= maxNegativeExamples) break;
  }

  for (const seed of opts.fallbackAntiPatterns) {
    if (antiPatterns.length >= maxNegativeExamples) break;
    if (seenNegative.has(seed.bullet)) continue;
    seenNegative.add(seed.bullet);
    antiPatterns.push({ ...seed });
  }

  return {
    positiveExamples,
    antiPatterns,
    villagePositiveCount: villagePositives.length,
    villageNegativeCount: villageNegatives.length,
  };
}

export async function loadComposeFeedbackExamplesForVillage(
  supabase: ReturnType<typeof createServiceClient>,
  villageId: string,
  fallbackPositiveExamples: readonly PositiveSeed[],
  fallbackAntiPatterns: readonly AntiPattern[],
): Promise<ComposeFeedbackExamples> {
  const { data, error } = await supabase
    .from('bajour_feedback_examples')
    .select('kind, bullet_text, editor_reason, created_at')
    .eq('village_id', villageId)
    .in('kind', ['positive', 'negative'])
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    throw new Error(`Feedback retrieval failed: ${error.message}`);
  }

  const rows = (data ?? []) as FeedbackExampleRow[];
  return buildComposeFeedbackExamples({
    rows,
    fallbackPositiveExamples,
    fallbackAntiPatterns,
  });
}
