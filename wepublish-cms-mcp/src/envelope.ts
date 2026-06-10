/**
 * Uniform response envelope for every tool, plus structured audit logging.
 * Output shape (spec MCP_DELIVERY_SPEC §"Each read returns"):
 *   tenant, environment, timestamp, principal, apiVersion, status,
 *   findings, redactedValues, nextChecks
 * The whole payload is passed through redact() before return as a final gate.
 */
import { redact } from './redact.js';

export type ToolStatus = 'ok' | 'incomplete' | 'not_found' | 'error';

export interface EnvelopeInput {
  tenant: string;
  environment: string;
  tool: string;
  /** Authenticated actor on whose behalf the call ran (e.g. "hermes"). */
  principal: string;
  /** Source API version/identifier, when known. */
  apiVersion?: string;
  status: ToolStatus;
  /** Curated, safe findings (booleans, counts, statuses, names). */
  findings: Record<string, unknown>;
  /** Any echoed config that may contain sensitive bits (masked on output). */
  redactedValues?: Record<string, unknown>;
  /** Ordered next checks / required human actions. */
  nextChecks?: string[];
}

export interface Envelope {
  tenant: string;
  environment: string;
  timestamp: string;
  principal: string;
  apiVersion: string | null;
  tool: string;
  status: ToolStatus;
  findings: Record<string, unknown>;
  redactedValues: Record<string, unknown>;
  nextChecks: string[];
}

/** Audit sink — JSON line to stderr (stdout is reserved for the MCP transport). */
function writeAudit(entry: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ audit: 'cms-mcp', ...entry })}\n`);
}

export function buildEnvelope(input: EnvelopeInput): Envelope {
  const timestamp = new Date().toISOString();

  const envelope: Envelope = {
    tenant: input.tenant,
    environment: input.environment,
    timestamp,
    principal: input.principal,
    apiVersion: input.apiVersion ?? null,
    tool: input.tool,
    status: input.status,
    findings: redact(input.findings),
    redactedValues: redact(input.redactedValues ?? {}),
    nextChecks: input.nextChecks ?? [],
  };

  writeAudit({
    ts: timestamp,
    principal: input.principal,
    tenant: input.tenant,
    tool: input.tool,
    status: input.status,
  });

  return envelope;
}

/** Convenience for fail-closed error envelopes. */
export function errorEnvelope(
  base: Pick<EnvelopeInput, 'tenant' | 'environment' | 'tool' | 'principal'>,
  message: string,
  nextChecks: string[] = []
): Envelope {
  return buildEnvelope({
    ...base,
    status: 'error',
    findings: { error: message },
    nextChecks,
  });
}
