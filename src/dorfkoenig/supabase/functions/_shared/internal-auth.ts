import { errorResponse } from './cors.ts';

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

export function isInternalRequest(req: Request): boolean {
  const token = bearerToken(req);
  if (!token) return false;

  const accepted = [
    Deno.env.get('INTERNAL_FUNCTION_SECRET'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  ].filter((value): value is string => Boolean(value));

  return accepted.some((secret) => constantTimeEqual(token, secret));
}

export function requireInternalRequest(req: Request): Response | null {
  if (isInternalRequest(req)) return null;
  return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
}
