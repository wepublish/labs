import { buildEnvelope, type ToolStatus } from '../envelope.js';
import { isSet, runScopedTool, tenantInput } from './helpers.js';
import type { ToolDefinition } from './types.js';

export const getSiteProfileTool: ToolDefinition = {
  name: 'cms_get_site_profile',
  title: 'Get site profile',
  description:
    "Return the newsroom's site identity from the We.Publish admin API: name, " +
    'website/host URL, theme colours, whether logos and the call-to-action are set.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_get_site_profile',
      args,
      ctx,
      async (tenant, base) => {
        const { peerProfile: p } = await ctx.clientFor(tenant).GetSiteProfile();

        const logoSet = isSet(p.logoID);
        const squareLogoSet = isSet(p.squareLogoId);
        const callToActionConfigured =
          isSet(p.callToActionURL) && isSet(p.callToActionImageID);

        const nextChecks: string[] = [];
        if (!logoSet) nextChecks.push('Upload a site logo');
        if (!squareLogoSet)
          nextChecks.push('Upload a square logo (used in peer listings)');
        if (!callToActionConfigured)
          nextChecks.push('Configure the call-to-action (URL + image)');

        const findings = {
          siteName: p.name,
          websiteURL: p.websiteURL,
          hostURL: p.hostURL,
          themeColor: p.themeColor,
          themeFontColor: p.themeFontColor,
          logoSet,
          squareLogoSet,
          callToActionConfigured,
        };

        const identityComplete = isSet(p.name) && isSet(p.websiteURL);
        const status: ToolStatus =
          !identityComplete ? 'not_found'
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
