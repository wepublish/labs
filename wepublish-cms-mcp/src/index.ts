#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, resolveUpstream } from './config.js';
import { createWePublishClient } from './client.js';
import { createServer } from './server.js';
import { tools } from './tools/registry.js';
import type { ToolContext } from './tools/types.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx: ToolContext = {
    config,
    principal: process.env.WEPUBLISH_PRINCIPAL?.trim() || 'hermes',
    clientFor: newsroom =>
      createWePublishClient(
        resolveUpstream(config, newsroom),
        config.timeoutMs
      ),
  };

  const server = createServer(tools, ctx);
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `wepublish-cms-mcp ready (${tools.length} tools, env=${config.environment})\n`
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fatal: ${message}\n`);
  process.exit(1);
});
