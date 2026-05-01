import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  constantTimeEqual,
  isInternalRequest,
  requireInternalRequest,
} from '../../_shared/internal-auth.ts';

Deno.test('constantTimeEqual compares equal and unequal strings', () => {
  assertEquals(constantTimeEqual('secret', 'secret'), true);
  assertEquals(constantTimeEqual('secret', 'public'), false);
  assertEquals(constantTimeEqual('secret', 'secret-longer'), false);
});

Deno.test({
  name: 'isInternalRequest accepts configured internal secret bearer token',
  permissions: { env: true },
  fn() {
    Deno.env.set('INTERNAL_FUNCTION_SECRET', 'internal-secret');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');

    const req = new Request('https://example.test', {
      headers: { authorization: 'Bearer internal-secret' },
    });

    assertEquals(isInternalRequest(req), true);
    Deno.env.delete('INTERNAL_FUNCTION_SECRET');
  },
});

Deno.test({
  name: 'requireInternalRequest rejects missing bearer token',
  permissions: { env: true },
  async fn() {
    Deno.env.set('INTERNAL_FUNCTION_SECRET', 'internal-secret');

    const res = requireInternalRequest(new Request('https://example.test'));
    assertEquals(res?.status, 401);
    assertEquals(await res?.json(), {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });

    Deno.env.delete('INTERNAL_FUNCTION_SECRET');
  },
});
