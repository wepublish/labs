import type { ToolDefinition } from './types.js';
import { getSiteProfileTool } from './get-site-profile.js';
import { checkPaymentSetupTool } from './check-payment-setup.js';
import { checkMemberPlansTool } from './check-member-plans.js';
import { checkSubscriptionSetupTool } from './check-subscription-setup.js';
import { checkPeeringStatusTool } from './check-peering-status.js';
import { checkNavigationDomainBrandingTool } from './check-navigation-domain-branding.js';
import { getSetupStatusTool } from './get-setup-status.js';
import { generateOnboardingReportTool } from './generate-onboarding-report.js';

/**
 * The complete allowlist of tools the server exposes. Static by design — there
 * is no dynamic or discovered registration.
 */
export const tools: ToolDefinition[] = [
  getSiteProfileTool,
  checkPaymentSetupTool,
  checkMemberPlansTool,
  checkSubscriptionSetupTool,
  checkPeeringStatusTool,
  checkNavigationDomainBrandingTool,
  getSetupStatusTool,
  generateOnboardingReportTool,
];
