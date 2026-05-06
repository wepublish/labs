import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  assessDraftQuality,
  resolveDraftRunContext,
  selectFallbackUnitIds,
} from '../../_shared/auto-draft-quality.ts';
import {
  isWeekdayPublicationDate,
  nextPublicationDateFromZurichRunDate,
  nextValidPublicationDateAfter,
} from '../../_shared/publication-calendar.ts';
import type { DraftV2 } from '../../_shared/draft-quality.ts';
import type { RankedSelectionUnit } from '../../_shared/selection-ranking.ts';

function ranked(overrides: Partial<RankedSelectionUnit> & { id: string; statement?: string }): RankedSelectionUnit {
  return {
    unit: {
      id: overrides.id,
      statement: overrides.statement ?? `Statement ${overrides.id}`,
      unit_type: 'event',
    },
    score: 80,
    mandatory: false,
    reasons: ['article_url'],
    ...overrides,
  } as RankedSelectionUnit;
}

function draft(overrides: Partial<DraftV2> = {}): DraftV2 {
  return {
    title: 'Arlesheim — Verkehr',
    bullets: [
      {
        emoji: '🚧',
        kind: 'lead',
        text: 'Die Birkenstrasse ist am Dienstag gesperrt, meldet die Gemeinde.',
        article_url: 'https://example.com/a',
        source_domain: 'Gemeinde',
        source_unit_ids: ['u1'],
      },
    ],
    notes_for_editor: [],
    ...overrides,
  };
}

Deno.test('publication calendar — automatic run maps Sunday to Monday', () => {
  assertEquals(nextPublicationDateFromZurichRunDate('2026-05-03'), '2026-05-04');
});

Deno.test('publication calendar — automatic run maps Thursday to Friday', () => {
  assertEquals(nextPublicationDateFromZurichRunDate('2026-05-07'), '2026-05-08');
});

Deno.test('publication calendar — automatic run skips Friday and Saturday', () => {
  assertEquals(nextPublicationDateFromZurichRunDate('2026-05-08'), null);
  assertEquals(nextPublicationDateFromZurichRunDate('2026-05-09'), null);
});

Deno.test('publication calendar — only Monday through Friday are publication dates', () => {
  assertEquals(isWeekdayPublicationDate('2026-05-04'), true);
  assertEquals(isWeekdayPublicationDate('2026-05-08'), true);
  assertEquals(isWeekdayPublicationDate('2026-05-09'), false);
  assertEquals(isWeekdayPublicationDate('2026-05-10'), false);
});

Deno.test('publication calendar — default manual date skips weekends', () => {
  assertEquals(nextValidPublicationDateAfter('2026-05-08'), '2026-05-11');
});

Deno.test('resolveDraftRunContext — normal cron drafts for next weekday issue', () => {
  assertEquals(resolveDraftRunContext({ zurichToday: '2026-05-03' }), {
    runDate: '2026-05-03',
    publicationDate: '2026-05-04',
    isBackfill: false,
  });
});

Deno.test('resolveDraftRunContext — normal cron has no issue after Friday or Saturday', () => {
  assertEquals(resolveDraftRunContext({ zurichToday: '2026-05-08' }), {
    runDate: '2026-05-08',
    publicationDate: null,
    isBackfill: false,
  });
  assertEquals(resolveDraftRunContext({ zurichToday: '2026-05-09' }), {
    runDate: '2026-05-09',
    publicationDate: null,
    isBackfill: false,
  });
});

Deno.test('resolveDraftRunContext — backfill derives run date from publication date', () => {
  assertEquals(resolveDraftRunContext({
    zurichToday: '2026-05-05',
    requestedPublicationDate: '2026-05-04',
  }), {
    runDate: '2026-05-03',
    publicationDate: '2026-05-04',
    isBackfill: true,
  });
});

Deno.test('resolveDraftRunContext — weekend backfill has no publication date', () => {
  assertEquals(resolveDraftRunContext({
    zurichToday: '2026-05-05',
    requestedPublicationDate: '2026-05-09',
  }), {
    runDate: '2026-05-08',
    publicationDate: null,
    isBackfill: true,
  });
});

Deno.test('selectFallbackUnitIds — excludes weak, negative, and duplicate candidates', () => {
  const ids = selectFallbackUnitIds([
    ranked({ id: 'strong-1', score: 105, reasons: ['article_url'], statement: 'Am 9. Mai finden Arealführungen im Walzwerk statt.' }),
    ranked({ id: 'dupe', score: 100, reasons: ['article_url'], statement: 'Am 9. Mai 2026 findet im Walzwerk eine Arealführung statt.' }),
    ranked({ id: 'weak-url', score: 80, reasons: ['weak_url'] }),
    ranked({ id: 'negative', score: -20, reasons: ['stale', 'weak_url'] }),
    ranked({ id: 'strong-2', score: 95, reasons: ['public_safety'] }),
  ], 8);

  assertEquals(ids, ['strong-1', 'strong-2']);
});

Deno.test('assessDraftQuality — withholds title/body mismatch', () => {
  const result = assessDraftQuality({
    draft: draft({ title: 'Vollsperrungen, Landrat und Villa-Abbruch' }),
    selectedUnits: [],
    rankedSelection: [],
    selectedIds: [],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'title_body_mismatch'));
});

Deno.test('assessDraftQuality — withholds severe editor notes', () => {
  const result = assessDraftQuality({
    draft: draft({ notes_for_editor: ['Villa-Abbruch: Bitte verifizieren und URL ergänzen.'] }),
    selectedUnits: [],
    rankedSelection: [],
    selectedIds: [],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'missing_required_context'));
});

Deno.test('assessDraftQuality — withholds explicit missing source-link notes', () => {
  const result = assessDraftQuality({
    draft: draft({ notes_for_editor: ['Chorkonzert: kein Link verfügbar, bitte Quelle prüfen.'] }),
    selectedUnits: [],
    rankedSelection: [],
    selectedIds: [],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'weak_sources'));
});

Deno.test('assessDraftQuality — warns but sends locally relevant no-link notes', () => {
  const result = assessDraftQuality({
    draft: draft({
      title: 'Birkenstrasse und Gemeindekommission',
      notes_for_editor: [
        'Einheit 2: Personalie Gemeindekommission — URL:NO_LINK, daher ohne Markdown-Link formuliert. Quality 60, aber lokal relevant und aktuell.',
      ],
      bullets: [
        {
          emoji: '🚧',
          kind: 'lead',
          text: 'Morgen ist die Birkenstrasse gesperrt.',
          article_url: 'https://example.com/road',
          source_domain: 'Gemeinde',
          source_unit_ids: ['road'],
        },
        {
          emoji: '🏛️',
          kind: 'secondary',
          text: 'Michael Honegger übernimmt einen Sitz in der Gemeindekommission.',
          article_url: null,
          source_domain: 'manual',
          source_unit_ids: ['civic'],
        },
      ],
    }),
    selectedUnits: [
      { id: 'road', statement: 'Am Dienstag ist die Birkenstrasse gesperrt.', unit_type: 'event', article_url: 'https://example.com/road' },
      { id: 'civic', statement: 'Michael Honegger übernimmt einen Sitz in der Gemeindekommission.', unit_type: 'fact' },
    ],
    rankedSelection: [ranked({ id: 'road', score: 100 }), ranked({ id: 'civic', score: 120, reasons: ['civic_utility', 'weak_url'] })],
    selectedIds: ['road', 'civic'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'send');
  assert(result.warnings.some((w) => w.reason === 'weak_sources' && w.severity === 'warning'));
});

Deno.test('assessDraftQuality — withholds bullet that drops available article URL', () => {
  const result = assessDraftQuality({
    draft: draft({
      title: 'Kehrichtabfuhr nachgeholt',
      bullets: [
        {
          emoji: '📍',
          kind: 'lead',
          text: 'Die Kehrichtabfuhr im Abfallkreis West wird morgen nachgeholt.',
          article_url: null,
          source_domain: 'wochenblatt.ch',
          source_unit_ids: ['u1'],
        },
      ],
    }),
    selectedUnits: [{
      id: 'u1',
      statement: 'Die Kehrichtabfuhr im Abfallkreis West fällt am 1. Mai 2026 aus und wird am 5. Mai 2026 nachgeholt.',
      unit_type: 'fact',
      article_url: 'https://www.wochenblatt.ch/kehrichtabfuhr',
      source_url: 'https://www.wochenblatt.ch/kehrichtabfuhr',
    }],
    rankedSelection: [ranked({ id: 'u1', score: 105 })],
    selectedIds: ['u1'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'weak_sources'));
});

Deno.test('assessDraftQuality — clean draft sends', () => {
  const result = assessDraftQuality({
    draft: draft({ title: 'Birkenstrasse gesperrt' }),
    selectedUnits: [{
      id: 'u1',
      statement: 'Am Dienstag ist die Birkenstrasse gesperrt.',
      unit_type: 'event',
      article_url: 'https://example.com/a',
      source_url: 'https://example.com/a',
    }],
    rankedSelection: [ranked({ id: 'u1', score: 100 })],
    selectedIds: ['u1'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'send');
});

Deno.test('assessDraftQuality — accepts actionable no-link municipal service event with relative timing', () => {
  const result = assessDraftQuality({
    draft: draft({
      title: 'Rüttiweg gesperrt',
      bullets: [
        {
          emoji: '🚧',
          kind: 'lead',
          text: 'Der Rüttiweg sowie der Kreuzungsbereich Rüttiweg und Waldstrasse sind ab heute bis Mittwoch ganztägig gesperrt.',
          article_url: null,
          source_domain: 'wochenblatt.ch',
          source_unit_ids: ['road'],
        },
      ],
    }),
    selectedUnits: [{
      id: 'road',
      statement: 'Der Rüttiweg sowie der Kreuzungsbereich Rüttiweg und Waldstrasse sind ab Montag, 4. Mai 2026, bis Mittwoch, 6. Mai 2026, ganztägig gesperrt.',
      unit_type: 'event',
      event_date: '2026-05-04',
      article_url: 'https://www.wochenblatt.ch/',
      source_url: 'https://www.wochenblatt.ch/',
    }],
    rankedSelection: [ranked({ id: 'road', score: 80, reasons: ['today_event', 'weak_url'] })],
    selectedIds: ['road'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'send');
});

Deno.test('assessDraftQuality — accepts no-link civic event with source date and clear institution', () => {
  const result = assessDraftQuality({
    draft: draft({
      title: 'Honegger im Landrat',
      bullets: [
        {
          emoji: '🏛️',
          kind: 'lead',
          text: 'Michael Honegger aus Arlesheim wird heute im Landrat angelobt.',
          article_url: null,
          source_domain: 'manual',
          source_unit_ids: ['landrat'],
        },
      ],
    }),
    selectedUnits: [{
      id: 'landrat',
      statement: 'Michael Honegger aus Arlesheim wird am 7. Mai 2026 im Landrat angelobt.',
      unit_type: 'event',
      event_date: '2026-05-07',
      article_url: null,
      source_url: 'manual://pdf',
      source_domain: 'manual',
    }],
    rankedSelection: [ranked({ id: 'landrat', score: 90, reasons: ['today_event', 'weak_url'] })],
    selectedIds: ['landrat'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-06' }),
  });

  assertEquals(result.decision, 'send');
});

Deno.test('assessDraftQuality — still withholds vague no-link event without timing and place', () => {
  const result = assessDraftQuality({
    draft: draft({
      title: 'Anlass geplant',
      bullets: [
        {
          emoji: '📅',
          kind: 'lead',
          text: 'Ein Anlass ist geplant.',
          article_url: null,
          source_domain: 'manual',
          source_unit_ids: ['event'],
        },
      ],
    }),
    selectedUnits: [{
      id: 'event',
      statement: 'Ein Anlass ist geplant.',
      unit_type: 'event',
    }],
    rankedSelection: [ranked({ id: 'event', score: 80, reasons: ['weak_url'] })],
    selectedIds: ['event'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'missing_required_context' && w.severity === 'blocker'));
});

Deno.test('assessDraftQuality — does not require non-mandatory selected fragments', () => {
  const result = assessDraftQuality({
    draft: draft({ title: 'Birkenstrasse gesperrt' }),
    selectedUnits: [{
      id: 'u1',
      statement: 'Am Dienstag ist die Birkenstrasse gesperrt.',
      unit_type: 'event',
      article_url: 'https://example.com/a',
      source_url: 'https://example.com/a',
    }, {
      id: 'support',
      statement: 'Die Haltestelle für die Anreise mit dem Tram ist Stollenrain.',
      unit_type: 'fact',
      article_url: 'https://example.com/support',
      source_url: 'https://example.com/support',
    }],
    rankedSelection: [
      ranked({ id: 'u1', score: 100, mandatory: true }),
      ranked({ id: 'support', score: 100, mandatory: false, reasons: ['supporting_fragment', 'article_url'] }),
    ],
    selectedIds: ['u1', 'support'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'send');
});

Deno.test('assessDraftQuality — warns on event-only digest without news lead', () => {
  const result = assessDraftQuality({
    draft: draft({
      title: 'Jassturnier und Chorkonzert',
      bullets: [
        {
          emoji: '📅',
          kind: 'lead',
          text: 'Am Mittwoch findet im Coop Restaurant ein Jassturnier statt.',
          article_url: 'https://example.com/jass',
          source_domain: 'example.com',
          source_unit_ids: ['u1'],
        },
        {
          emoji: '🎵',
          kind: 'secondary',
          text: 'Am Freitag findet in der katholischen Kirche ein Chorkonzert statt.',
          article_url: 'https://example.com/chor',
          source_domain: 'example.com',
          source_unit_ids: ['u2'],
        },
      ],
    }),
    selectedUnits: [
      { id: 'u1', statement: 'Am 6. Mai findet ein Jassturnier statt.', unit_type: 'event' },
      { id: 'u2', statement: 'Am 8. Mai findet ein Chorkonzert statt.', unit_type: 'event' },
      { id: 'u3', statement: 'Am 7. Mai startet eine Laufgruppe.', unit_type: 'event' },
    ],
    rankedSelection: [],
    selectedIds: ['u1', 'u2', 'u3'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'send');
  assert(result.warnings.some((w) => w.reason === 'not_enough_data'));
});
