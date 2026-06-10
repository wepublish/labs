import { describe, it, expect } from 'vitest';
import { getSetupStatusTool } from '../../src/tools/get-setup-status.js';
import { generateOnboardingReportTool } from '../../src/tools/generate-onboarding-report.js';
import { WePublishApiError } from '../../src/client.js';
import { mockClient, makeCtx } from '../helpers/mock-client.js';
import {
  fullSiteProfile,
  incompleteSiteProfile,
} from '../fixtures/site-profile.js';
import {
  paymentMethodsActive,
  paymentMethodsNone,
  memberPlansReady,
  memberPlansEmpty,
  subscriptionsHave,
  subscriptionsNone,
} from '../fixtures/membership.js';
import {
  peersConfigured,
  peersNone,
  navComplete,
  navIncomplete,
} from '../fixtures/distribution.js';

const allGreen = () =>
  mockClient({
    GetSiteProfile: async () => fullSiteProfile,
    CheckNavDomainBranding: async () => navComplete,
    CheckPaymentSetup: async () => paymentMethodsActive,
    CheckMemberPlans: async () => memberPlansReady,
    CheckSubscriptionSetup: async () => subscriptionsHave,
    CheckPeeringStatus: async () => peersConfigured,
  });

const allBlocked = () =>
  mockClient({
    GetSiteProfile: async () => incompleteSiteProfile,
    CheckNavDomainBranding: async () => navIncomplete,
    CheckPaymentSetup: async () => paymentMethodsNone,
    CheckMemberPlans: async () => memberPlansEmpty,
    CheckSubscriptionSetup: async () => subscriptionsNone,
    CheckPeeringStatus: async () => peersNone,
  });

describe('cms_get_setup_status', () => {
  it('all required areas ok → ready, no blockers', async () => {
    const env = await getSetupStatusTool.handler(
      { newsroom: 'tsri' },
      makeCtx(allGreen())
    );
    expect(env.status).toBe('ok');
    expect(env.findings.overall).toBe('ready');
    expect(env.findings.blockers).toEqual([]);
  });

  it('mixed → blockers name exactly the failing required areas, ordered', async () => {
    const env = await getSetupStatusTool.handler(
      { newsroom: 'x' },
      makeCtx(allBlocked())
    );
    expect(env.findings.overall).toBe('blockers');
    const blockerAreas = (env.findings.blockers as Array<{ area: string }>).map(
      b => b.area
    );
    expect(blockerAreas).toEqual([
      'site',
      'navigationDomainBranding',
      'payment',
      'memberPlans',
    ]);
  });

  it('one area errors → not silently ready; area marked error', async () => {
    const client = mockClient({
      GetSiteProfile: async () => {
        throw new WePublishApiError('boom', 'graphql_error');
      },
      CheckNavDomainBranding: async () => navComplete,
      CheckPaymentSetup: async () => paymentMethodsActive,
      CheckMemberPlans: async () => memberPlansReady,
      CheckSubscriptionSetup: async () => subscriptionsHave,
      CheckPeeringStatus: async () => peersConfigured,
    });
    const env = await getSetupStatusTool.handler(
      { newsroom: 'x' },
      makeCtx(client)
    );
    expect(env.findings.overall).toBe('blockers');
    expect((env.findings.areas as Record<string, string>).site).toBe('error');
  });
});

describe('cms_generate_onboarding_report', () => {
  it('renders a markdown report; READY when all green', async () => {
    const env = await generateOnboardingReportTool.handler(
      { tenant: 'tsri' },
      makeCtx(allGreen())
    );
    expect(env.status).toBe('ok');
    const report = String(env.findings.report);
    expect(report).toContain('# Onboarding report — tsri');
    expect(report).toContain('READY');
    expect(report).toContain('Payment methods');
  });

  it('NEEDS WORK + checkboxes when blocked', async () => {
    const env = await generateOnboardingReportTool.handler(
      { tenant: 'x' },
      makeCtx(allBlocked())
    );
    expect(env.status).toBe('incomplete');
    const report = String(env.findings.report);
    expect(report).toContain('NEEDS WORK');
    expect(report).toMatch(/- \[ \] /);
  });
});
