/**
 * Idempotency policy for automatic Bajour drafts.
 *
 * Blocking statuses are drafts that are already in the editorial/verification
 * flow. Review artifacts (`withheld`) and rejected drafts can be regenerated
 * for the same village/date after a quality-gate or content fix.
 */

export const AUTO_DRAFT_BLOCKING_STATUSES = ['ausstehend', 'bestätigt'] as const;

export type AutoDraftBlockingStatus = typeof AUTO_DRAFT_BLOCKING_STATUSES[number];

export function blocksAutoDraftRerun(status: string | null | undefined): status is AutoDraftBlockingStatus {
  return AUTO_DRAFT_BLOCKING_STATUSES.includes(status as AutoDraftBlockingStatus);
}
