import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  deduplicateSimilarStatements,
  trigramSimilarity,
} from '../../_shared/embeddings.ts';

const sameVector = [1, 0, 0];
const nearVector = [0.99, 0.01, 0];

Deno.test('deduplicateSimilarStatements keeps unrelated facts with identical embeddings', () => {
  const statements = [
    'Der Gemeinderat Arlesheim genehmigt im April 2026 den Neubau des Werkhofs.',
    'Der Gemeinderat Arlesheim eröffnet im April 2026 eine neue Velostation am Bahnhof.',
  ];

  const unique = deduplicateSimilarStatements(
    statements,
    [sameVector, sameVector],
    0.93,
    0.7,
  );

  assertEquals(unique, [0, 1]);
});

Deno.test('deduplicateSimilarStatements merges close paraphrases only when text also matches', () => {
  const statements = [
    'Der Gemeinderat Arlesheim genehmigt im April 2026 den Neubau des Werkhofs.',
    'Im April 2026 genehmigt der Gemeinderat Arlesheim den Neubau des Werkhofs.',
  ];

  assert(trigramSimilarity(statements[0], statements[1]) >= 0.7);

  const unique = deduplicateSimilarStatements(
    statements,
    [sameVector, nearVector],
    0.93,
    0.7,
  );

  assertEquals(unique, [0]);
});
