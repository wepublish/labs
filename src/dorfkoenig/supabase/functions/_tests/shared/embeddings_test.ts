import {
  assertEquals,
  assertAlmostEquals,
  assertExists,
  assertThrows,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { embeddings } from '../../_shared/embeddings.ts';

// --- similarity (delegates to cosineSimilarity) ---

Deno.test('similarity returns 1.0 for identical vectors', () => {
  const v = [0.5, 0.3, 0.8, 0.1];
  assertAlmostEquals(embeddings.similarity(v, v), 1.0, 1e-10);
});

Deno.test('similarity returns 0.0 for orthogonal vectors', () => {
  const a = [1, 0];
  const b = [0, 1];
  assertAlmostEquals(embeddings.similarity(a, b), 0.0, 1e-10);
});

Deno.test('similarity returns -1.0 for opposite vectors', () => {
  const a = [1, 1];
  const b = [-1, -1];
  assertAlmostEquals(embeddings.similarity(a, b), -1.0, 1e-10);
});

Deno.test('similarity throws for mismatched vector lengths', () => {
  assertThrows(
    () => embeddings.similarity([1, 2], [1, 2, 3]),
    Error,
    'Vectors must have the same length',
  );
});

Deno.test('similarity returns 0 for zero vector input', () => {
  assertEquals(embeddings.similarity([0, 0], [1, 2]), 0);
});

// --- generate (integration, calls OpenRouter) ---

Deno.test({
  name: 'generate returns embedding array',
  ignore: !Deno.env.get('OPENROUTER_API_KEY'),
  async fn() {
    const embedding = await embeddings.generate('Test embedding generation');

    assertExists(embedding);
    assertEquals(Array.isArray(embedding), true);
    assertEquals(embedding.length, 1536);
    assertEquals(typeof embedding[0], 'number');
  },
});
