import type { Envelope, ToolStatus } from '../envelope.js';
import type { ToolContext, ToolDefinition } from './types.js';
import { getSiteProfileTool } from './get-site-profile.js';
import { checkPaymentSetupTool } from './check-payment-setup.js';
import { checkMemberPlansTool } from './check-member-plans.js';
import { checkSubscriptionSetupTool } from './check-subscription-setup.js';
import { checkNavigationDomainBrandingTool } from './check-navigation-domain-branding.js';
import { checkPeeringStatusTool } from './check-peering-status.js';

export interface AreaConfig {
  area: string;
  label: string;
  tool: ToolDefinition;
  /** Required areas must be "ok" for the newsroom to be launch-ready. */
  required: boolean;
}

/**
 * The setup areas, in report order. Subscriptions + peering are informational
 * (a brand-new newsroom legitimately has neither yet) so they never block "ready".
 */
export const SETUP_AREAS: AreaConfig[] = [
  {
    area: 'site',
    label: 'Site profile',
    tool: getSiteProfileTool,
    required: true,
  },
  {
    area: 'navigationDomainBranding',
    label: 'Navigation, domain & branding',
    tool: checkNavigationDomainBrandingTool,
    required: true,
  },
  {
    area: 'payment',
    label: 'Payment methods',
    tool: checkPaymentSetupTool,
    required: true,
  },
  {
    area: 'memberPlans',
    label: 'Member plans',
    tool: checkMemberPlansTool,
    required: true,
  },
  {
    area: 'subscriptions',
    label: 'Subscriptions',
    tool: checkSubscriptionSetupTool,
    required: false,
  },
  {
    area: 'peering',
    label: 'Peering',
    tool: checkPeeringStatusTool,
    required: false,
  },
];

export interface AreaResult {
  area: string;
  label: string;
  required: boolean;
  status: ToolStatus;
  nextChecks: string[];
  findings: Record<string, unknown>;
}

/** Run every atomic tool for one tenant and collect per-area results. */
export async function collectSetup(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<AreaResult[]> {
  const envelopes = await Promise.all(
    SETUP_AREAS.map(async (a): Promise<AreaResult> => {
      let env: Envelope;
      try {
        env = await a.tool.handler(args, ctx);
      } catch (err) {
        // atomic tools fail closed internally, but never let one area crash the report
        env = {
          tenant: 'unknown',
          environment: ctx.config.environment,
          timestamp: new Date().toISOString(),
          principal: ctx.principal,
          apiVersion: null,
          tool: a.tool.name,
          status: 'error',
          findings: { error: err instanceof Error ? err.message : String(err) },
          redactedValues: {},
          nextChecks: [],
        };
      }
      return {
        area: a.area,
        label: a.label,
        required: a.required,
        status: env.status,
        nextChecks: env.nextChecks,
        findings: env.findings,
      };
    })
  );
  return envelopes;
}

/**
 * Overall readiness. "ready" only when every REQUIRED area is "ok".
 * An errored required area degrades to "blockers" — never silently "ready".
 */
export function overallReadiness(results: AreaResult[]): 'ready' | 'blockers' {
  const required = results.filter(r => r.required);
  return required.every(r => r.status === 'ok') ? 'ready' : 'blockers';
}
