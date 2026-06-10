import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext, ToolDefinition } from './tools/types.js';

export const SERVER_NAME = 'wepublish-cms-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Build the MCP server from the static tool registry. Factored out of index.ts
 * so it is testable without spawning a stdio transport. Each tool's curated
 * Envelope is serialized to a single text content block.
 */
export function createServer(
  tools: ToolDefinition[],
  ctx: ToolContext
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputShape,
      },
      async (args: Record<string, unknown>) => {
        const envelope = await tool.handler(args, ctx);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(envelope, null, 2) },
          ],
        };
      }
    );
  }

  return server;
}
