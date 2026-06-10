import { buildEnvelope } from '../envelope.js';
import { runScopedTool, tenantInput } from './helpers.js';
import { collectSetup, overallReadiness } from './aggregate.js';
import type { ToolDefinition } from './types.js';

export const getSetupStatusTool: ToolDefinition = {
  name: 'cms_get_setup_status',
  title: 'Get setup status',
  description:
    'Aggregate readiness across all setup areas (site, navigation/domain/branding, ' +
    'payment, member plans, subscriptions, peering) into one ready|blockers view ' +
    'with an ordered list of remaining actions.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_get_setup_status',
      args,
      ctx,
      async (_tenant, base) => {
        const results = await collectSetup(args, ctx);
        const overall = overallReadiness(results);

        const areas = Object.fromEntries(results.map(r => [r.area, r.status]));

        // ordered blockers: required areas first (report order), then optional notes
        const blockers = results
          .filter(r => r.required && r.status !== 'ok')
          .map(r => ({
            area: r.area,
            label: r.label,
            status: r.status,
            checks: r.nextChecks,
          }));

        const nextChecks = [
          ...results
            .filter(r => r.required && r.status !== 'ok')
            .flatMap(r => r.nextChecks),
          ...results.filter(r => !r.required).flatMap(r => r.nextChecks),
        ];

        return buildEnvelope({
          ...base,
          apiVersion: 'v2',
          status: overall === 'ready' ? 'ok' : 'incomplete',
          findings: { overall, areas, blockers },
          nextChecks,
        });
      }
    );
  },
};
