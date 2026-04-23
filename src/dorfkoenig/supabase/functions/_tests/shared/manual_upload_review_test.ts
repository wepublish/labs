import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  sanitizeReviewUnit,
  sanitizeReviewUnits,
} from '../../_shared/manual-upload-review.ts';

Deno.test('sanitizeReviewUnit normalizes string null confidence and invalid type', () => {
  const unit = sanitizeReviewUnit({
    uid: 'u-1',
    statement: 'Die Baukommission legt die Einsprachefrist bis zum 13. Mai 2026 fest.',
    unit_type: 'municipal_notices',
    entities: ['Baukommission Hochwald'],
    event_date: '2026-05-13',
    date_confidence: 'exact',
    location: { city: 'hochwald', country: 'Schweiz' },
    village_confidence: 'null',
    assignment_path: 'llm_high',
    review_required: false,
  });

  assertExists(unit);
  assertEquals(unit.unit_type, 'fact');
  assertEquals(unit.village_confidence, null);
});

Deno.test('sanitizeReviewUnit drops malformed location and entities noise', () => {
  const unit = sanitizeReviewUnit({
    uid: 'u-2',
    statement: 'Am Sonntag findet der Anlass statt.',
    unit_type: 'event',
    entities: [' Anlass ', 42, '', null],
    event_date: 'not-a-date',
    date_confidence: 'null',
    location: { city: '   ', country: 'Schweiz', latitude: '47.5' },
    village_confidence: 'medium',
    assignment_path: null,
    review_required: 'yes',
  });

  assertExists(unit);
  assertEquals(unit.entities, ['Anlass']);
  assertEquals(unit.event_date, null);
  assertEquals(unit.date_confidence, null);
  assertEquals(unit.location, null);
  assertEquals(unit.review_required, false);
});

Deno.test('sanitizeReviewUnits drops entries missing uid or statement', () => {
  const result = sanitizeReviewUnits([
    {
      uid: 'u-3',
      statement: 'Die Gemeinde eröffnet am 1. Mai den neuen Spielplatz.',
      unit_type: 'event',
      entities: [],
      event_date: '2026-05-01',
      date_confidence: 'exact',
      location: { city: 'aesch' },
      village_confidence: 'high',
      assignment_path: 'llm_high',
      review_required: false,
    },
    {
      uid: '',
      statement: 'Ungültig ohne UID',
      unit_type: 'fact',
      entities: [],
      review_required: false,
    },
    {
      uid: 'u-4',
      statement: '   ',
      unit_type: 'fact',
      entities: [],
      review_required: false,
    },
  ]);

  assertEquals(result.units.length, 1);
  assertEquals(result.dropped, 2);
  assertEquals(result.units[0].uid, 'u-3');
});
