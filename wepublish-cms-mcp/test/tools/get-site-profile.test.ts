import { describe, it, expect } from 'vitest';
import { getSiteProfileTool } from '../../src/tools/get-site-profile.js';
import { WePublishApiError } from '../../src/client.js';
import {
  mockClient,
  makeCtx,
  makeThrowingCtx,
} from '../helpers/mock-client.js';
import {
  fullSiteProfile,
  incompleteSiteProfile,
} from '../fixtures/site-profile.js';

describe('cms_get_site_profile', () => {
  it('happy path: complete profile → status ok, expected findings', async () => {
    const ctx = makeCtx(
      mockClient({ GetSiteProfile: async () => fullSiteProfile })
    );
    const env = await getSiteProfileTool.handler({ newsroom: 'tsri' }, ctx);
    expect(env.status).toBe('ok');
    expect(env.findings).toMatchObject({
      siteName: 'Tsüri',
      websiteURL: 'https://tsri.ch',
      logoSet: true,
      squareLogoSet: true,
      callToActionConfigured: true,
    });
    expect(env.nextChecks).toEqual([]);
  });

  it('missing logo → incomplete + nextChecks, not an error', async () => {
    const ctx = makeCtx(
      mockClient({ GetSiteProfile: async () => incompleteSiteProfile })
    );
    const env = await getSiteProfileTool.handler(
      { newsroom: 'hauptstadt' },
      ctx
    );
    expect(env.status).toBe('incomplete');
    expect(env.findings).toMatchObject({
      logoSet: false,
      callToActionConfigured: false,
    });
    expect(env.nextChecks).toContain('Upload a site logo');
  });

  it('API error → fail-closed error envelope, no partial leak', async () => {
    const ctx = makeThrowingCtx(
      new WePublishApiError('unknown tenant', 'graphql_error')
    );
    const env = await getSiteProfileTool.handler({ newsroom: 'ghost' }, ctx);
    expect(env.status).toBe('error');
    expect(env.findings).not.toHaveProperty('siteName');
  });

  it('no tenant + no default → fail closed', async () => {
    const ctx = makeCtx(
      mockClient({ GetSiteProfile: async () => fullSiteProfile }),
      {
        defaultNewsroom: undefined,
      }
    );
    const env = await getSiteProfileTool.handler({}, ctx);
    expect(env.status).toBe('error');
    expect(String(env.findings.error)).toMatch(/fail closed/i);
  });

  it('redaction gate: no secret-shaped value escapes', async () => {
    const ctx = makeCtx(
      mockClient({ GetSiteProfile: async () => fullSiteProfile })
    );
    const env = await getSiteProfileTool.handler({ newsroom: 'tsri' }, ctx);
    const serialized = JSON.stringify(env);
    expect(serialized).not.toMatch(/\bsk_live_/);
    expect(serialized).not.toContain('Bearer');
  });
});
