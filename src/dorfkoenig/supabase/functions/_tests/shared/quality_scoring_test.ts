/**
 * Unit tests for _shared/quality-scoring.ts (DRAFT_QUALITY.md §3.2.2).
 */

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  computeQualityScore,
  explainQualityScore,
  isArticleLevelUrl,
  isSocialMediaDomain,
  QUALITY_WEIGHTS,
  type ScoreableUnit,
} from '../../_shared/quality-scoring.ts';

const TODAY = '2026-04-22';

function unit(overrides: Partial<ScoreableUnit> = {}): ScoreableUnit {
  return {
    statement: 'Ein vollständiger Satz mit Substanz, mindestens 40 Zeichen lang.',
    source_url: 'https://www.bzbasel.ch/basel/baselland/ld.4152854',
    source_domain: 'bz Basel',
    article_url: 'https://www.bzbasel.ch/basel/baselland/ld.4152854',
    is_listing_page: false,
    event_date: null,
    publication_date: '2026-04-21',
    created_at: '2026-04-21T10:00:00Z',
    village_confidence: 'high',
    sensitivity: 'none',
    ...overrides,
  };
}

Deno.test('computeQualityScore — ideal unit scores in the 80s', () => {
  const score = computeQualityScore(unit(), TODAY);
  assert(score >= 80, `expected >=80, got ${score}`);
  assert(score <= 100);
});

Deno.test('computeQualityScore — listing-page URL drops article_level_url bonus', () => {
  const score = computeQualityScore(
    unit({ source_url: 'https://www.arlesheim.ch/de/veranstaltungen/', article_url: null }),
    TODAY,
  );
  const ideal = computeQualityScore(unit(), TODAY);
  assertEquals(ideal - score, QUALITY_WEIGHTS.article_level_url);
});

Deno.test('computeQualityScore — stale publication drops recent_publication bonus', () => {
  const score = computeQualityScore(
    unit({ publication_date: '2026-01-01' }),
    TODAY,
  );
  const ideal = computeQualityScore(unit(), TODAY);
  assertEquals(ideal - score, QUALITY_WEIGHTS.recent_publication);
});

Deno.test('computeQualityScore — sensitive=death drops non_sensitive bonus', () => {
  const score = computeQualityScore(
    unit({ sensitivity: 'death' }),
    TODAY,
  );
  const ideal = computeQualityScore(unit(), TODAY);
  assertEquals(ideal - score, QUALITY_WEIGHTS.non_sensitive);
});

Deno.test('computeQualityScore — social-media source drops non_social_media bonus', () => {
  const score = computeQualityScore(
    unit({
      source_domain: 'Facebook-Gruppe Arlesheim',
      source_url: 'https://www.facebook.com/groups/222184897987345/permalink/1234/',
      article_url: 'https://www.facebook.com/groups/222184897987345/permalink/1234/',
    }),
    TODAY,
  );
  const baseline = computeQualityScore(
    unit({
      source_domain: 'Gemeinde',
      source_url: 'https://www.arlesheim.ch/a/b/c.php',
      article_url: 'https://www.arlesheim.ch/a/b/c.php',
    }),
    TODAY,
  );
  assertEquals(baseline - score, QUALITY_WEIGHTS.non_social_media);
});

Deno.test('computeQualityScore — short statement drops substantive_statement bonus', () => {
  const score = computeQualityScore(unit({ statement: 'Kurz.' }), TODAY);
  const ideal = computeQualityScore(unit(), TODAY);
  assertEquals(ideal - score, QUALITY_WEIGHTS.substantive_statement);
});

Deno.test('computeQualityScore — precise event_date in statement adds bonus', () => {
  const withExplicitDate = computeQualityScore(
    unit({
      event_date: '2026-04-22',
      statement: 'Am 22. April 2026 findet das Gesundheitsforum statt; mit 40+ Zeichen.',
    }),
    TODAY,
  );
  const withoutExplicit = computeQualityScore(
    unit({
      event_date: '2026-04-22',
      statement: 'Eine Veranstaltung ist demnächst geplant, mindestens 40 Zeichen lang.',
    }),
    TODAY,
  );
  assertEquals(withExplicitDate - withoutExplicit, QUALITY_WEIGHTS.precise_event_date);
});

Deno.test('computeQualityScore — worst-case unit scores 0', () => {
  const score = computeQualityScore(
    {
      statement: 'kurz',
      source_url: 'https://www.arlesheim.ch/de/veranstaltungen/',
      source_domain: 'facebook.com',
      article_url: null,
      is_listing_page: true,
      event_date: null,
      publication_date: '2025-01-01',
      created_at: '2025-01-01T00:00:00Z',
      village_confidence: 'low',
      sensitivity: 'death',
    },
    TODAY,
  );
  assertEquals(score, 0);
});

Deno.test('explainQualityScore — reasons sum matches computeQualityScore', () => {
  const u = unit({ event_date: '2026-04-22', statement: 'Am 22. April 2026 ein Ereignis mit vollem Satz.' });
  const reasons = explainQualityScore(u, TODAY);
  const sum = reasons.reduce((s, r) => s + r.weight, 0);
  assertEquals(sum, Math.min(100, computeQualityScore(u, TODAY)));
});

Deno.test('isArticleLevelUrl — ld.NNN pattern qualifies', () => {
  assert(isArticleLevelUrl('https://www.bzbasel.ch/basel/baselland/ld.4152854'));
});

Deno.test('isArticleLevelUrl — listing page disqualified', () => {
  assertFalse(isArticleLevelUrl('https://www.arlesheim.ch/de/veranstaltungen/'));
  assertFalse(isArticleLevelUrl('https://www.arlesheim.ch/de/aktuelles'));
});

Deno.test('isArticleLevelUrl — .pdf and .php qualify', () => {
  assert(isArticleLevelUrl('https://www.arlesheim.ch/bauinfo.pdf'));
  assert(isArticleLevelUrl('https://www.arlesheim.ch/article.php'));
});

Deno.test('isArticleLevelUrl — homepage disqualified', () => {
  assertFalse(isArticleLevelUrl('https://www.arlesheim.ch/'));
  assertFalse(isArticleLevelUrl('https://www.arlesheim.ch'));
});

Deno.test('isArticleLevelUrl — null/empty → false', () => {
  assertFalse(isArticleLevelUrl(null));
  assertFalse(isArticleLevelUrl(undefined));
  assertFalse(isArticleLevelUrl(''));
});

Deno.test('isSocialMediaDomain — facebook.com detected via domain or URL', () => {
  assert(isSocialMediaDomain('facebook.com', null));
  assert(isSocialMediaDomain('Facebook-Gruppe Arlesheim', null));
  assert(isSocialMediaDomain(null, 'https://www.facebook.com/groups/abc/permalink/1'));
  assert(isSocialMediaDomain('something else', 'https://www.instagram.com/post/1'));
});

Deno.test('isSocialMediaDomain — non-social returns false', () => {
  assertFalse(isSocialMediaDomain('bz Basel', 'https://bzbasel.ch/article'));
  assertFalse(isSocialMediaDomain('Gemeinde Arlesheim', null));
});
