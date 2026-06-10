import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { tools } from '../src/tools/registry.js';
import type { ToolContext } from '../src/tools/types.js';

const ctx: ToolContext = {
  config: {
    environment: 'test',
    timeoutMs: 15000,
    defaultNewsroom: 'tsri',
    upstreams: { tsri: { apiUrl: 'https://api.tsri.ch/v1', token: 'tok' } },
  },
  principal: 'hermes',
  clientFor: () => ({}) as never,
};

describe('createServer', () => {
  it('builds a connectable server from the registry', () => {
    const server = createServer(tools, ctx);
    expect(typeof server.connect).toBe('function');
  });
});
