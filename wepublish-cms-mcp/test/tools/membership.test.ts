import { describe, it, expect } from 'vitest';
import { checkPaymentSetupTool } from '../../src/tools/check-payment-setup.js';
import { checkMemberPlansTool } from '../../src/tools/check-member-plans.js';
import { checkSubscriptionSetupTool } from '../../src/tools/check-subscription-setup.js';
import { WePublishApiError } from '../../src/client.js';
import {
  mockClient,
  makeCtx,
  makeThrowingCtx,
} from '../helpers/mock-client.js';
import {
  paymentMethodsActive,
  paymentMethodsNone,
  paymentMethodsInactiveOnly,
  memberPlansReady,
  memberPlansIncomplete,
  memberPlansEmpty,
  subscriptionsHave,
  subscriptionsNone,
} from '../fixtures/membership.js';

describe('cms_check_payment_setup', () => {
  it('happy: an active method → ok + anyActive true', async () => {
    const ctx = makeCtx(
      mockClient({ CheckPaymentSetup: async () => paymentMethodsActive })
    );
    const env = await checkPaymentSetupTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('ok');
    expect(env.findings).toMatchObject({
      totalPaymentMethods: 2,
      activePaymentMethods: 1,
      anyActive: true,
    });
  });

  it('inactive only → incomplete + activate nextCheck', async () => {
    const ctx = makeCtx(
      mockClient({ CheckPaymentSetup: async () => paymentMethodsInactiveOnly })
    );
    const env = await checkPaymentSetupTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('incomplete');
    expect(env.nextChecks.join(' ')).toMatch(/activate/i);
  });

  it('none → not_found', async () => {
    const ctx = makeCtx(
      mockClient({ CheckPaymentSetup: async () => paymentMethodsNone })
    );
    const env = await checkPaymentSetupTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('not_found');
  });

  it('error → fail-closed', async () => {
    const ctx = makeThrowingCtx(new WePublishApiError('boom', 'graphql_error'));
    const env = await checkPaymentSetupTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('error');
  });

  it('redaction: a secret-shaped providerID never appears in output', async () => {
    const ctx = makeCtx(
      mockClient({ CheckPaymentSetup: async () => paymentMethodsActive })
    );
    const env = await checkPaymentSetupTool.handler({ newsroom: 'tsri' }, ctx);
    expect(JSON.stringify(env)).not.toContain('sk_live_PROVIDERKEY123456');
  });
});

describe('cms_check_member_plans', () => {
  it('happy: a complete active plan → ok', async () => {
    const ctx = makeCtx(
      mockClient({ CheckMemberPlans: async () => memberPlansReady })
    );
    const env = await checkMemberPlansTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('ok');
    expect(env.findings).toMatchObject({
      totalPlans: 1,
      activePlans: 1,
      readyPlans: 1,
    });
  });

  it('incomplete plans → incomplete + specific gaps, not an error', async () => {
    const ctx = makeCtx(
      mockClient({ CheckMemberPlans: async () => memberPlansIncomplete })
    );
    const env = await checkMemberPlansTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('incomplete');
    expect(env.nextChecks.join(' ')).toMatch(/Set a price on plan "No Price"/);
    expect(env.nextChecks.join(' ')).toMatch(
      /Attach a payment method to plan "No Payment Method"/
    );
  });

  it('empty → not_found', async () => {
    const ctx = makeCtx(
      mockClient({ CheckMemberPlans: async () => memberPlansEmpty })
    );
    const env = await checkMemberPlansTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('not_found');
  });
});

describe('cms_check_subscription_setup', () => {
  it('has subscriptions → ok with counts', async () => {
    const ctx = makeCtx(
      mockClient({ CheckSubscriptionSetup: async () => subscriptionsHave })
    );
    const env = await checkSubscriptionSetupTool.handler(
      { newsroom: 'tsri' },
      ctx
    );
    expect(env.status).toBe('ok');
    expect(env.findings).toMatchObject({
      totalSubscriptions: 5,
      activeSubscribers: 2,
      hasSubscriptions: true,
    });
  });

  it('none → not_found with guidance', async () => {
    const ctx = makeCtx(
      mockClient({ CheckSubscriptionSetup: async () => subscriptionsNone })
    );
    const env = await checkSubscriptionSetupTool.handler(
      { newsroom: 'tsri' },
      ctx
    );
    expect(env.status).toBe('not_found');
    expect(env.nextChecks.length).toBeGreaterThan(0);
  });

  it('error → fail-closed', async () => {
    const ctx = makeThrowingCtx(new WePublishApiError('boom', 'timeout'));
    const env = await checkSubscriptionSetupTool.handler(
      { newsroom: 'tsri' },
      ctx
    );
    expect(env.status).toBe('error');
  });
});
