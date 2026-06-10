import { buildEnvelope, type ToolStatus } from '../envelope.js';
import { runScopedTool, tenantInput } from './helpers.js';
import type { ToolDefinition } from './types.js';

export const checkPaymentSetupTool: ToolDefinition = {
  name: 'cms_check_payment_setup',
  title: 'Check payment setup',
  description:
    "Report the newsroom's configured payment methods and whether at least one " +
    'is active. Provider secrets are never read or returned.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_check_payment_setup',
      args,
      ctx,
      async (tenant, base) => {
        const { paymentMethods } = await ctx
          .clientFor(tenant)
          .CheckPaymentSetup();

        const active = paymentMethods.filter(m => m.active);
        const findings = {
          totalPaymentMethods: paymentMethods.length,
          activePaymentMethods: active.length,
          methods: paymentMethods.map(m => ({
            name: m.name,
            slug: m.slug,
            active: m.active,
          })),
          anyActive: active.length > 0,
        };

        const nextChecks: string[] = [];
        if (paymentMethods.length === 0)
          nextChecks.push('Configure at least one payment method');
        else if (active.length === 0)
          nextChecks.push('Activate at least one payment method');

        const status: ToolStatus =
          paymentMethods.length === 0 ? 'not_found'
          : active.length === 0 ? 'incomplete'
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
