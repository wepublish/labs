import type { UnitForCompose } from './compose-draft.ts';
import type { RankedSelectionUnit } from './selection-ranking.ts';

/**
 * Converts raw selected units into compose-ready story candidates.
 *
 * Selection works at fact granularity; composition should work at story
 * granularity. Related fragments are folded into the lead unit's statement so
 * the composer gets one coherent bullet candidate instead of several required
 * fragments that it may omit.
 */
export function prepareUnitsForCompose(
  selectedUnits: UnitForCompose[],
  rankedSelection: RankedSelectionUnit[],
): UnitForCompose[] {
  const rankById = new Map(rankedSelection.map((row) => [row.unit.id, row]));
  const ordered = [...selectedUnits].sort((a, b) =>
    (rankById.get(b.id ?? '')?.score ?? 0) - (rankById.get(a.id ?? '')?.score ?? 0)
  );
  const stories: UnitForCompose[] = [];

  for (const unit of ordered) {
    const id = unit.id ?? '';
    const rank = rankById.get(id);
    if (rank && isContextOnly(rank)) continue;

    const existingIndex = stories.findIndex((story) => sameStory(story.statement, unit.statement));
    if (existingIndex === -1) {
      stories.push(unit);
      continue;
    }

    const existing = stories[existingIndex];
    stories[existingIndex] = {
      ...existing,
      statement: `${existing.statement} Zusatzkontext: ${unit.statement}`,
      quality_score: Math.max(existing.quality_score ?? 0, unit.quality_score ?? 0),
      article_url: existing.article_url ?? unit.article_url ?? null,
      source_url: existing.source_url ?? unit.source_url,
      source_domain: existing.source_domain ?? unit.source_domain,
      source_citation: existing.source_citation ?? unit.source_citation ?? null,
    };
  }

  return stories.slice(0, 4);
}

function isContextOnly(rank: RankedSelectionUnit): boolean {
  return rank.reasons.includes('static_directory_fact') ||
    rank.reasons.includes('supporting_fragment') ||
    rank.reasons.includes('cross_village_drift') ||
    rank.reasons.includes('low_village_confidence');
}

function sameStory(a: string, b: string): boolean {
  const left = topicTokens(a);
  const right = topicTokens(b);
  const overlap = [...right].filter((token) => left.has(token)).length;
  return overlap >= 2;
}

function topicTokens(value: string): Set<string> {
  const generic = new Set([
    'findet', 'statt', 'gemeinde', 'arlesheim', 'münchenstein', 'muenchenstein',
    'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag',
    'sonntag', 'wurde', 'wird', 'seit', 'mai', 'april',
  ]);
  const tokens = value
    .toLocaleLowerCase('de-CH')
    .replace(/\b\d{1,2}\.?\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .split(/[^a-z0-9äöüß]+/i)
    .filter((token) => token.length >= 5 && !generic.has(token));
  return new Set(tokens);
}
