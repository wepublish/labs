import { buildEnvelope, type ToolStatus } from '../envelope.js';
import { runScopedTool, tenantInput } from './helpers.js';
import type { ToolDefinition } from './types.js';

export const checkSubscriptionSetupTool: ToolDefinition = {
  name: 'cms_check_subscription_setup',
  title: 'Check subscription setup',
  description:
    'Report whether the newsroom has subscriptions: total subscription count and ' +
    'the number of currently active subscribers. No member PII is returned.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_check_subscription_setup',
      args,
      ctx,
      async (tenant, base) => {
        const { subscriptions, activeSubscribers } = await ctx
          .clientFor(tenant)
          .CheckSubscriptionSetup();

        const findings = {
          totalSubscriptions: subscriptions.totalCount,
          activeSubscribers: activeSubscribers.length,
          hasSubscriptions: subscriptions.totalCount > 0,
        };

        const nextChecks: string[] = [];
        if (subscriptions.totalCount === 0)
          nextChecks.push(
            'No subscriptions yet — confirm member plans + payment methods are live so subscriptions can be created'
          );

        const status: ToolStatus =
          subscriptions.totalCount === 0 ? 'not_found' : 'ok';

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
