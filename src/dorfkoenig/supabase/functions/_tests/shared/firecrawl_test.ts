import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { getDomain } from '../../_shared/firecrawl.ts';

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
