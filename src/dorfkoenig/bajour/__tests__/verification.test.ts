import { describe, it, expect } from 'vitest';
import { resolveVerificationStatus } from '../verification';

describe('resolveVerificationStatus — any reject wins, single confirm suffices', () => {
  it('returns ausstehend when there are no responses', () => {
    expect(resolveVerificationStatus([])).toBe('ausstehend');
  });

  it('returns abgelehnt on a single reject', () => {
    expect(resolveVerificationStatus([{ response: 'abgelehnt' }])).toBe('abgelehnt');
  });

  it('returns bestätigt on a single confirm with no rejects', () => {
    expect(resolveVerificationStatus([{ response: 'bestätigt' }])).toBe('bestätigt');
  });

  it('returns bestätigt on multiple confirms with no rejects', () => {
    expect(
      resolveVerificationStatus([
        { response: 'bestätigt' },
        { response: 'bestätigt' },
      ])
    ).toBe('bestätigt');
  });

  it('returns abgelehnt when one reject sits among confirms', () => {
    expect(
      resolveVerificationStatus([
        { response: 'bestätigt' },
        { response: 'abgelehnt' },
      ])
    ).toBe('abgelehnt');
  });

  it('returns abgelehnt even when confirms outnumber rejects', () => {
    expect(
      resolveVerificationStatus([
        { response: 'bestätigt' },
        { response: 'bestätigt' },
        { response: 'bestätigt' },
        { response: 'abgelehnt' },
      ])
    ).toBe('abgelehnt');
  });
});
