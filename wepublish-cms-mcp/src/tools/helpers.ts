import { z } from 'zod';
import type { CmsMcpConfig } from '../config.js';
import { errorEnvelope, type Envelope } from '../envelope.js';
import { WePublishApiError } from '../client.js';
import type { ToolContext } from './types.js';

/**
 * Shared input: every tool is scoped to one newsroom. The `newsroom` value selects
 * a CONFIGURED upstream (never an arbitrary URL/token). Omit it to use the default.
 */
export const tenantInput = {
  newsroom: z
    .string()
    .optional()
    .describe(
      'Newsroom slug selecting a configured upstream. Falls back to the default newsroom.'
    ),
};

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/** Resolve the newsroom slug from args or the configured default; fail closed if neither. */
export function resolveNewsroom(
  args: Record<string, unknown>,
  config: CmsMcpConfig
): string {
  const fromArgs =
    typeof args.newsroom === 'string' ? args.newsroom.trim() : '';
  const slug = fromArgs || config.defaultNewsroom;
  if (!slug)
    throw new ToolInputError(
      'No newsroom specified and no default newsroom configured (fail closed).'
    );
  return slug;
}

/** "Is this field meaningfully set?" — non-null, non-empty. */
export function isSet(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Run a newsroom-scoped tool body with uniform slug resolution + fail-closed error
 * handling. `clientFor(slug)` (in ToolContext) resolves the configured upstream and
 * throws on unknown — that throw is converted to an error envelope here.
 */
export async function runScopedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  body: (
    newsroom: string,
    base: {
      tenant: string;
      environment: string;
      tool: string;
      principal: string;
    }
  ) => Promise<Envelope>
): Promise<Envelope> {
  let newsroom: string;
  try {
    newsroom = resolveNewsroom(args, ctx.config);
  } catch (err) {
    return errorEnvelope(
      {
        tenant: typeof args.newsroom === 'string' ? args.newsroom : 'unknown',
        environment: ctx.config.environment,
        tool: toolName,
        principal: ctx.principal,
      },
      err instanceof Error ? err.message : String(err)
    );
  }

  const base = {
    tenant: newsroom,
    environment: ctx.config.environment,
    tool: toolName,
    principal: ctx.principal,
  };

  try {
    return await body(newsroom, base);
  } catch (err) {
    if (err instanceof WePublishApiError)
      return errorEnvelope(base, `${err.code}: ${err.message}`);
    return errorEnvelope(
      base,
      err instanceof Error ? err.message : String(err)
    );
  }
}
