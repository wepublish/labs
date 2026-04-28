import {
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import { buildComposeFeedbackExamples } from '../../_shared/feedback-retrieval.ts';

Deno.test('buildComposeFeedbackExamples prioritizes village examples before static fallbacks', () => {
  const result = buildComposeFeedbackExamples({
    rows: [
      {
        kind: 'positive',
        bullet_text: '🏠 Lokales positives Beispiel.',
        editor_reason: null,
        created_at: '2026-04-23T10:00:00Z',
      },
      {
        kind: 'negative',
        bullet_text: 'Bis zur nächsten Ausgabe — Ihre Redaktion',
        editor_reason: 'Verbotene Grussformel',
        created_at: '2026-04-23T09:00:00Z',
      },
    ],
    fallbackPositiveExamples: [
      { bullet: '🏗️ Statisches Positivbeispiel.', source_domain: 'Fallback' },
    ],
    fallbackAntiPatterns: [
      { bullet: 'Statisches Negativbeispiel', reason: 'Fallback' },
    ],
    maxPositiveExamples: 2,
    maxNegativeExamples: 2,
  });

  assertEquals(result.positiveExamples[0].bullet, '🏠 Lokales positives Beispiel.');
  assertEquals(result.positiveExamples[1].bullet, '🏗️ Statisches Positivbeispiel.');
  assertEquals(result.antiPatterns[0].bullet, 'Bis zur nächsten Ausgabe — Ihre Redaktion');
  assertEquals(result.antiPatterns[0].reason, 'Verbotene Grussformel');
  assertEquals(result.antiPatterns[1].bullet, 'Statisches Negativbeispiel');
});

Deno.test('buildComposeFeedbackExamples de-duplicates repeated bullets', () => {
  const result = buildComposeFeedbackExamples({
    rows: [
      {
        kind: 'positive',
        bullet_text: '🏠 Gleiches Beispiel',
        editor_reason: null,
        created_at: '2026-04-23T10:00:00Z',
      },
      {
        kind: 'positive',
        bullet_text: '🏠 Gleiches Beispiel',
        editor_reason: null,
        created_at: '2026-04-22T10:00:00Z',
      },
      {
        kind: 'negative',
        bullet_text: 'Doppelter Negativsatz',
        editor_reason: 'A',
        created_at: '2026-04-23T09:00:00Z',
      },
      {
        kind: 'negative',
        bullet_text: 'Doppelter Negativsatz',
        editor_reason: 'B',
        created_at: '2026-04-22T09:00:00Z',
      },
    ],
    fallbackPositiveExamples: [],
    fallbackAntiPatterns: [],
  });

  assertEquals(result.positiveExamples.length, 1);
  assertEquals(result.antiPatterns.length, 1);
  assertEquals(result.villagePositiveCount, 2);
  assertEquals(result.villageNegativeCount, 2);
});

Deno.test('buildComposeFeedbackExamples ignores atomic externally-published fragments', () => {
  const result = buildComposeFeedbackExamples({
    rows: [
      {
        kind: 'positive',
        bullet_text: 'Tickets für das Stück gibt es im Ticket-Shop.',
        editor_reason: 'Externally published',
        created_at: '2026-04-26T10:00:00Z',
      },
      {
        kind: 'positive',
        bullet_text: '🚧 Fertiges redaktionelles Bullet.',
        editor_reason: 'Goldstandard',
        created_at: '2026-04-23T10:00:00Z',
      },
    ],
    fallbackPositiveExamples: [],
    fallbackAntiPatterns: [],
  });

  assertEquals(result.positiveExamples.map((e) => e.bullet), [
    '🚧 Fertiges redaktionelles Bullet.',
  ]);
  assertEquals(result.villagePositiveCount, 1);
});
