// Pure (Deno-free) HMAC helpers for signed admin draft links.
// Uses the Web Crypto API which is available in both Deno and Node 20+.
// Vitest imports this module directly; the `admin-link.ts` entry injects the secret.

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SignedAdminLink {
  draftId: string;
  exp: number;
  sig: string;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  if (!secret) throw new Error('HMAC secret is required');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  );
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signAdminDraftLinkWith(
  secret: string,
  draftId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<SignedAdminLink> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacHex(secret, `${draftId}:${exp}`);
  return { draftId, exp, sig };
}

export async function verifyAdminDraftLinkWith(
  secret: string,
  draftId: string,
  exp: number,
  sig: string
): Promise<{ valid: boolean; reason?: 'expired' | 'bad_signature' | 'bad_input' }> {
  if (!draftId || !Number.isFinite(exp) || !sig) {
    return { valid: false, reason: 'bad_input' };
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }
  let expected: string;
  try {
    expected = await hmacHex(secret, `${draftId}:${exp}`);
  } catch {
    return { valid: false, reason: 'bad_input' };
  }
  if (!constantTimeEqual(expected, sig)) {
    return { valid: false, reason: 'bad_signature' };
  }
  return { valid: true };
}

export function buildAdminDraftUrl(
  publicAppUrl: string,
  link: SignedAdminLink
): string {
  const base = publicAppUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    draft: link.draftId,
    sig: link.sig,
    exp: String(link.exp),
  });
  return `${base}/?${params.toString()}#/feed`;
}
