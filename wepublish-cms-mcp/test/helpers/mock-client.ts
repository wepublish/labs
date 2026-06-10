import type { WePublishClient } from '../../src/client.js';
import type { CmsMcpConfig } from '../../src/config.js';
import type { ToolContext } from '../../src/tools/types.js';

/**
 * Build a fake typed client from a partial map of operation → impl. Only the
 * operations a tool actually calls need to be provided; the cast is the seam
 * that lets tests drive tools without a network.
 */
export function mockClient(
  impl: Partial<Record<keyof WePublishClient, unknown>>
): WePublishClient {
  return impl as unknown as WePublishClient;
}

export const testConfig: CmsMcpConfig = {
  environment: 'test',
  timeoutMs: 15000,
  defaultNewsroom: 'tsri',
  upstreams: { tsri: { apiUrl: 'https://api.tsri.ch/v1', token: 'tok_test' } },
};

/** A ToolContext whose clientFor returns the given mock for every newsroom. */
export function makeCtx(
  client: WePublishClient,
  config: Partial<CmsMcpConfig> = {}
): ToolContext {
  return {
    config: { ...testConfig, ...config },
    principal: 'test',
    clientFor: () => client,
  };
}

/** A ToolContext whose clientFor throws — for API-error paths. */
export function makeThrowingCtx(
  error: Error,
  config: Partial<CmsMcpConfig> = {}
): ToolContext {
  return {
    config: { ...testConfig, ...config },
    principal: 'test',
    clientFor: () =>
      new Proxy(
        {},
        {
          get() {
            return () => Promise.reject(error);
          },
        }
      ) as WePublishClient,
  };
}
