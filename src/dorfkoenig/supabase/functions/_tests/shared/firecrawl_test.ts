import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { getDomain, computeContentHash } from '../../_shared/firecrawl.ts';

// --- getDomain ---

Deno.test('getDomain extracts hostname from full URL', () => {
  assertEquals(getDomain('https://example.com/path/page'), 'example.com');
});

Deno.test('getDomain strips www. prefix', () => {
  assertEquals(getDomain('https://www.example.com/path'), 'example.com');
});

Deno.test('getDomain handles URLs without www.', () => {
  assertEquals(getDomain('https://blog.example.com'), 'blog.example.com');
});

Deno.test('getDomain returns input string on invalid URL', () => {
  assertEquals(getDomain('not-a-url'), 'not-a-url');
});

Deno.test('getDomain returns input string on empty string', () => {
  assertEquals(getDomain(''), '');
});

Deno.test('getDomain handles URLs with ports', () => {
  assertEquals(getDomain('http://localhost:3000/api'), 'localhost');
});

Deno.test('getDomain handles URLs with ports and paths', () => {
  assertEquals(getDomain('https://example.com:8080/api/v1?query=1'), 'example.com');
});

Deno.test('getDomain handles http scheme', () => {
  assertEquals(getDomain('http://www.news.example.org/article'), 'news.example.org');
});

Deno.test('getDomain handles URL with query parameters', () => {
  assertEquals(getDomain('https://www.example.com/path?foo=bar&baz=1'), 'example.com');
});

Deno.test('getDomain handles URL with fragment', () => {
  assertEquals(getDomain('https://www.example.com/page#section'), 'example.com');
});

// --- computeContentHash ---

Deno.test('computeContentHash returns consistent 64-char hex string', async () => {
  const hash = await computeContentHash('Hello World');
  assertEquals(hash.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(hash), true);

  // Same input → same output
  const hash2 = await computeContentHash('Hello World');
  assertEquals(hash, hash2);
});

Deno.test('computeContentHash produces different hashes for different content', async () => {
  const hash1 = await computeContentHash('Content A');
  const hash2 = await computeContentHash('Content B');
  assertEquals(hash1 !== hash2, true);
});

Deno.test('computeContentHash handles empty string', async () => {
  const hash = await computeContentHash('');
  assertEquals(hash.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(hash), true);
});

Deno.test('computeContentHash normalizes whitespace', async () => {
  const hash1 = await computeContentHash('Hello   World');
  const hash2 = await computeContentHash('Hello World');
  const hash3 = await computeContentHash('  Hello  World  ');
  assertEquals(hash1, hash2);
  assertEquals(hash2, hash3);
});

Deno.test('computeContentHash normalizes newlines and tabs', async () => {
  const hash1 = await computeContentHash('Line1\n\nLine2\t\tEnd');
  const hash2 = await computeContentHash('Line1 Line2 End');
  assertEquals(hash1, hash2);
});
