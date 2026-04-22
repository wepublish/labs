/**
 * Vitest tests for _tests/bench/metrics.ts and adapter.ts.
 *
 * Purpose: exercise the pure scoring logic against known fixtures so any future edit
 * to metric thresholds or scoring shape fails loudly here before reaching CI.
 *
 * These run under Node (npm test); the corresponding Deno tests for backend-runtime
 * modules (compose-draft, draft-quality) live in supabase/functions/_tests/shared/.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregate,
  scoreFixture,
} from '../../supabase/functions/_tests/bench/metrics.ts';
import {
  adaptBulletDraft,
  adaptV1Draft,
} from '../../supabase/functions/_tests/bench/adapter.ts';
import type { Fixture } from '../../supabase/functions/_tests/bench/types.ts';

// --- Fixture builders --------------------------------------------------------

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    fixture_id: 'test-fixture',
    village_id: 'arlesheim',
    village_name: 'Arlesheim',
    edition_date: '2026-04-22',
    units: [
      {
        id: 'u1',
        statement: 'Beispieleinheit',
        unit_type: 'fact',
        entities: [],
        event_date: null,
        publication_date: '2026-04-20',
        created_at: '2026-04-20T10:00:00Z',
        location: { city: 'arlesheim', country: 'CH' },
        source_url: 'https://www.bzbasel.ch/basel/baselland/ld.4152854',
        source_domain: 'bz Basel',
        article_url: 'https://www.bzbasel.ch/basel/baselland/ld.4152854',
        is_listing_page: false,
        sensitivity: 'none',
        village_confidence: 'high',
        quality_score: 85,
      },
    ],
    gold: {
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Beispielsatz für das Gold-Bullet.',
          article_url: 'https://www.bzbasel.ch/basel/baselland/ld.4152854',
          source_domain: 'bz Basel',
          source_unit_ids: ['u1'],
        },
      ],
      rejected_units: [],
    },
    ...overrides,
  };
}

// --- bullet_count ------------------------------------------------------------

describe('scoreFixture — bullet_count', () => {
  it('passes when empty draft has editor note', async () => {
    const output = adaptBulletDraft({ bullets: [], notes_for_editor: ['Keine Einheiten'] });
    const results = await scoreFixture(makeFixture({ units: [], gold: { bullets: [], rejected_units: [] } }), output);
    const m = results.find((r) => r.name === 'bullet_count')!;
    expect(m.pass).toBe(true);
    expect(m.score).toBe(100);
  });

  it('fails when empty draft has no editor note', async () => {
    const output = adaptBulletDraft({ bullets: [], notes_for_editor: [] });
    const results = await scoreFixture(makeFixture({ units: [], gold: { bullets: [], rejected_units: [] } }), output);
    const m = results.find((r) => r.name === 'bullet_count')!;
    expect(m.pass).toBe(false);
  });

  it('fails when bullet count exceeds max (4)', async () => {
    const output = adaptBulletDraft({
      bullets: Array.from({ length: 5 }, (_, i) => ({
        emoji: '🏠',
        kind: 'secondary' as const,
        text: `Bullet ${i}`,
        article_url: null,
        source_unit_ids: [],
      })),
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'bullet_count')!;
    expect(m.pass).toBe(false);
  });
});

// --- no_filler ---------------------------------------------------------------

describe('scoreFixture — no_filler', () => {
  it('fails on forbidden "Bis zur nächsten Ausgabe" phrase', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Guter Bulletsatz. Bis zur nächsten Ausgabe — Ihre Redaktion.',
          article_url: null,
          source_unit_ids: [],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'no_filler')!;
    expect(m.pass).toBe(false);
  });

  it('passes on clean text', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Die Villa Kaelin darf abgerissen werden, wie die bz Basel berichtet.',
          article_url: null,
          source_unit_ids: [],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'no_filler')!;
    expect(m.pass).toBe(true);
  });
});

// --- url_whitelist -----------------------------------------------------------

describe('scoreFixture — url_whitelist', () => {
  it('passes when all cited URLs match units', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Beispielsatz [bz Basel](https://www.bzbasel.ch/basel/baselland/ld.4152854).',
          article_url: 'https://www.bzbasel.ch/basel/baselland/ld.4152854',
          source_unit_ids: ['u1'],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'url_whitelist')!;
    expect(m.pass).toBe(true);
  });

  it('fails when URL is not in unit set (invented by LLM)', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Beispielsatz [bz Basel](https://www.bzbasel.ch/made-up-url).',
          article_url: 'https://www.bzbasel.ch/made-up-url',
          source_unit_ids: ['u1'],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'url_whitelist')!;
    expect(m.pass).toBe(false);
  });

  it('passes trivially when no URLs cited', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🗳️',
          kind: 'secondary',
          text: 'Leserbrief ohne Online-Link, nur gedruckt.',
          article_url: null,
          source_unit_ids: ['u1'],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'url_whitelist')!;
    expect(m.pass).toBe(true);
  });
});

// --- url_article_quality -----------------------------------------------------

describe('scoreFixture — url_article_quality', () => {
  it('passes on article-level URL (ld.NNN pattern)', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Text [bz Basel](https://www.bzbasel.ch/basel/baselland/ld.4152854).',
          article_url: null,
          source_unit_ids: [],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'url_article_quality')!;
    expect(m.pass).toBe(true);
  });

  it('fails on listing-page URL (ends in /veranstaltungen/)', async () => {
    const fx = makeFixture({
      units: [
        {
          ...makeFixture().units[0],
          source_url: 'https://www.arlesheim.ch/de/veranstaltungen/',
          article_url: 'https://www.arlesheim.ch/de/veranstaltungen/',
        },
      ],
    });
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '📅',
          kind: 'event',
          text: 'Text [Gemeinde](https://www.arlesheim.ch/de/veranstaltungen/).',
          article_url: null,
          source_unit_ids: [],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(fx, output);
    const m = results.find((r) => r.name === 'url_article_quality')!;
    expect(m.pass).toBe(false);
  });
});

// --- cross_village_purity ----------------------------------------------------

describe('scoreFixture — cross_village_purity', () => {
  it('fails when bullet cites a unit from another village', async () => {
    const fx = makeFixture({
      units: [
        {
          ...makeFixture().units[0],
          id: 'u-mue',
          location: { city: 'muenchenstein', country: 'CH' },
        },
      ],
    });
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '⚖️',
          kind: 'lead',
          text: 'Spitex Münchenstein.',
          article_url: null,
          source_unit_ids: ['u-mue'],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(fx, output);
    const m = results.find((r) => r.name === 'cross_village_purity')!;
    expect(m.pass).toBe(false);
  });

  it('passes when all cited units are in-village', async () => {
    const output = adaptBulletDraft({
      bullets: [
        {
          emoji: '🏠',
          kind: 'lead',
          text: 'Arlesheimer Meldung.',
          article_url: null,
          source_unit_ids: ['u1'],
        },
      ],
      notes_for_editor: [],
    });
    const results = await scoreFixture(makeFixture(), output);
    const m = results.find((r) => r.name === 'cross_village_purity')!;
    expect(m.pass).toBe(true);
  });
});

// --- aggregate ---------------------------------------------------------------

describe('aggregate', () => {
  it('returns weighted average, rounded', () => {
    const metrics = [
      { name: 'a', pass: true, score: 100, weight: 20, detail: '' },
      { name: 'b', pass: true, score: 50, weight: 10, detail: '' },
    ];
    // (100*20 + 50*10) / 30 = 2500/30 = 83.33 → 83
    expect(aggregate(metrics)).toBe(83);
  });

  it('returns 0 for empty metric list', () => {
    expect(aggregate([])).toBe(0);
  });
});

// --- adapter: v1 draft -------------------------------------------------------

describe('adaptV1Draft', () => {
  it('extracts bullets from sections with URL extraction', () => {
    const draft = {
      greeting: 'Hallo',
      sections: [
        {
          heading: 'News',
          body:
            '🏠 Die Villa [bz Basel](https://example.com/article) berichtet.\n\n' +
            '🏗️ Bauarbeiten [Gemeinde](https://arlesheim.ch/bauinfo.pdf) laufen.',
        },
      ],
    };
    const body = '🏠 Die Villa [bz Basel](https://example.com/article) berichtet.';
    const out = adaptV1Draft(draft, body);
    // Each section becomes chunks → individual bullets
    expect(out.bullets.length).toBeGreaterThan(0);
    const urls = out.bullets.flatMap((b) => b.link_urls);
    expect(urls).toContain('https://example.com/article');
  });

  it('preserves filler text in body_text for banlist check', () => {
    const draft = {
      greeting: 'Liebe Leserinnen und Leser',
      sections: [],
    };
    const body = 'Liebe Leserinnen und Leser\n\nBis zur nächsten Ausgabe';
    const out = adaptV1Draft(draft, body);
    expect(out.body_text).toContain('Bis zur nächsten Ausgabe');
  });
});
