import { describe, it, expect } from 'vitest';
import { loadConfig, resolveUpstream, ConfigError } from '../src/config.js';

const single = {
  WEPUBLISH_API_URL: 'https://api.tsri.ch/v1',
  WEPUBLISH_API_TOKEN: 'tok_123',
};

describe('loadConfig — single mode', () => {
  it("builds one upstream keyed by tenant (or 'default')", () => {
    const cfg = loadConfig({
      ...single,
      WEPUBLISH_TENANT: 'tsri',
    } as NodeJS.ProcessEnv);
    expect(cfg.defaultNewsroom).toBe('tsri');
    expect(cfg.upstreams.tsri).toEqual({
      apiUrl: 'https://api.tsri.ch/v1',
      token: 'tok_123',
    });
  });

  it("defaults the slug to 'default' when no tenant given", () => {
    const cfg = loadConfig({ ...single } as NodeJS.ProcessEnv);
    expect(cfg.defaultNewsroom).toBe('default');
    expect(cfg.upstreams.default.token).toBe('tok_123');
  });

  it('throws on missing url / token / bad url', () => {
    expect(() =>
      loadConfig({ WEPUBLISH_API_TOKEN: 'x' } as NodeJS.ProcessEnv)
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ WEPUBLISH_API_URL: 'https://x/v1' } as NodeJS.ProcessEnv)
    ).toThrow(/API_TOKEN/);
    expect(() =>
      loadConfig({ ...single, WEPUBLISH_API_URL: 'nope' } as NodeJS.ProcessEnv)
    ).toThrow(/valid URL/);
  });
});

describe('loadConfig — fleet mode', () => {
  it('parses WEPUBLISH_UPSTREAMS map', () => {
    const cfg = loadConfig({
      WEPUBLISH_UPSTREAMS: JSON.stringify({
        tsri: { apiUrl: 'https://api.tsri.ch/v1', token: 'a' },
        hauptstadt: { apiUrl: 'https://api.hauptstadt.be/v1', token: 'b' },
      }),
    } as NodeJS.ProcessEnv);
    expect(Object.keys(cfg.upstreams).sort()).toEqual(['hauptstadt', 'tsri']);
  });

  it('throws on invalid json / empty / bad upstream', () => {
    expect(() =>
      loadConfig({ WEPUBLISH_UPSTREAMS: '{' } as NodeJS.ProcessEnv)
    ).toThrow(/valid JSON/);
    expect(() =>
      loadConfig({ WEPUBLISH_UPSTREAMS: '{}' } as NodeJS.ProcessEnv)
    ).toThrow(/empty/);
    expect(() =>
      loadConfig({
        WEPUBLISH_UPSTREAMS: JSON.stringify({ x: { apiUrl: 'bad' } }),
      } as NodeJS.ProcessEnv)
    ).toThrow(ConfigError);
  });
});

describe('resolveUpstream — fail closed', () => {
  const cfg = loadConfig({
    ...single,
    WEPUBLISH_TENANT: 'tsri',
  } as NodeJS.ProcessEnv);
  it('resolves the default when no slug given', () => {
    expect(resolveUpstream(cfg).apiUrl).toBe('https://api.tsri.ch/v1');
  });
  it('throws on unknown newsroom', () => {
    expect(() => resolveUpstream(cfg, 'ghost')).toThrow(/Unknown newsroom/);
  });
});
