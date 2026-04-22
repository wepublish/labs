/**
 * Tests for the §3.5 deterministic post-validation chain.
 */

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  runValidatorChain,
  validateEmojiPalette,
  validateForbiddenPhrases,
  validateKindCounts,
  validateUrlWhitelist,
  type Bullet,
  type BulletKind,
  type DraftV2,
} from '../../_shared/draft-quality.ts';

function bullet(overrides: Partial<Bullet> = {}): Bullet {
  return {
    emoji: '🏠',
    kind: 'lead',
    text: 'Beispieltext für ein Bullet.',
    article_url: null,
    source_domain: 'bz Basel',
    source_unit_ids: ['u1'],
    ...overrides,
  };
}

function draft(bullets: Bullet[]): DraftV2 {
  return { title: 'Test', bullets, notes_for_editor: [] };
}

// --- validateUrlWhitelist ----------------------------------------------------

Deno.test('validateUrlWhitelist — strips link not in allowlist, keeps label', () => {
  const { draft: out, warnings } = validateUrlWhitelist(
    draft([bullet({ text: 'Meldung [bz Basel](https://evil.com/x) heute.' })]),
    ['https://www.bzbasel.ch/ld.123'],
  );
  assertFalse(out.bullets[0].text.includes('evil.com'));
  assert(out.bullets[0].text.includes('bz Basel'));
  assertEquals(warnings.length, 1);
});

Deno.test('validateUrlWhitelist — keeps link in allowlist unchanged', () => {
  const url = 'https://www.bzbasel.ch/ld.123';
  const { draft: out, warnings } = validateUrlWhitelist(
    draft([bullet({ text: `Meldung [bz Basel](${url}) heute.` })]),
    [url],
  );
  assert(out.bullets[0].text.includes(url));
  assertEquals(warnings.length, 0);
});

Deno.test('validateUrlWhitelist — strips article_url not in allowlist', () => {
  const { draft: out } = validateUrlWhitelist(
    draft([bullet({ article_url: 'https://evil.com/x' })]),
    ['https://other.com/a'],
  );
  assertEquals(out.bullets[0].article_url, null);
});

// --- validateForbiddenPhrases -----------------------------------------------

Deno.test('validateForbiddenPhrases — removes "Bis zur nächsten Ausgabe"', () => {
  const { draft: out, warnings } = validateForbiddenPhrases(
    draft([bullet({ text: 'Guter Satz. Bis zur nächsten Ausgabe — Ihre Redaktion.' })]),
  );
  assertFalse(out.bullets[0].text.includes('Bis zur nächsten Ausgabe'));
  assert(warnings.length >= 1);
});

Deno.test('validateForbiddenPhrases — drops bullet that becomes empty', () => {
  const { draft: out } = validateForbiddenPhrases(
    draft([bullet({ text: 'Bis zur nächsten Ausgabe' })]),
  );
  assertEquals(out.bullets.length, 0);
});

Deno.test('validateForbiddenPhrases — clean text untouched', () => {
  const clean = 'Die Villa Kaelin darf abgerissen werden.';
  const { draft: out, warnings } = validateForbiddenPhrases(
    draft([bullet({ text: clean })]),
  );
  assertEquals(out.bullets[0].text, clean);
  assertEquals(warnings.length, 0);
});

// --- validateEmojiPalette ----------------------------------------------------

Deno.test('validateEmojiPalette — palette emoji unchanged', () => {
  const { draft: out, warnings } = validateEmojiPalette(draft([bullet({ emoji: '🏠' })]));
  assertEquals(out.bullets[0].emoji, '🏠');
  assertEquals(warnings.length, 0);
});

Deno.test('validateEmojiPalette — non-palette replaced by kind-appropriate fallback', () => {
  const { draft: out, warnings } = validateEmojiPalette(
    draft([bullet({ emoji: '🚀', kind: 'event' })]),
  );
  assertEquals(out.bullets[0].emoji, '📅');
  assertEquals(warnings.length, 1);
});

// --- validateKindCounts ------------------------------------------------------

Deno.test('validateKindCounts — demotes second lead to secondary', () => {
  const { draft: out, warnings } = validateKindCounts(
    draft([
      bullet({ kind: 'lead' }),
      bullet({ kind: 'lead' }),
    ]),
  );
  assertEquals(out.bullets.length, 2);
  assertEquals(out.bullets[0].kind, 'lead');
  assertEquals(out.bullets[1].kind, 'secondary');
  assert(warnings[0].includes('herabgestuft'));
});

Deno.test('validateKindCounts — drops extra when caps and demotion both full', () => {
  const bullets: Bullet[] = ([
    ['lead', 'lead', 'lead', 'lead', 'lead'] as const,
  ])[0].map((k) => bullet({ kind: k as BulletKind }));
  const { draft: out, warnings } = validateKindCounts(draft(bullets));
  // lead:1 + secondary:2 = 3, rest discarded (also overall cap 4).
  assertEquals(out.bullets.length, 3);
  assert(warnings.length >= 2);
});

Deno.test('validateKindCounts — respects MAX_BULLETS_PER_DRAFT=4', () => {
  const bullets: Bullet[] = [
    bullet({ kind: 'lead' }),
    bullet({ kind: 'secondary' }),
    bullet({ kind: 'secondary' }),
    bullet({ kind: 'event' }),
    bullet({ kind: 'good_news' }),
  ];
  const { draft: out, warnings } = validateKindCounts(draft(bullets));
  assertEquals(out.bullets.length, 4);
  assert(warnings.some((w) => w.includes('Gesamtmaximum')));
});

// --- runValidatorChain -------------------------------------------------------

Deno.test('runValidatorChain — combined pipeline demotes extra lead + strips filler (bullet survives) + replaces bad emoji', () => {
  const allowed = ['https://www.bzbasel.ch/ld.123'];
  const input = draft([
    bullet({
      kind: 'lead',
      text: 'Eine echte Meldung [bz Basel](https://www.bzbasel.ch/ld.123).',
      emoji: '🏠',
    }),
    bullet({
      kind: 'lead',
      text: 'Zweite lead wird herabgestuft.',
      emoji: '🏠',
    }),
    bullet({
      kind: 'secondary',
      text: 'Wichtig bleibt stehen. Bis zur nächsten Ausgabe — Ihre Redaktion.',
      emoji: '🚀',
    }),
  ]);
  const out = runValidatorChain(input, allowed);

  // Filler removed in place, bullets keep their non-filler prose, kinds demoted, emoji replaced.
  assertEquals(out.bullets.length, 3);
  assertEquals(out.bullets[0].kind, 'lead');
  assertEquals(out.bullets[1].kind, 'secondary');
  assertEquals(out.bullets[2].kind, 'secondary');
  assertFalse(out.bullets.some((b) => b.text.includes('Bis zur nächsten Ausgabe')));
  assertFalse(out.bullets.some((b) => b.emoji === '🚀'));
  assert(out.notes_for_editor.length > 0);
});

Deno.test('runValidatorChain — drops bullet that becomes fully empty after filler removal', () => {
  const input = draft([
    bullet({ kind: 'lead', text: 'Eine gute Meldung.', emoji: '🏠' }),
    bullet({ kind: 'secondary', text: 'Bis zur nächsten Ausgabe', emoji: '📍' }),
  ]);
  const out = runValidatorChain(input, []);
  assertEquals(out.bullets.length, 1);
  assertEquals(out.bullets[0].kind, 'lead');
});

Deno.test('runValidatorChain — empty input passes through cleanly', () => {
  const out = runValidatorChain(draft([]), []);
  assertEquals(out.bullets.length, 0);
  assertEquals(out.notes_for_editor.length, 0);
});
