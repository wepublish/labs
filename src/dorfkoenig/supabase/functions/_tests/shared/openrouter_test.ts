import {
  assertEquals,
  assertAlmostEquals,
  assertExists,
  assertRejects,
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

Deno.test('chat aborts when the client-side timeout is exceeded', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = Deno.env.get('OPENROUTER_API_KEY');

  Deno.env.set('OPENROUTER_API_KEY', originalApiKey ?? 'test-key');
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as typeof fetch;

  try {
    await assertRejects(
      async () => {
        await chat({
          messages: [{ role: 'user', content: 'timeout' }],
          timeout_ms: 5,
        });
      },
      Error,
      'timed out',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      Deno.env.delete('OPENROUTER_API_KEY');
    } else {
      Deno.env.set('OPENROUTER_API_KEY', originalApiKey);
    }
  }
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
