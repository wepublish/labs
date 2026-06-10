/**
 * Typed transport to the We.Publish admin GraphQL API (single endpoint at `/v1`).
 *
 * Auth (verified against wepublish source, libs/authentication/api/.../session.strategy.ts):
 * a long-lived service token is treated as a peer/service session ONLY when the
 * request carries `User-Agent: We.Publish/1.0 Peering`. Without that exact UA the
 * token is looked up as a user session and fails. So every request sends the peer UA
 * plus `Authorization: Bearer <token>`. There is NO tenant header — tenancy is
 * per-deployment, so each upstream (apiUrl+token) already targets exactly one newsroom.
 *
 * Tools only ever receive the generated `Sdk` (one typed method per named operation);
 * there is no public `request(string)` path, so arbitrary GraphQL cannot be issued.
 */
import { GraphQLClient, ClientError } from 'graphql-request';
import { getSdk, type Sdk } from './generated/graphql.js';
import type { Upstream } from './config.js';

/** The typed client surface handed to tools (alias of the generated SDK). */
export type WePublishClient = Sdk;

/** Exact User-Agent that routes a token to the peer/service-session path. */
export const PEER_USER_AGENT = 'We.Publish/1.0 Peering';

export type ApiErrorCode = 'graphql_error' | 'timeout' | 'network_error';

export class WePublishApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly graphQLErrors?: unknown
  ) {
    super(message);
    this.name = 'WePublishApiError';
  }
}

/** Auth + peer-session headers for a request. */
export function buildHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'user-agent': PEER_USER_AGENT,
  };
}

/** A fetch that aborts after timeoutMs, surfaced as a timeout error upstream. */
export function timeoutFetch(timeoutMs: number): typeof fetch {
  return (async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
}

/** Normalize any thrown transport error into a WePublishApiError. */
export function normalizeError(err: unknown): WePublishApiError {
  if (err instanceof WePublishApiError) return err;
  if (err instanceof ClientError) {
    const msg =
      err.response?.errors?.map(e => e.message).join('; ') ||
      'GraphQL request failed';
    return new WePublishApiError(msg, 'graphql_error', err.response?.errors);
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new WePublishApiError('Request timed out', 'timeout');
  }
  const message = err instanceof Error ? err.message : String(err);
  return new WePublishApiError(message, 'network_error');
}

/** SDK wrapper that normalizes every operation's errors. */
export const normalizingWrapper = async <T>(
  action: () => Promise<T>
): Promise<T> => {
  try {
    return await action();
  } catch (err) {
    throw normalizeError(err);
  }
};

/** Internal — not exported from the package surface. */
function createRawClient(upstream: Upstream, timeoutMs: number): GraphQLClient {
  return new GraphQLClient(upstream.apiUrl, {
    headers: buildHeaders(upstream.token),
    fetch: timeoutFetch(timeoutMs),
  });
}

/** Build a typed client for one configured upstream (one newsroom). */
export function createWePublishClient(
  upstream: Upstream,
  timeoutMs: number
): WePublishClient {
  return getSdk(createRawClient(upstream, timeoutMs), normalizingWrapper);
}
