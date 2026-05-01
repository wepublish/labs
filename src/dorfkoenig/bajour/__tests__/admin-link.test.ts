import { describe, it, expect } from 'vitest';
import {
  signAdminDraftLinkWith,
  verifyAdminDraftLinkWith,
  constantTimeEqual,
  buildAdminDraftUrl,
} from '../../supabase/functions/_shared/admin-link-core';

const SECRET = 'a'.repeat(64);
const DRAFT_ID = '11111111-2222-3333-4444-555555555555';

describe('admin-link HMAC helpers', () => {
  it('verifies a freshly signed link', async () => {
    const link = await signAdminDraftLinkWith(SECRET, DRAFT_ID);
    const check = await verifyAdminDraftLinkWith(SECRET, link.draftId, link.exp, link.sig);
    expect(check.valid).toBe(true);
  });

  it('rejects an expired link', async () => {
    const link = await signAdminDraftLinkWith(SECRET, DRAFT_ID);
    const pastExp = Math.floor(Date.now() / 1000) - 60;
    const check = await verifyAdminDraftLinkWith(SECRET, link.draftId, pastExp, link.sig);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('expired');
  });

  it('rejects a tampered signature', async () => {
    const link = await signAdminDraftLinkWith(SECRET, DRAFT_ID);
    const flipped =
      link.sig.slice(0, -1) + (link.sig.endsWith('0') ? '1' : '0');
    const check = await verifyAdminDraftLinkWith(SECRET, link.draftId, link.exp, flipped);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('bad_signature');
  });

  it('rejects a tampered draft id', async () => {
    const link = await signAdminDraftLinkWith(SECRET, DRAFT_ID);
    const otherId = '99999999-9999-9999-9999-999999999999';
    const check = await verifyAdminDraftLinkWith(SECRET, otherId, link.exp, link.sig);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('bad_signature');
  });

  it('rejects missing inputs', async () => {
    const check = await verifyAdminDraftLinkWith(SECRET, '', 0, '');
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('bad_input');
  });

  it('rejects signatures signed under a different secret', async () => {
    const link = await signAdminDraftLinkWith(SECRET, DRAFT_ID);
    const check = await verifyAdminDraftLinkWith('b'.repeat(64), link.draftId, link.exp, link.sig);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('bad_signature');
  });

  describe('constantTimeEqual', () => {
    it('returns true for identical strings', () => {
      expect(constantTimeEqual('abc', 'abc')).toBe(true);
    });

    it('returns false for same-length different strings', () => {
      expect(constantTimeEqual('abc', 'abd')).toBe(false);
    });

    it('returns false for different-length strings (no throw)', () => {
      expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    });
  });

  describe('buildAdminDraftUrl', () => {
    it('builds the expected URL shape', () => {
      const url = buildAdminDraftUrl('https://wepublish.github.io/labs/dorfkoenig', {
        draftId: DRAFT_ID,
        exp: 1700000000,
        sig: 'deadbeef',
      });
      expect(url).toBe(
        `https://wepublish.github.io/labs/dorfkoenig/?draft=${DRAFT_ID}&sig=deadbeef&exp=1700000000#/drafts`
      );
    });

    it('trims trailing slashes on the base URL', () => {
      const url = buildAdminDraftUrl('https://example.com/app///', {
        draftId: DRAFT_ID,
        exp: 1700000000,
        sig: 'x',
      });
      expect(url).toBe(
        `https://example.com/app/?draft=${DRAFT_ID}&sig=x&exp=1700000000#/drafts`
      );
    });
  });
});
