// Deno entry for signed admin draft links. Reads the HMAC secret from env
// and delegates to the pure core (admin-link-core.ts).

import {
  signAdminDraftLinkWith,
  verifyAdminDraftLinkWith,
  buildAdminDraftUrl as buildAdminDraftUrlCore,
  type SignedAdminLink,
} from './admin-link-core.ts';

export type { SignedAdminLink };

const ADMIN_LINK_SECRET = Deno.env.get('ADMIN_LINK_SECRET') ?? '';

export function signAdminDraftLink(
  draftId: string,
  ttlSeconds?: number
): Promise<SignedAdminLink> {
  return signAdminDraftLinkWith(ADMIN_LINK_SECRET, draftId, ttlSeconds);
}

export function verifyAdminDraftLink(
  draftId: string,
  exp: number,
  sig: string
): Promise<{ valid: boolean; reason?: 'expired' | 'bad_signature' | 'bad_input' }> {
  return verifyAdminDraftLinkWith(ADMIN_LINK_SECRET, draftId, exp, sig);
}

export const buildAdminDraftUrl = buildAdminDraftUrlCore;
