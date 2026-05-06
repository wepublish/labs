import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  dedupeSelectionCandidates,
  enforceMandatorySelection,
  rankSelectionCandidates,
  refineSelectionForCompose,
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

Deno.test('rankSelectionCandidates treats generation-day events as past for next-morning issues', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'evening-event',
      statement: 'Am Sonntag findet ein Konzert im Dorfzentrum statt.',
      unit_type: 'event',
      event_date: '2026-05-03',
      created_at: '2026-05-03T15:00:00Z',
      publication_date: '2026-05-03',
      quality_score: 75,
      sensitivity: 'none',
      article_url: 'https://example.ch/event',
      is_listing_page: false,
      village_confidence: 'high',
      source_domain: 'Gemeinde',
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
  });

  assert(ranked[0].reasons.includes('past_event'));
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

Deno.test('rankSelectionCandidates downranks static directory facts', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'police-address',
      statement: 'Die Gemeindepolizei Münchenstein befindet sich an der Schulackerstr. 4, 4142 Münchenstein.',
      unit_type: 'fact',
      publication_date: '2026-05-01',
      quality_score: 65,
      article_url: 'https://www.muenchenstein.ch/polizei',
      is_listing_page: false,
    },
    {
      id: 'trash',
      statement: 'Die Kehrichtabfuhr im Abfallkreis West fällt am 1. Mai 2026 aus und wird am 5. Mai 2026 nachgeholt.',
      unit_type: 'fact',
      publication_date: '2026-05-01',
      quality_score: 55,
      article_url: 'https://www.wochenblatt.ch/',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
  });

  assertEquals(ranked[0].unit.id, 'trash');
  const address = ranked.find((row) => row.unit.id === 'police-address');
  assert(address?.reasons.includes('static_directory_fact'));
  assertEquals(address?.mandatory, false);
});

Deno.test('rankSelectionCandidates treats source homepages as weak URLs', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'homepage',
      statement: 'Die Talstrasse durch Münchenstein und Arlesheim soll zur Kantonsstrasse ausgebaut werden.',
      unit_type: 'fact',
      publication_date: '2026-04-28',
      quality_score: 90,
      article_url: 'https://www.bzbasel.ch/',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-04-28',
    publicationDate: '2026-04-29',
    villageId: 'arlesheim',
  });

  assert(ranked[0].reasons.includes('weak_url'));
  assert(!ranked[0].reasons.includes('article_url'));
});

Deno.test('dedupeSelectionCandidates keeps distinct same-venue clinic events', () => {
  const result = dedupeSelectionCandidates([
    {
      id: 'starne',
      statement: 'Der Stärne-Treff findet am 4. Mai 2026 von 15 bis 17 Uhr im Café-Restaurant der Klinik Arlesheim statt.',
      unit_type: 'event',
      event_date: '2026-05-04',
      publication_date: '2026-05-01',
      quality_score: 55,
      article_url: 'https://www.wochenblatt.ch/',
      is_listing_page: false,
    },
    {
      id: 'onkologie',
      statement: 'Am Mittwoch, 6. Mai 2026, findet eine öffentliche Führung zur Onkologie in der Klinik Arlesheim statt.',
      unit_type: 'event',
      event_date: '2026-05-06',
      publication_date: '2026-05-01',
      quality_score: 55,
      article_url: 'https://www.wochenblatt.ch/',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
  });

  assertEquals(result.units.length, 2);
  assertEquals(result.rejected.length, 0);
});

Deno.test('rankSelectionCandidates penalizes cross-village drift and supporting fragments', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'bruggstrasse',
      statement: 'Das Strassenbau- und Abwasserprojekt Bruggstrasse Ost betrifft die Gemeinden Reinach und Aesch.',
      unit_type: 'fact',
      publication_date: '2026-04-28',
      quality_score: 85,
      article_url: 'https://example.com/bruggstrasse',
      is_listing_page: false,
    },
    {
      id: 'tram-passengers',
      statement: 'Die im Tram mitfahrenden Personen wurden nicht verletzt.',
      unit_type: 'fact',
      publication_date: '2026-04-28',
      quality_score: 80,
      article_url: 'https://example.com/tram',
      is_listing_page: false,
    },
    {
      id: 'local-road',
      statement: 'Am 5. Mai zwischen 8 und 17 Uhr findet eine Vollsperrung der Birkenstrasse statt.',
      unit_type: 'event',
      event_date: '2026-05-05',
      publication_date: '2026-04-28',
      quality_score: 80,
      article_url: 'https://example.com/road',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-04-27',
    publicationDate: '2026-04-28',
    villageId: 'arlesheim',
  });

  assertEquals(ranked[0].unit.id, 'local-road');
  assert(ranked.find((row) => row.unit.id === 'bruggstrasse')?.reasons.includes('cross_village_drift'));
  assert(ranked.find((row) => row.unit.id === 'tram-passengers')?.reasons.includes('supporting_fragment'));
});

Deno.test('refineSelectionForCompose drops weak context and caps compose inputs', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'lead',
      statement: 'Die Kehrichtabfuhr im Abfallkreis West fällt am 1. Mai aus und wird am 5. Mai nachgeholt.',
      unit_type: 'event',
      event_date: '2026-05-05',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/kehricht',
      is_listing_page: false,
    },
    {
      id: 'phone',
      statement: 'Die Telefonnummer der Gemeindeverwaltung Münchenstein ist 061 416 11 00.',
      unit_type: 'fact',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/phone',
      is_listing_page: false,
    },
    {
      id: 'address',
      statement: 'Die Gemeindepolizei Münchenstein befindet sich an der Schulackerstr. 4, 4142 Münchenstein.',
      unit_type: 'fact',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/address',
      is_listing_page: false,
    },
    {
      id: 'support',
      statement: 'Die im Tram mitfahrenden Personen wurden nicht verletzt.',
      unit_type: 'fact',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/support',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
    villageId: 'muenchenstein',
  });

  assertEquals(
    refineSelectionForCompose(['lead', 'phone', 'address', 'support'], ranked, 8),
    ['lead'],
  );
});

Deno.test('refineSelectionForCompose backfills thin local-news runs with soft events', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'kehricht',
      statement: 'Die Kehrichtabfuhr im Abfallkreis West fällt am 1. Mai aus und wird am 5. Mai nachgeholt.',
      unit_type: 'event',
      event_date: '2026-05-05',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/kehricht',
      is_listing_page: false,
    },
    {
      id: 'jass',
      statement: 'Am 6. Mai 2026 findet ein Jassturnier im Coop Restaurant des Einkaufszentrums Gartenstadt statt.',
      unit_type: 'event',
      event_date: '2026-05-06',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/jass',
      is_listing_page: false,
    },
    {
      id: 'laufgruppe',
      statement: 'Die Laufgruppe wird erstmalig am Donnerstag, 7. Mai 2026, angeboten.',
      unit_type: 'event',
      event_date: '2026-05-07',
      publication_date: '2026-04-30',
      quality_score: 80,
      article_url: 'https://example.com/lauf',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
    villageId: 'muenchenstein',
  });

  assertEquals(refineSelectionForCompose(['kehricht'], ranked, 8), ['kehricht', 'laufgruppe', 'jass']);
});

Deno.test('refineSelectionForCompose can backfill near-future article-backed events on thin days', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'roadworks',
      statement: 'Am 5. Mai zwischen 8 und 17 Uhr findet eine Vollsperrung der Birkenstrasse statt.',
      unit_type: 'event',
      event_date: '2026-05-05',
      publication_date: '2026-04-28',
      quality_score: 90,
      article_url: 'https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php',
      is_listing_page: false,
    },
    {
      id: 'meeting',
      statement: 'Der Gemeinderat informiert über eine neue Schulplanung.',
      unit_type: 'fact',
      publication_date: '2026-04-28',
      quality_score: 85,
      article_url: 'https://example.com/school',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-04-28',
    publicationDate: '2026-04-29',
    villageId: 'arlesheim',
  });

  const earlyEvent = ranked.find((row) => row.unit.id === 'roadworks');
  assert(earlyEvent?.reasons.includes('too_early_event'));
  assertEquals(refineSelectionForCompose(['roadworks', 'meeting'], ranked, 8), ['meeting', 'roadworks']);
});

Deno.test('refineSelectionForCompose drops units not yet published for simulated backfills', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'future',
      statement: 'In Arlesheim wird eine Autofahrerin bei einer Kollision mit einem Tram verletzt.',
      unit_type: 'fact',
      publication_date: '2026-05-01',
      quality_score: 95,
      sensitivity: 'accident',
      article_url: 'https://example.com/future',
      is_listing_page: false,
    },
    {
      id: 'available',
      statement: 'Die Gemeinde informiert über neue Bauarbeiten an der Hauptstrasse.',
      unit_type: 'fact',
      publication_date: '2026-04-28',
      quality_score: 75,
      article_url: 'https://example.com/available',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-04-28',
    publicationDate: '2026-04-29',
    villageId: 'arlesheim',
  });

  const future = ranked.find((row) => row.unit.id === 'future');
  assert(future?.reasons.includes('future_publication'));
  assertEquals(refineSelectionForCompose(['future', 'available'], ranked, 8), ['available']);
});

Deno.test('refineSelectionForCompose recovers from weak LLM picks with top local candidates', () => {
  const ranked = rankSelectionCandidates([
    {
      id: 'jass',
      statement: 'Am 6. Mai 2026 findet ein Jassturnier im Coop Restaurant des Einkaufszentrums Gartenstadt in Münchenstein statt.',
      unit_type: 'event',
      event_date: '2026-05-06',
      quality_score: 80,
      article_url: 'https://gartenstadt-muenchenstein.ch/de/aktuelles/jass-turnier-2026-997',
      is_listing_page: false,
    },
    {
      id: 'laufgruppe',
      statement: 'Die Laufgruppe wird erstmalig am Donnerstag, 7. Mai 2026, angeboten.',
      unit_type: 'event',
      event_date: '2026-05-07',
      publication_date: '2026-04-29',
      quality_score: 100,
      article_url: 'https://www.muenchenstein.ch/_rte/information/2844079',
      is_listing_page: false,
    },
    {
      id: 'walzwerk',
      statement: 'Am 9. Mai 2026 finden im Walzwerkareal Arealführungen statt.',
      unit_type: 'event',
      event_date: '2026-05-09',
      quality_score: 55,
      article_url: 'https://openhouse-basel.org/orte/walzwerk-2026/',
      is_listing_page: false,
    },
    {
      id: 'future-football',
      statement: 'Nach einem Juniorenspiel des FC Concordia Basel in Münchenstein kam es zu einem Streit.',
      unit_type: 'fact',
      event_date: '2026-05-05',
      publication_date: '2026-05-05',
      quality_score: 85,
      article_url: 'https://www.blick.ch/autoren/ralph-donghi-id15067851.html',
      is_listing_page: false,
    },
  ], {
    currentDate: '2026-05-03',
    publicationDate: '2026-05-04',
    villageId: 'muenchenstein',
  });

  assertEquals(refineSelectionForCompose(['future-football'], ranked, 8), ['laufgruppe', 'jass', 'walzwerk']);
});
