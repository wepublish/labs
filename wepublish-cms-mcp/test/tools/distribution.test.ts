import { describe, it, expect } from 'vitest';
import { checkPeeringStatusTool } from '../../src/tools/check-peering-status.js';
import { checkNavigationDomainBrandingTool } from '../../src/tools/check-navigation-domain-branding.js';
import { WePublishApiError } from '../../src/client.js';
import {
  mockClient,
  makeCtx,
  makeThrowingCtx,
} from '../helpers/mock-client.js';
import {
  peersConfigured,
  peersNone,
  navComplete,
  navIncomplete,
} from '../fixtures/distribution.js';

describe('cms_check_peering_status', () => {
  it('peers configured → ok, counts enabled', async () => {
    const ctx = makeCtx(
      mockClient({ CheckPeeringStatus: async () => peersConfigured })
    );
    const env = await checkPeeringStatusTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('ok');
    expect(env.findings).toMatchObject({ totalPeers: 2, enabledPeers: 1 });
  });

  it('no peers → not_found (valid, optional), not an error', async () => {
    const ctx = makeCtx(
      mockClient({ CheckPeeringStatus: async () => peersNone })
    );
    const env = await checkPeeringStatusTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('not_found');
    expect(env.nextChecks.join(' ')).toMatch(/optional/i);
  });

  it('error → fail-closed', async () => {
    const ctx = makeThrowingCtx(new WePublishApiError('boom', 'network_error'));
    const env = await checkPeeringStatusTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('error');
  });

  it("redaction: a peer token would never leak (we don't select it, gate masks it anyway)", async () => {
    const ctx = makeCtx(
      mockClient({ CheckPeeringStatus: async () => peersConfigured })
    );
    const env = await checkPeeringStatusTool.handler({ newsroom: 'tsri' }, ctx);
    expect(JSON.stringify(env)).not.toMatch(/token/i);
  });
});

describe('cms_check_navigation_domain_branding', () => {
  it('all present → ok', async () => {
    const ctx = makeCtx(
      mockClient({ CheckNavDomainBranding: async () => navComplete })
    );
    const env = await checkNavigationDomainBrandingTool.handler(
      { newsroom: 'tsri' },
      ctx
    );
    expect(env.status).toBe('ok');
    expect(env.findings).toMatchObject({
      missingNavigations: [],
      domainConfigured: true,
      brandingConfigured: true,
    });
  });

  it('missing required slug + no domain/branding → incomplete with specific gaps', async () => {
    const ctx = makeCtx(
      mockClient({ CheckNavDomainBranding: async () => navIncomplete })
    );
    const env = await checkNavigationDomainBrandingTool.handler(
      { newsroom: 'hauptstadt' },
      ctx
    );
    expect(env.status).toBe('incomplete');
    expect(env.findings.missingNavigations).toEqual(
      expect.arrayContaining(['header', 'icons'])
    );
    expect(env.findings.emptyNavigations).toContain('footer');
    expect(env.nextChecks.join(' ')).toMatch(/Set the site website URL/);
    expect(env.nextChecks.join(' ')).toMatch(/branding/i);
  });
});
