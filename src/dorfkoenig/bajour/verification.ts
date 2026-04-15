// Pure verification-status resolution rules.
//
// Mirrors the authoritative logic in the `append_bajour_response` Postgres RPC
// (migration 20260416000006). Kept here so the behaviour is unit-testable
// without spinning up Deno or the database.

import type { VerificationStatus } from './types';

export type { VerificationStatus };

export interface ResolvableResponse {
  response: 'bestätigt' | 'abgelehnt';
}

export function resolveVerificationStatus(
  responses: ResolvableResponse[]
): VerificationStatus {
  if (responses.some((r) => r.response === 'abgelehnt')) return 'abgelehnt';
  if (responses.some((r) => r.response === 'bestätigt')) return 'bestätigt';
  return 'ausstehend';
}
