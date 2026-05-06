import type { Execution } from './types';

export type ExecutionTone = 'running' | 'failed' | 'same' | 'matched' | 'known' | 'changed';
export type ExecutionOutcomeKind =
  | 'running'
  | 'failed'
  | 'new_units'
  | 'known'
  | 'unchanged'
  | 'not_relevant'
  | 'not_usable';

type BadgeVariant = 'matched' | 'duplicate' | 'neutral' | 'error' | 'warning';

export interface ExecutionOutcome {
  kind: ExecutionOutcomeKind;
  /** Short chip label. This is the primary editorial outcome. */
  label: string;
  /** One-line explanation shown next to the chip. Counts remain separate. */
  detail: string;
  /** Visual tone used by the run-log row. */
  tone: ExecutionTone;
  /** Badge variant used by compact execution cards. */
  badgeVariant: BadgeVariant;
}

export interface ExecutionUnitCounts {
  /** Canonical information units newly inserted by this run. */
  newUnits: number;
  /** Existing canonical units this run matched/merged into. */
  knownUnits: number;
}

function executionCriteria(execution: Execution, fallbackCriteria?: string | null): string | null | undefined {
  return fallbackCriteria ?? execution.scout_criteria ?? execution.scout?.criteria;
}

export function executionUnitCounts(execution: Execution): ExecutionUnitCounts {
  return {
    newUnits: Math.max(0, execution.units_extracted ?? 0),
    knownUnits: Math.max(0, execution.merged_existing_count ?? 0),
  };
}

export function isAnyChangeMode(execution: Execution, fallbackCriteria?: string | null): boolean {
  const criteria = executionCriteria(execution, fallbackCriteria);
  return criteria !== undefined && criteria !== null && criteria.trim() === '';
}

function hasExplicitCriteria(execution: Execution, fallbackCriteria?: string | null): boolean {
  const criteria = executionCriteria(execution, fallbackCriteria);
  return criteria !== undefined && criteria !== null && criteria.trim() !== '';
}

/**
 * Convert raw pipeline fields into one editorial outcome.
 *
 * Keep this precedence simple:
 * 1. Infrastructure states win first: running / failed.
 * 2. `change_status === same` means the source page did not change. It stays
 *    "Keine Änderung" even if a legacy/forced run has counts attached.
 * 3. Explicit-criteria scouts can be "Nicht relevant" when the page changed
 *    but the criteria did not match. "Jede Änderung" scouts never use this.
 * 4. Saved extraction output is the useful signal:
 *    `newUnits > 0` means "Neue Einheiten".
 * 5. Deduped extraction output, or a duplicate summary, means "Bereits bekannt".
 * 6. A changed page with no saved/deduped units means "Nichts Verwertbares".
 */
export function executionOutcome(execution: Execution, fallbackCriteria?: string | null): ExecutionOutcome {
  const { newUnits, knownUnits } = executionUnitCounts(execution);

  if (execution.status === 'running') {
    return {
      kind: 'running',
      label: 'Läuft',
      detail: 'Wird geprüft',
      tone: 'running',
      badgeVariant: 'warning',
    };
  }

  if (execution.status === 'failed') {
    return {
      kind: 'failed',
      label: 'Fehler',
      detail: 'Run fehlgeschlagen',
      tone: 'failed',
      badgeVariant: 'error',
    };
  }

  if (execution.change_status === 'same') {
    return {
      kind: 'unchanged',
      label: 'Keine Änderung',
      detail: 'Seite unverändert',
      tone: 'same',
      badgeVariant: 'neutral',
    };
  }

  if (hasExplicitCriteria(execution, fallbackCriteria) && execution.criteria_matched === false) {
    return {
      kind: 'not_relevant',
      label: 'Nicht relevant',
      detail: 'Kriterien nicht erfüllt',
      tone: 'changed',
      badgeVariant: 'neutral',
    };
  }

  if (newUnits > 0) {
    return {
      kind: 'new_units',
      label: 'Neue Einheiten',
      detail: 'Information gespeichert',
      tone: 'matched',
      badgeVariant: 'matched',
    };
  }

  if (knownUnits > 0 || execution.is_duplicate) {
    return {
      kind: 'known',
      label: 'Bereits bekannt',
      detail: 'Schon im Bestand',
      tone: 'known',
      badgeVariant: 'duplicate',
    };
  }

  return {
    kind: 'not_usable',
    label: 'Nichts Verwertbares',
    detail: 'Seite geändert, keine Einheit gespeichert',
    tone: 'changed',
    badgeVariant: 'warning',
  };
}
