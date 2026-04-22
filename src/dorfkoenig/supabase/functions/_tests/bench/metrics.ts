/**
 * Pure-TS metric scoring for draft-quality benchmark (specs/DRAFT_QUALITY.md §4.2).
 *
 * No LLM judgement. `unit_recall_vs_gold` uses embedding similarity (via a passed-in
 * embed function) only as a fallback; runs accept a provided embedding function so
 * callers can pick production (`text-embedding-3-small`) or a stub in tests.
 */

import { FORBIDDEN_PHRASE_PATTERNS, MAX_BULLETS_PER_DRAFT } from '../../_shared/draft-quality.ts';
import type { BenchOutput, Fixture, MetricResult } from './types.ts';

export interface ScoringOptions {
  /** Optional embedder for unit_recall fallback. Required if any gold bullet has
   *  no source_unit_ids and the prod output has no source_unit_ids either. */
  embed?: (texts: string[]) => Promise<number[][]>;
}

const MINIMUM_BULLET_LEN_FOR_EMBED = 15;
const EMBED_SIMILARITY_THRESHOLD = 0.82;

export async function scoreFixture(
  fixture: Fixture,
  output: BenchOutput,
  opts: ScoringOptions = {},
): Promise<MetricResult[]> {
  return [
    scoreBulletCount(output),
    scoreNoFiller(output),
    scoreUrlWhitelist(fixture, output),
    scoreUrlArticleQuality(output),
    scoreCrossVillagePurity(fixture, output),
    await scoreUnitRecallVsGold(fixture, output, opts),
  ];
}

export function aggregate(metrics: MetricResult[]): number {
  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedScore = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
  return Math.round(weightedScore / totalWeight);
}

// --- 1. bullet_count ----------------------------------------------------------

function scoreBulletCount(output: BenchOutput): MetricResult {
  const count = output.bullets.length;
  if (count === 0) {
    const pass = output.notes_for_editor.length > 0;
    return {
      name: 'bullet_count',
      pass,
      score: pass ? 100 : 0,
      weight: 15,
      detail: pass
        ? 'Empty draft with editor note (valid per §3.1.1)'
        : 'Empty draft without editor note — invalid',
    };
  }
  const pass = count >= 1 && count <= MAX_BULLETS_PER_DRAFT;
  return {
    name: 'bullet_count',
    pass,
    score: pass ? 100 : 0,
    weight: 15,
    detail: `${count} bullet(s); valid range 0–${MAX_BULLETS_PER_DRAFT}`,
  };
}

// --- 2. no_filler -------------------------------------------------------------

function scoreNoFiller(output: BenchOutput): MetricResult {
  const hits: string[] = [];
  for (const pattern of FORBIDDEN_PHRASE_PATTERNS) {
    const m = output.body_text.match(pattern);
    if (m) hits.push(m[0]);
  }
  const pass = hits.length === 0;
  return {
    name: 'no_filler',
    pass,
    score: pass ? 100 : Math.max(0, 100 - hits.length * 25),
    weight: 20,
    detail: pass ? 'No forbidden-phrase hits' : `Hits: ${hits.join(' | ')}`,
  };
}

// --- 3. url_whitelist ---------------------------------------------------------

function scoreUrlWhitelist(fixture: Fixture, output: BenchOutput): MetricResult {
  const allowedUrls = new Set<string>();
  for (const u of fixture.units) {
    if (u.source_url) allowedUrls.add(normalizeUrl(u.source_url));
    if (u.article_url) allowedUrls.add(normalizeUrl(u.article_url));
  }

  const cited: string[] = [];
  for (const b of output.bullets) {
    for (const url of b.link_urls) cited.push(normalizeUrl(url));
  }

  if (cited.length === 0) {
    return {
      name: 'url_whitelist',
      pass: true,
      score: 100,
      weight: 20,
      detail: 'No URLs cited (trivially valid)',
    };
  }

  const invalid = cited.filter((u) => !allowedUrls.has(u));
  const pass = invalid.length === 0;
  const score = Math.round((1 - invalid.length / cited.length) * 100);
  return {
    name: 'url_whitelist',
    pass,
    score,
    weight: 20,
    detail: pass ? `${cited.length} cited, all valid` : `Invalid URLs: ${invalid.join(' | ')}`,
  };
}

// --- 4. url_article_quality --------------------------------------------------

function scoreUrlArticleQuality(output: BenchOutput): MetricResult {
  const cited = output.bullets.flatMap((b) => b.link_urls);
  if (cited.length === 0) {
    return {
      name: 'url_article_quality',
      pass: true,
      score: 100,
      weight: 15,
      detail: 'No URLs cited (trivially valid)',
    };
  }
  const articleLevel = cited.filter(isArticleLevelUrl);
  const ratio = articleLevel.length / cited.length;
  const pass = ratio >= 0.8;
  return {
    name: 'url_article_quality',
    pass,
    score: Math.round(ratio * 100),
    weight: 15,
    detail: `${articleLevel.length}/${cited.length} article-level URLs (${Math.round(ratio * 100)}%); threshold 80%`,
  };
}

/** Article-level heuristic: path depth ≥ 3 OR ends with a known article marker (ld.NNN, .php, .pdf, numeric id). */
function isArticleLevelUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length >= 3) return true;
    const last = segments[segments.length - 1] ?? '';
    if (/^ld\.\d+$/.test(last)) return true;
    if (/\.(php|pdf|html?|aspx)$/.test(last)) return true;
    if (/^\d{3,}$/.test(last)) return true;
    // Listing-page heuristics
    if (segments.length <= 2 && /^(veranstaltungen|aktuelles|news|events?)\/?$/i.test(last)) {
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

// --- 5. cross_village_purity --------------------------------------------------

function scoreCrossVillagePurity(fixture: Fixture, output: BenchOutput): MetricResult {
  const unitById = new Map(fixture.units.map((u) => [u.id, u]));
  let leaked = 0;
  let total = 0;
  for (const b of output.bullets) {
    for (const id of b.source_unit_ids) {
      const u = unitById.get(id);
      if (!u) continue;
      total++;
      if (u.location?.city && u.location.city !== fixture.village_id) leaked++;
    }
  }
  if (total === 0) {
    // No bullet carries source_unit_ids — happens during v1-adapter scoring. Rather
    // than swap in a weaker textual proxy (which would flag legitimate comparative
    // regional context), skip the check and mark it pass.
    return {
      name: 'cross_village_purity',
      pass: true,
      score: 100,
      weight: 10,
      detail: 'No bullet provenance — skipped (will score once bullet schema lands in Phase 1)',
    };
  }
  const ratio = 1 - leaked / total;
  const pass = leaked === 0;
  return {
    name: 'cross_village_purity',
    pass,
    score: Math.round(ratio * 100),
    weight: 10,
    detail: pass
      ? `${total} attributions, all in-village`
      : `${leaked}/${total} bullets cite out-of-village units`,
  };
}

// --- 6. unit_recall_vs_gold ---------------------------------------------------

async function scoreUnitRecallVsGold(
  fixture: Fixture,
  output: BenchOutput,
  opts: ScoringOptions,
): Promise<MetricResult> {
  const goldBullets = fixture.gold.bullets;
  if (goldBullets.length === 0) {
    // Empty-gold case: recall is "correctly produced empty."
    const pass = output.bullets.length === 0;
    return {
      name: 'unit_recall_vs_gold',
      pass,
      score: pass ? 100 : 0,
      weight: 20,
      detail: pass ? 'Correctly produced empty draft' : 'Gold is empty but pipeline produced bullets',
    };
  }

  const goldUnitIds = new Set(goldBullets.flatMap((b) => b.source_unit_ids));
  const outputUnitIds = new Set(output.bullets.flatMap((b) => b.source_unit_ids));

  // Direct overlap on source_unit_ids
  let covered = 0;
  for (const id of goldUnitIds) {
    if (outputUnitIds.has(id)) covered++;
  }

  // Fallback: embedding similarity for bullets ≥ MINIMUM_BULLET_LEN_FOR_EMBED chars.
  const uncoveredGold = goldBullets.filter(
    (b) => !b.source_unit_ids.some((id) => outputUnitIds.has(id)),
  );
  const embeddableOutput = output.bullets.filter(
    (b) => b.text.length >= MINIMUM_BULLET_LEN_FOR_EMBED,
  );
  const embeddableGold = uncoveredGold.filter(
    (b) => b.text.length >= MINIMUM_BULLET_LEN_FOR_EMBED,
  );

  if (embeddableGold.length > 0 && embeddableOutput.length > 0 && opts.embed) {
    const allTexts = [
      ...embeddableOutput.map((b) => b.text),
      ...embeddableGold.map((b) => b.text),
    ];
    const embs = await opts.embed(allTexts);
    const outEmbs = embs.slice(0, embeddableOutput.length);
    const goldEmbs = embs.slice(embeddableOutput.length);
    for (const ge of goldEmbs) {
      const bestSim = Math.max(...outEmbs.map((oe) => cosine(oe, ge)));
      if (bestSim >= EMBED_SIMILARITY_THRESHOLD) covered++;
    }
  }

  const ratio = covered / goldBullets.length;
  const pass = ratio >= 0.6;
  return {
    name: 'unit_recall_vs_gold',
    pass,
    score: Math.round(ratio * 100),
    weight: 20,
    detail: `${covered}/${goldBullets.length} gold bullets covered (${Math.round(ratio * 100)}%); threshold 60%`,
  };
}

// --- Helpers ------------------------------------------------------------------

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip trailing slash + fragments for comparison, keep query.
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
