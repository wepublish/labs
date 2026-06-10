import { describe, it, expect } from 'vitest';
import { redact, REDACTED } from '../src/redact.js';

describe('redact', () => {
  it('masks nested secret-named keys, keeps benign scalars', () => {
    const out = redact({
      siteName: 'Tsüri',
      url: 'https://tsri.ch',
      apiKey: 'abc123',
      payment: { stripeSecret: 'shh', provider: 'stripe' },
    });
    expect(out.siteName).toBe('Tsüri');
    expect(out.url).toBe('https://tsri.ch');
    expect(out.apiKey).toBe(REDACTED);
    // whole subtree under a sensitive key is masked
    expect((out.payment as Record<string, unknown>).stripeSecret).toBe(
      REDACTED
    );
  });

  it('handles arrays and null', () => {
    const out = redact({
      tokens: ['a', 'b'],
      items: [{ name: 'x' }, { name: 'y' }],
      missing: null,
    });
    expect(out.tokens).toEqual([REDACTED, REDACTED]);
    expect(out.items).toEqual([{ name: 'x' }, { name: 'y' }]);
    expect(out.missing).toBeNull();
  });

  it('masks known secret value shapes even under a benign key', () => {
    const out = redact({
      note: 'sk_live_ABCDEF123456',
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4',
      webhook: 'whsec_AB12cd34EF',
      ok: 'just text',
    });
    expect(out.note).toBe(REDACTED);
    expect(out.jwt).toBe(REDACTED);
    // 'webhook' is also a sensitive key
    expect(out.webhook).toBe(REDACTED);
    expect(out.ok).toBe('just text');
  });

  it('never emits a value containing a live secret prefix', () => {
    const serialized = JSON.stringify(
      redact({
        config: {
          stripeKey: 'sk_live_DEADBEEF00',
          member: { email: 'a@b.ch' },
        },
      })
    );
    expect(serialized).not.toContain('sk_live');
    expect(serialized).not.toContain('a@b.ch');
  });
});
