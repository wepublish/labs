import { buildEnvelope, type ToolStatus } from '../envelope.js';
import { isSet, runScopedTool, tenantInput } from './helpers.js';
import type { ToolDefinition } from './types.js';

/** Navigation keys a launched We.Publish site is expected to define. */
const REQUIRED_NAV_KEYS = ['main', 'header', 'footer', 'icons'] as const;

export const checkNavigationDomainBrandingTool: ToolDefinition = {
  name: 'cms_check_navigation_domain_branding',
  title: 'Check navigation, domain & branding',
  description:
    "Report whether the newsroom's required navigations (main/header/footer/icons) " +
    'exist, the site domain is set, and branding (logo + theme colour) is configured.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_check_navigation_domain_branding',
      args,
      ctx,
      async (tenant, base) => {
        const { navigations, peerProfile: p } = await ctx
          .clientFor(tenant)
          .CheckNavDomainBranding();

        const presentKeys = new Set(navigations.map(n => n.key));
        const requiredNavigations = Object.fromEntries(
          REQUIRED_NAV_KEYS.map(k => [k, presentKeys.has(k)])
        );
        const missingNavigations = REQUIRED_NAV_KEYS.filter(
          k => !presentKeys.has(k)
        );
        const emptyNavigations = navigations
          .filter(n => (n.links?.length ?? 0) === 0)
          .map(n => n.key);

        const domainConfigured = isSet(p.websiteURL);
        const brandingConfigured = isSet(p.logoID) && isSet(p.themeColor);

        const findings = {
          requiredNavigations,
          missingNavigations,
          emptyNavigations,
          domainConfigured,
          websiteURL: p.websiteURL,
          brandingConfigured,
        };

        const nextChecks: string[] = [];
        for (const k of missingNavigations)
          nextChecks.push(`Create the "${k}" navigation`);
        if (!domainConfigured)
          nextChecks.push('Set the site website URL (domain)');
        if (!brandingConfigured)
          nextChecks.push('Configure branding (logo + theme colour)');

        const status: ToolStatus =
          nextChecks.length === 0 ? 'ok' : 'incomplete';

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
