import { describe, it, expect } from 'vitest';
import { buildEnvelope, errorEnvelope } from '../src/envelope.js';

const base = {
  tenant: 'tsri',
  environment: 'test',
  tool: 'cms_get_site_profile',
  principal: 'hermes',
};

describe('buildEnvelope', () => {
  it('includes all required fields', () => {
    const env = buildEnvelope({
      ...base,
      apiVersion: 'v2',
      status: 'ok',
      findings: { siteName: 'Tsüri' },
      nextChecks: ['verify logo'],
    });
    expect(env).toMatchObject({
      tenant: 'tsri',
      environment: 'test',
      principal: 'hermes',
      apiVersion: 'v2',
      tool: 'cms_get_site_profile',
      status: 'ok',
      findings: { siteName: 'Tsüri' },
      redactedValues: {},
      nextChecks: ['verify logo'],
    });
    expect(typeof env.timestamp).toBe('string');
    expect(new Date(env.timestamp).toISOString()).toBe(env.timestamp);
  });

  it('redacts findings + redactedValues as a final gate', () => {
    const env = buildEnvelope({
      ...base,
      status: 'ok',
      findings: { providerSecret: 'sk_live_LEAK000000' },
      redactedValues: { email: 'person@news.ch' },
    });
    expect(JSON.stringify(env)).not.toContain('sk_live');
    expect(JSON.stringify(env)).not.toContain('person@news.ch');
  });

  it('errorEnvelope is fail-closed with status error', () => {
    const env = errorEnvelope(base, 'unknown tenant');
    expect(env.status).toBe('error');
    expect(env.findings).toEqual({ error: 'unknown tenant' });
  });
});
