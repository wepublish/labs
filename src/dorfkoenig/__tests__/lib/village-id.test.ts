import { describe, expect, it } from 'vitest';
import { normalizeCity } from '../../supabase/functions/_shared/village-id';
import gemeinden from '../../lib/gemeinden.json';

describe('normalizeCity', () => {
  it('lowercases an already-ASCII name', () => {
    expect(normalizeCity('Arlesheim')).toBe('arlesheim');
  });

  it('replaces German umlauts (ä/ö/ü) with ae/oe/ue', () => {
    expect(normalizeCity('Münchenstein')).toBe('muenchenstein');
    expect(normalizeCity('Äsch')).toBe('aesch');
    expect(normalizeCity('Öhningen')).toBe('oehningen');
  });

  it('replaces ß with ss', () => {
    expect(normalizeCity('Straße')).toBe('strasse');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCity('  Arlesheim  ')).toBe('arlesheim');
  });

  it('returns empty string for empty / null / undefined', () => {
    expect(normalizeCity('')).toBe('');
    expect(normalizeCity(null)).toBe('');
    expect(normalizeCity(undefined)).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeCity('Münchenstein');
    expect(normalizeCity(once)).toBe(once);
  });

  // Load-bearing contract: the UI passes `v.name` (display form) to edge
  // functions, which normalize via this helper and match against the stored
  // `id` form. If any village's `name` no longer normalizes to its `id`, the
  // location filter breaks silently.
  describe('gemeinden.json contract', () => {
    for (const v of gemeinden as Array<{ id: string; name: string }>) {
      it(`normalizeCity('${v.name}') === '${v.id}'`, () => {
        expect(normalizeCity(v.name)).toBe(v.id);
      });
    }
  });
});
