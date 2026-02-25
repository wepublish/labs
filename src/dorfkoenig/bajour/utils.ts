import type { BajourDraft, VerificationStatus } from './types';

/**
 * Optimistic display status: if timeout has passed and still ausstehend,
 * show as bestätigt while waiting for server-side resolution.
 */
export function displayStatus(draft: BajourDraft): VerificationStatus {
  if (
    draft.verification_status === 'ausstehend' &&
    draft.verification_timeout_at &&
    new Date(draft.verification_timeout_at).getTime() < Date.now()
  ) {
    return 'bestätigt';
  }
  return draft.verification_status;
}
