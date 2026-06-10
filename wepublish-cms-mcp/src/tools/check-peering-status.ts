import { buildEnvelope, type ToolStatus } from '../envelope.js';
import { runScopedTool, tenantInput } from './helpers.js';
import type { ToolDefinition } from './types.js';

export const checkPeeringStatusTool: ToolDefinition = {
  name: 'cms_check_peering_status',
  title: 'Check peering status',
  description:
    "Report the newsroom's configured peers and how many are enabled. Peering is " +
    "optional, so 'no peers' is a valid state, not an error. Peer tokens are never read.",
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_check_peering_status',
      args,
      ctx,
      async (tenant, base) => {
        const { peers } = await ctx.clientFor(tenant).CheckPeeringStatus();

        const enabled = peers.filter(p => p.isDisabled !== true);
        const findings = {
          totalPeers: peers.length,
          enabledPeers: enabled.length,
          peers: peers.map(p => ({
            name: p.name,
            slug: p.slug,
            hostURL: p.hostURL,
            enabled: p.isDisabled !== true,
          })),
        };

        // Peering is optional: empty = not_found (informational), any peer = ok.
        const status: ToolStatus = peers.length === 0 ? 'not_found' : 'ok';
        const nextChecks =
          peers.length === 0 ?
            [
              'No peers configured (optional) — add peers if this newsroom should syndicate content',
            ]
          : [];

        return buildEnvelope({
          ...base,
          apiVersion: 'v2',
          status,
          findings,
          nextChecks,
        });
      }
    );
  },
};
