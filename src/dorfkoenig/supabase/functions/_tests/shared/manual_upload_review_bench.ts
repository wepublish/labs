import {
  sanitizeReviewUnits,
} from '../../_shared/manual-upload-review.ts';

const makeUnit = (index: number) => ({
  uid: `unit-${index}`,
  statement: `Die Gemeinde publiziert Ereignis Nummer ${index} fuer das Test-Setup.`,
  unit_type: index % 17 === 0 ? 'municipal_notices' : 'event',
  entities: ['Gemeinde', index % 11 === 0 ? '' : `Ereignis ${index}`],
  event_date: index % 7 === 0 ? 'bad-date' : '2026-05-01',
  date_confidence: index % 13 === 0 ? 'null' : 'exact',
  location: index % 5 === 0 ? null : { city: 'aesch', country: 'Schweiz' },
  village_confidence: index % 9 === 0 ? 'null' : 'high',
  assignment_path: 'llm_high',
  review_required: false,
});

const fixture = Array.from({ length: 500 }, (_, index) => makeUnit(index));

Deno.bench('sanitizeReviewUnits mixed staged payload', () => {
  sanitizeReviewUnits(fixture);
});
