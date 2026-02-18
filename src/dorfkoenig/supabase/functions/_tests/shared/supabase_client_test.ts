import {
  assertEquals,
  assertExists,
  assertThrows,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { getUserId, requireUserId, createServiceClient } from '../../_shared/supabase-client.ts';

// --- getUserId ---

Deno.test('getUserId extracts x-user-id header value', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-user-id': 'user-abc-123' },
  });

  assertEquals(getUserId(req), 'user-abc-123');
});

Deno.test('getUserId returns null without x-user-id header', () => {
  const req = new Request('http://localhost');

  assertEquals(getUserId(req), null);
});

Deno.test('getUserId returns null with empty headers', () => {
  const req = new Request('http://localhost', { headers: {} });

  assertEquals(getUserId(req), null);
});

Deno.test('getUserId returns value regardless of header casing', () => {
  // HTTP headers are case-insensitive; the Headers API normalizes them
  const req = new Request('http://localhost', {
    headers: { 'X-User-Id': 'user-456' },
  });

  assertEquals(getUserId(req), 'user-456');
});

// --- requireUserId ---

Deno.test('requireUserId returns user ID when x-user-id header is present', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-user-id': 'user-xyz-789' },
  });

  assertEquals(requireUserId(req), 'user-xyz-789');
});

Deno.test('requireUserId throws Authentication required when header is missing', () => {
  const req = new Request('http://localhost');

  assertThrows(
    () => requireUserId(req),
    Error,
    'Authentication required',
  );
});

Deno.test('requireUserId throws when headers object is empty', () => {
  const req = new Request('http://localhost', { headers: {} });

  assertThrows(
    () => requireUserId(req),
    Error,
    'Authentication required',
  );
});

// --- createServiceClient (integration test) ---

Deno.test({
  name: 'createServiceClient can query scouts table',
  ignore: !Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  async fn() {
    const client = createServiceClient();
    const { data, error } = await client.from('scouts').select('id').limit(1);

    // The query should succeed even if no rows exist
    assertEquals(error, null);
    assertExists(data);
    assertEquals(Array.isArray(data), true);
  },
});
