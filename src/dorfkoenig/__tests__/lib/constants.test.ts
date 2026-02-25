import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FREQUENCY_OPTIONS,
  FREQUENCY_OPTIONS_EXTENDED,
  DAY_OF_WEEK_OPTIONS,
  UNIT_TYPE_LABELS,
  EXECUTION_STATUS_LABELS,
  CHANGE_STATUS_LABELS,
  PRESET_USERS,
  formatDate,
  formatRelativeTime,
} from '../../lib/constants';

describe('FREQUENCY_OPTIONS', () => {
  it('contains daily, weekly, and monthly with German labels', () => {
    expect(FREQUENCY_OPTIONS).toEqual([
      { value: 'daily', label: 'Täglich' },
      { value: 'weekly', label: 'Wöchentlich' },
      { value: 'monthly', label: 'Monatlich' },
    ]);
  });
});

describe('FREQUENCY_OPTIONS_EXTENDED', () => {
  it('contains daily, weekly, biweekly, and monthly with German labels', () => {
    expect(FREQUENCY_OPTIONS_EXTENDED).toEqual([
      { value: 'daily', label: 'Täglich' },
      { value: 'weekly', label: 'Wöchentlich' },
      { value: 'biweekly', label: 'Alle 2 Wochen' },
      { value: 'monthly', label: 'Monatlich' },
    ]);
  });

  it('includes biweekly which FREQUENCY_OPTIONS does not', () => {
    const extendedValues = FREQUENCY_OPTIONS_EXTENDED.map(o => o.value);
    const basicValues = FREQUENCY_OPTIONS.map(o => o.value);
    expect(extendedValues).toContain('biweekly');
    expect(basicValues).not.toContain('biweekly');
  });
});

describe('DAY_OF_WEEK_OPTIONS', () => {
  it('contains all 7 days of the week', () => {
    expect(DAY_OF_WEEK_OPTIONS).toHaveLength(7);
  });

  it('starts with Monday (German convention)', () => {
    expect(DAY_OF_WEEK_OPTIONS[0]).toEqual({ value: 'monday', label: 'Montag' });
  });

  it('ends with Sunday', () => {
    expect(DAY_OF_WEEK_OPTIONS[6]).toEqual({ value: 'sunday', label: 'Sonntag' });
  });

  it('has unique values', () => {
    const values = DAY_OF_WEEK_OPTIONS.map(o => o.value);
    expect(new Set(values).size).toBe(7);
  });
});

describe('UNIT_TYPE_LABELS', () => {
  it('maps fact to Fakt', () => {
    expect(UNIT_TYPE_LABELS.fact).toBe('Fakt');
  });

  it('maps event to Ereignis', () => {
    expect(UNIT_TYPE_LABELS.event).toBe('Ereignis');
  });

  it('maps entity_update to Aktualisierung', () => {
    expect(UNIT_TYPE_LABELS.entity_update).toBe('Aktualisierung');
  });
});

describe('EXECUTION_STATUS_LABELS', () => {
  it('maps running to Läuft', () => {
    expect(EXECUTION_STATUS_LABELS.running).toBe('Läuft');
  });

  it('maps completed to Abgeschlossen', () => {
    expect(EXECUTION_STATUS_LABELS.completed).toBe('Abgeschlossen');
  });

  it('maps failed to Fehlgeschlagen', () => {
    expect(EXECUTION_STATUS_LABELS.failed).toBe('Fehlgeschlagen');
  });
});

describe('CHANGE_STATUS_LABELS', () => {
  it('maps changed to Geändert', () => {
    expect(CHANGE_STATUS_LABELS.changed).toBe('Geändert');
  });

  it('maps same to Unverändert', () => {
    expect(CHANGE_STATUS_LABELS.same).toBe('Unverändert');
  });

  it('maps first_run to Erster Lauf', () => {
    expect(CHANGE_STATUS_LABELS.first_run).toBe('Erster Lauf');
  });
});

describe('PRESET_USERS', () => {
  it('has 3 users', () => {
    expect(PRESET_USERS).toHaveLength(3);
  });

  it('has We.Publish Redaktion as the first user', () => {
    expect(PRESET_USERS[0]).toEqual({
      id: '493c6d51531c7444365b0ec094bc2d67',
      name: 'We.Publish Redaktion',
    });
  });
});

describe('formatDate', () => {
  it('returns "Nie" for null', () => {
    expect(formatDate(null)).toBe('Nie');
  });

  it('formats an ISO date string in German DD.MM.YYYY pattern', () => {
    const result = formatDate('2024-03-15T10:30:00Z');
    // Should contain DD.MM.YYYY pattern with dots as separators
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    // Should contain the date components for March 15, 2024
    expect(result).toContain('03');
    expect(result).toContain('2024');
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Gerade eben" for less than 1 minute ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:30Z'));

    expect(formatRelativeTime('2024-06-01T12:00:00Z')).toBe('Gerade eben');
  });

  it('returns "vor N Min." for less than 1 hour ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:15:00Z'));

    expect(formatRelativeTime('2024-06-01T12:00:00Z')).toBe('vor 15 Min.');
  });

  it('returns "vor N Std." for less than 1 day ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T15:00:00Z'));

    expect(formatRelativeTime('2024-06-01T12:00:00Z')).toBe('vor 3 Std.');
  });

  it('returns "vor N Tagen" for less than 1 week ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-04T12:00:00Z'));

    expect(formatRelativeTime('2024-06-01T12:00:00Z')).toBe('vor 3 Tagen');
  });

  it('returns formatted date for 1 week or more ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

    const result = formatRelativeTime('2024-06-01T12:00:00Z');
    // Should fall through to formatDate, which returns a DD.MM.YYYY pattern
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});
