import type { ZodRawShape } from 'zod';
import type { CmsMcpConfig } from '../config.js';
import type { Envelope } from '../envelope.js';
import type { WePublishClient } from '../client.js';

/**
 * Context handed to every tool handler. `clientFor(tenant)` returns a typed,
 * tenant-scoped client exposing only named operations — tests inject a mock
 * factory to drive tools without a network.
 */
export interface ToolContext {
  config: CmsMcpConfig;
  principal: string;
  clientFor(tenant: string): WePublishClient;
}

/** A single curated, allowlisted read tool. No dynamic registration exists. */
export interface ToolDefinition<Shape extends ZodRawShape = ZodRawShape> {
  /** MCP tool name, e.g. "cms_get_site_profile". */
  name: string;
  title: string;
  description: string;
  /** Zod raw shape for the tool input (always includes a tenant scope). */
  inputShape: Shape;
  handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Envelope>;
}
