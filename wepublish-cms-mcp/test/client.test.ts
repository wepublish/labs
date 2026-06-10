import { describe, it, expect } from 'vitest';
import { ClientError } from 'graphql-request';
import {
  buildHeaders,
  normalizeError,
  normalizingWrapper,
  createWePublishClient,
  WePublishApiError,
  PEER_USER_AGENT,
} from '../src/client.js';

const upstream = { apiUrl: 'https://api.tsri.ch/v1', token: 'tok_123' };

describe('buildHeaders', () => {
  it('sets bearer auth + the peer User-Agent, and NO tenant header', () => {
    const h = buildHeaders(upstream.token);
    expect(h.authorization).toBe('Bearer tok_123');
    expect(h['user-agent']).toBe(PEER_USER_AGENT);
    expect(h['user-agent']).toBe('We.Publish/1.0 Peering');
    expect(Object.keys(h)).not.toContain('x-wepublish-tenant');
  });
});

describe('normalizeError', () => {
  it('maps a GraphQL ClientError to graphql_error', () => {
    const ce = new ClientError(
      { errors: [{ message: 'boom' }], status: 200, headers: {} } as never,
      { query: 'x' }
    );
    expect(normalizeError(ce).code).toBe('graphql_error');
    expect(normalizeError(ce).message).toContain('boom');
  });
  it('maps an AbortError to timeout', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(normalizeError(abort).code).toBe('timeout');
  });
  it('maps anything else to network_error', () => {
    expect(normalizeError(new Error('dns')).code).toBe('network_error');
  });
});

describe('normalizingWrapper', () => {
  it('passes through success; normalizes throws', async () => {
    await expect(normalizingWrapper(async () => 42)).resolves.toBe(42);
    await expect(
      normalizingWrapper(async () => {
        throw new Error('dns');
      })
    ).rejects.toBeInstanceOf(WePublishApiError);
  });
});

describe('createWePublishClient', () => {
  it('exposes only named operations — no raw request/rawRequest escape hatch', () => {
    const client = createWePublishClient(upstream, 15000) as Record<
      string,
      unknown
    >;
    expect(client.request).toBeUndefined();
    expect(client.rawRequest).toBeUndefined();
    for (const v of Object.values(client)) expect(typeof v).toBe('function');
  });
});
