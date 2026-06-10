import { buildEnvelope, type ToolStatus } from '../envelope.js';
import { runScopedTool, tenantInput } from './helpers.js';
import type { ToolDefinition } from './types.js';

export const checkMemberPlansTool: ToolDefinition = {
  name: 'cms_check_member_plans',
  title: 'Check member plans',
  description:
    "Report the newsroom's membership plans: how many are active, whether each " +
    'has a price and at least one payment method, and which plans are incomplete.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_check_member_plans',
      args,
      ctx,
      async (tenant, base) => {
        const { memberPlans } = await ctx.clientFor(tenant).CheckMemberPlans();
        const plans = memberPlans.nodes;

        const summarized = plans.map(p => {
          const paymentMethodCount = p.availablePaymentMethods.reduce(
            (n, a) => n + a.paymentMethodIDs.length,
            0
          );
          const hasPrice =
            typeof p.amountPerMonthMin === 'number' && p.amountPerMonthMin > 0;
          return {
            name: p.name,
            slug: p.slug,
            active: p.active,
            currency: p.currency,
            hasPrice,
            hasPaymentMethods: paymentMethodCount > 0,
          };
        });

        const activeComplete = summarized.filter(
          p => p.active && p.hasPrice && p.hasPaymentMethods
        );
        const incompletePlans = summarized.filter(
          p => p.active && (!p.hasPrice || !p.hasPaymentMethods)
        );

        const findings = {
          totalPlans: memberPlans.totalCount,
          activePlans: summarized.filter(p => p.active).length,
          readyPlans: activeComplete.length,
          plans: summarized,
        };

        const nextChecks: string[] = [];
        if (plans.length === 0)
          nextChecks.push('Create at least one membership plan');
        for (const p of incompletePlans) {
          if (!p.hasPrice) nextChecks.push(`Set a price on plan "${p.name}"`);
          if (!p.hasPaymentMethods)
            nextChecks.push(`Attach a payment method to plan "${p.name}"`);
        }

        const status: ToolStatus =
          plans.length === 0 ? 'not_found'
          : activeComplete.length === 0 ? 'incomplete'
          : nextChecks.length > 0 ? 'incomplete'
          : 'ok';

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
