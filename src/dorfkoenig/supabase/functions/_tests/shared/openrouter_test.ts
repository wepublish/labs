import {
  assertEquals,
  assertAlmostEquals,
  assertExists,
  assertThrows,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { cosineSimilarity, chat, generateEmbedding } from '../../_shared/openrouter.ts';

// --- cosineSimilarity (pure function tests) ---

Deno.test('cosineSimilarity returns 1.0 for identical vectors', () => {
  const v = [1, 2, 3, 4, 5];
  assertAlmostEquals(cosineSimilarity(v, v), 1.0, 1e-10);
});

Deno.test('cosineSimilarity returns 0.0 for orthogonal vectors', () => {
  const a = [1, 0, 0];
  const b = [0, 1, 0];
  assertAlmostEquals(cosineSimilarity(a, b), 0.0, 1e-10);
});

Deno.test('cosineSimilarity returns -1.0 for opposite vectors', () => {
  const a = [1, 2, 3];
  const b = [-1, -2, -3];
  assertAlmostEquals(cosineSimilarity(a, b), -1.0, 1e-10);
});

Deno.test('cosineSimilarity throws error for different length vectors', () => {
  const a = [1, 2, 3];
  const b = [1, 2];
  assertThrows(
    () => cosineSimilarity(a, b),
    Error,
    'Vectors must have the same length',
  );
});

Deno.test('cosineSimilarity returns 0 for zero vector', () => {
  const zero = [0, 0, 0];
  const other = [1, 2, 3];
  assertEquals(cosineSimilarity(zero, other), 0);
});

Deno.test('cosineSimilarity returns 0 for two zero vectors', () => {
  const zero = [0, 0, 0];
  assertEquals(cosineSimilarity(zero, zero), 0);
});

Deno.test('cosineSimilarity computes correctly for known values', () => {
  const a = [1, 0];
  const b = [1, 1];
  // cos(45 degrees) = 1 / sqrt(2) ~ 0.7071
  assertAlmostEquals(cosineSimilarity(a, b), 1 / Math.sqrt(2), 1e-10);
});

// --- Integration tests (require API key) ---

Deno.test({
  name: 'chat returns valid response with choices',
  ignore: !Deno.env.get('OPENROUTER_API_KEY'),
  async fn() {
    const response = await chat({
      messages: [
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
      max_tokens: 10,
    });

    assertExists(response.id);
    assertExists(response.choices);
    assertEquals(response.choices.length > 0, true);
    assertExists(response.choices[0].message);
    assertExists(response.choices[0].message.content);
  },
});

Deno.test({
  name: 'generateEmbedding returns 1536-dimension array',
  ignore: !Deno.env.get('OPENROUTER_API_KEY'),
  async fn() {
    const embedding = await generateEmbedding('Hello world');

    assertExists(embedding);
    assertEquals(Array.isArray(embedding), true);
    assertEquals(embedding.length, 1536);
    assertEquals(typeof embedding[0], 'number');
  },
});
