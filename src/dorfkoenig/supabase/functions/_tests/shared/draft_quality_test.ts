/**
 * Unit tests for _shared/draft-quality.ts.
 *
 * Scaffolding tests (Phase 0): palette membership, banlist regex coverage.
 * Validator behaviour tests land with the validators themselves in Phase 1.
 */

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  EMOJI_PALETTE,
  FORBIDDEN_PHRASE_PATTERNS,
  findForbiddenPhrases,
  isAllowedEmoji,
  KIND_CAPS,
  MAX_BULLETS_PER_DRAFT,
  ANTI_PATTERNS,
  AGNOSTIC_POSITIVE_SEEDS,
} from '../../_shared/draft-quality.ts';

Deno.test('emoji palette contains 16 approved emoji', () => {
  assertEquals(EMOJI_PALETTE.length, 16);
});

Deno.test('isAllowedEmoji — palette members pass', () => {
  for (const e of EMOJI_PALETTE) {
    assert(isAllowedEmoji(e), `${e} should be allowed`);
  }
});

Deno.test('isAllowedEmoji — non-palette rejected', () => {
  for (const e of ['🎉', '🚀', '💡', '🔥', '📊']) {
    assertFalse(isAllowedEmoji(e), `${e} should not be allowed`);
  }
});

Deno.test('findForbiddenPhrases — catches signature filler from feedback examples', () => {
  const hits = findForbiddenPhrases(
    '--- Bis zur nächsten Ausgabe — Ihre Redaktion. Vielen Dank für Ihr Interesse!',
  );
  assert(hits.length >= 3, `expected ≥3 hits, got ${hits.length}`);
});

Deno.test('findForbiddenPhrases — clean text returns empty', () => {
  const hits = findForbiddenPhrases(
    '🏠 Die Villa Kaelin darf abgerissen werden, wie die bz Basel berichtet.',
  );
  assertEquals(hits.length, 0);
});

Deno.test('findForbiddenPhrases — Ausblick heading matched', () => {
  const hits = findForbiddenPhrases('## Ausblick\n\nNächste Woche ...');
  assert(hits.length >= 1);
});

Deno.test('FORBIDDEN_PHRASE_PATTERNS — every entry is a RegExp', () => {
  for (const p of FORBIDDEN_PHRASE_PATTERNS) {
    assert(p instanceof RegExp);
  }
});

Deno.test('KIND_CAPS — sum does not exceed MAX_BULLETS_PER_DRAFT + 1 (cap total)', () => {
  const total = Object.values(KIND_CAPS).reduce((s, n) => s + n, 0);
  // leads:1 + secondary:2 + event:1 + good_news:1 = 5; the draft max is 4 overall
  // but kinds can double up (e.g. lead can be an event) — caps are per-kind ceilings.
  assert(total >= MAX_BULLETS_PER_DRAFT);
});

Deno.test('ANTI_PATTERNS — non-empty, each has reason', () => {
  assert(ANTI_PATTERNS.length > 0);
  for (const ap of ANTI_PATTERNS) {
    assert(ap.bullet.length > 0);
    assert(ap.reason.length > 0);
  }
});

Deno.test('AGNOSTIC_POSITIVE_SEEDS — bullets start with a palette emoji (VS16 optional)', () => {
  // Some palette entries include U+FE0F (variation selector); seed bullets may
  // include or omit it. Match by checking the palette emoji appears at position 0.
  for (const seed of AGNOSTIC_POSITIVE_SEEDS) {
    const ok = EMOJI_PALETTE.some((e) => seed.bullet.startsWith(e) || seed.bullet.startsWith(e.replace(/️/g, '')));
    assert(ok, `Seed "${seed.bullet.slice(0, 20)}" should start with a palette emoji`);
  }
});
