import { describe, expect, it } from 'vitest';
import {
  executionOutcome,
  executionUnitCounts,
  isAnyChangeMode,
} from '../../lib/execution-labels';
import type { Execution } from '../../lib/types';

function makeExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    id: 'exec-1',
    scout_id: 'scout-1',
    status: 'completed',
    started_at: '2026-05-06T10:00:00Z',
    completed_at: '2026-05-06T10:00:10Z',
    change_status: 'changed',
    criteria_matched: true,
    is_duplicate: false,
    duplicate_similarity: null,
    notification_sent: false,
    notification_error: null,
    units_extracted: 0,
    merged_existing_count: 0,
    scrape_duration_ms: 1000,
    summary_text: 'Zusammenfassung',
    error_message: null,
    ...overrides,
  };
}

describe('executionOutcome', () => {
  it('exposes the simple unit-count math', () => {
    expect(executionUnitCounts(makeExecution({ units_extracted: 2, merged_existing_count: 1 }))).toEqual({
      newUnits: 2,
      knownUnits: 1,
    });
  });

  it('labels same runs as unchanged even when a legacy forced run has units', () => {
    const outcome = executionOutcome(makeExecution({
      change_status: 'same',
      criteria_matched: true,
      units_extracted: 1,
      scout_criteria: '',
    }));

    expect(outcome).toMatchObject({
      kind: 'unchanged',
      label: 'Keine Änderung',
      detail: 'Seite unverändert',
      tone: 'same',
    });
  });

  it('labels changed runs with newly saved units as new units', () => {
    const outcome = executionOutcome(makeExecution({
      change_status: 'changed',
      criteria_matched: true,
      units_extracted: 1,
      scout_criteria: '',
    }));

    expect(outcome).toMatchObject({
      kind: 'new_units',
      label: 'Neue Einheiten',
      detail: 'Information gespeichert',
      tone: 'matched',
    });
  });

  it('labels deduped or duplicate changed runs as already known', () => {
    expect(executionOutcome(makeExecution({
      change_status: 'changed',
      merged_existing_count: 2,
      scout_criteria: '',
    }))).toMatchObject({
      kind: 'known',
      label: 'Bereits bekannt',
    });

    expect(executionOutcome(makeExecution({
      change_status: 'changed',
      is_duplicate: true,
      scout_criteria: '',
    }))).toMatchObject({
      kind: 'known',
      label: 'Bereits bekannt',
    });
  });

  it('labels changed any-change runs with no saved output as not usable', () => {
    const execution = makeExecution({
      change_status: 'changed',
      criteria_matched: true,
      scout_criteria: '',
    });

    expect(isAnyChangeMode(execution)).toBe(true);
    expect(executionOutcome(execution)).toMatchObject({
      kind: 'not_usable',
      label: 'Nichts Verwertbares',
      detail: 'Seite geändert, keine Einheit gespeichert',
      tone: 'changed',
    });
  });

  it('labels explicit-criteria misses as not relevant', () => {
    const outcome = executionOutcome(makeExecution({
      change_status: 'changed',
      criteria_matched: false,
      scout_criteria: 'Nur Bauprojekte',
    }));

    expect(outcome).toMatchObject({
      kind: 'not_relevant',
      label: 'Nicht relevant',
      detail: 'Kriterien nicht erfüllt',
    });
  });

  it('uses focused-scout criteria when list rows do not include criteria', () => {
    const execution = makeExecution({
      change_status: 'changed',
      criteria_matched: false,
      scout_criteria: undefined,
    });

    expect(executionOutcome(execution, '').kind).toBe('not_usable');
    expect(executionOutcome(execution, 'Nur Bauprojekte').kind).toBe('not_relevant');
  });
});
