import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  dedupeSelectionCandidates,
  enforceMandatorySelection,
  rankSelectionCandidates,
  selectDeterministicFallback,
} from '../../_shared/selection-ranking.ts';

Deno.test('rankSelectionCandidates prioritizes fresh Arlesheim accident over filler', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'accident',
      statement: 'Bei einer Kollision zwischen Tram und Personenwagen in Arlesheim wurde die Personenwagenlenkerin verletzt.',
      unit_type: 'fact',
      created_at: '2026-04-27T11:13:00Z',
      publication_date: '2026-04-27',
      quality_score: 90,
      sensitivity: 'accident',
      article_url: 'https://www.baselland.ch/polizei/polizeimeldungen/kollision',
      is_listing_page: false,
      village_confidence: 'high',
      source_domain: 'Polizei Basel-Landschaft',
    },
    {
      id: 'birthday',
      statement: 'Margaretha und Urs Müller feiern morgen ihre diamantene Hochzeit.',
      unit_type: 'event',
      event_date: '2026-04-29',
      created_at: '2026-04-27T10:00:00Z',
      publication_date: '2026-04-27',
      quality_score: 40,
      sensitivity: 'none',
      article_url: null,
      is_listing_page: false,
      village_confidence: 'high',
      source_domain: 'arlesheim.ch',
    },
    {
      id: 'swap',
      statement: 'Morgen öffnet das Hol- und Bringhäuschen beim Kindertreff.',
      unit_type: 'event',
      event_date: '2026-04-29',
      created_at: '2026-04-27T10:00:00Z',
      publication_date: '2026-04-27',
      quality_score: 40,
      sensitivity: 'none',
      article_url: null,
      is_listing_page: false,
      village_confidence: 'high',
      source_domain: 'arlesheim.ch',
    },
  ], {
    currentDate: '2026-04-27',
    publicationDate: '2026-04-28',
  });

  assertEquals(ranked[0].unit.id, 'accident');
  assert(ranked[0].mandatory);
  assert(ranked[0].score > ranked[1].score);
});

Deno.test('mandatory high-value units survive truncation', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'accident',
      statement: 'Die Polizei meldet einen Verkehrsunfall mit verletzter Person in Arlesheim.',
      unit_type: 'fact',
      created_at: '2026-04-27T11:13:00Z',
      publication_date: '2026-04-27',
      quality_score: 90,
      sensitivity: 'accident',
      article_url: 'https://example.ch/article',
      is_listing_page: false,
      village_confidence: 'high',
      source_domain: 'Polizei',
    },
    {
      id: 'filler',
      statement: 'Ein Verein lädt zu Kaffee ein.',
      unit_type: 'event',
      event_date: '2026-04-28',
      created_at: '2026-04-27T10:00:00Z',
      publication_date: '2026-04-27',
      quality_score: 80,
      sensitivity: 'none',
      article_url: 'https://example.ch/filler',
      is_listing_page: false,
      village_confidence: 'high',
      source_domain: 'Gemeinde',
    },
  ], {
    currentDate: '2026-04-27',
    publicationDate: '2026-04-28',
  });

  assertEquals(selectDeterministicFallback(ranked, 1), ['accident']);
  assertEquals(enforceMandatorySelection(['filler'], ranked, 1), ['accident']);
});

Deno.test('dedupeSelectionCandidates collapses near-identical event listings', () => {
  const result = dedupeSelectionCandidates([
    {
      id: 'walzwerk-1',
      statement: 'Am 9. Mai 2026 finden im Walzwerkareal Arealführungen statt.',
      unit_type: 'event',
      event_date: '2026-05-09',
      publication_date: '2026-05-01',
      quality_score: 55,
      article_url: 'https://openhouse-basel.org/orte/walzwerk-2026/',
      is_listing_page: false,
    },
    {
      id: 'walzwerk-2',
      statement: 'Am Samstag, 9. Mai 2026, finden Arealführungen im Walzwerkareal in Münchenstein statt.',
      unit_type: 'event',
      event_date: '2026-05-09',
      publication_date: '2026-05-01',
      quality_score: 55,
      article_url: 'https://openhouse-basel.org/orte/walzwerk-2026/',
      is_listing_page: false,
    },
    {
      id: 'dreispitz',
      statement: 'Die Planung für den Dreispitz in Münchenstein geht in die nächste Runde.',
      unit_type: 'fact',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://www.wochenblatt.ch/',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
  });

  assertEquals(result.units.length, 2);
  assert(result.rejected.some((row) => row.id === 'walzwerk-1' || row.id === 'walzwerk-2'));
  assert(result.units.some((unit) => unit.id === 'dreispitz'));
});
