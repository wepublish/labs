#!/usr/bin/env node
/**
 * Streamable HTTP transport (stateless), mirroring wepublish-mcp so this server
 * deploys on the same ghcr → K8s path and is callable by an MCP client.
 *
 * SECURITY: unlike the public wepublish-mcp, this exposes ADMIN diagnostics, so
 * `MCP_AUTH_TOKEN` is MANDATORY — the server refuses to start without it. Even so,
 * deploy it on an internal-only Service/NetworkPolicy; never on the public
 * mcp.wepublish.cloud surface.
 */
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Request, Response } from 'express';
import { loadConfig, resolveUpstream } from './config.js';
import { createWePublishClient } from './client.js';
import { createServer } from './server.js';
import { tools } from './tools/registry.js';
import type { ToolContext } from './tools/types.js';

function log(...args: unknown[]): void {
  process.stderr.write(`[cms-mcp-http] ${args.map(String).join(' ')}\n`);
}

/** MCP_AUTH_TOKEN is mandatory in HTTP mode — fail closed if unset. */
export function requireAuthToken(env: NodeJS.ProcessEnv = process.env): string {
  const t = env.MCP_AUTH_TOKEN?.trim();
  if (!t) {
    throw new Error(
      'MCP_AUTH_TOKEN is required in HTTP mode (admin diagnostics). Refusing to start.'
    );
  }
  return t;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const authToken = requireAuthToken();

  const ctx: ToolContext = {
    config,
    principal: process.env.WEPUBLISH_PRINCIPAL?.trim() || 'hermes',
    clientFor: newsroom =>
      createWePublishClient(
        resolveUpstream(config, newsroom),
        config.timeoutMs
      ),
  };

  const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
  const HOST = process.env.HOST ?? '0.0.0.0';
  const allowedHosts =
    process.env.MCP_ALLOWED_HOSTS?.split(',')
      .map(s => s.trim())
      .filter(Boolean) || undefined;

  const app = createMcpExpressApp(
    allowedHosts ? { host: HOST, allowedHosts } : { host: HOST }
  );

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // Mandatory Bearer auth on /mcp.
  app.use('/mcp', (req: Request, res: Response, next: () => void) => {
    const header = req.headers.authorization ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (provided !== authToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  // Stateless: fresh server + transport per request.
  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer(tools, ctx);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        try {
          transport.close();
        } catch {
          /* noop */
        }
        try {
          server.close();
        } catch {
          /* noop */
        }
      });
    } catch (err) {
      log('error handling MCP request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.listen(PORT, HOST, () => {
    log(
      `ready: http://${HOST}:${PORT}/mcp (${tools.length} tools, env=${config.environment}, auth=required)`
    );
  });
}

// Only start the server when executed directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`fatal: ${message}\n`);
    process.exit(1);
  });
}
