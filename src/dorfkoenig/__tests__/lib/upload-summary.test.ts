import { describe, expect, it } from 'vitest';

import { formatUploadSuccessDetails } from '../../lib/upload-summary';

describe('formatUploadSuccessDetails', () => {
  it('reports saved units without duplicates', () => {
    expect(formatUploadSuccessDetails(1)).toBe('1 Informationseinheit gespeichert');
    expect(formatUploadSuccessDetails(21)).toBe('21 Informationseinheiten gespeichert');
  });

  it('reports saved units and detected duplicates', () => {
    expect(formatUploadSuccessDetails(21, 2)).toBe('21 Informationseinheiten gespeichert, 2 Duplikate erkannt');
    expect(formatUploadSuccessDetails(0, 1)).toBe('0 Informationseinheiten gespeichert, 1 Duplikat erkannt');
  });
});
