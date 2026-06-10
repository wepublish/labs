import { describe, it, expect } from 'vitest';
import { requireAuthToken } from '../src/http.js';

describe('HTTP mode auth (mandatory, fail closed)', () => {
  it('throws when MCP_AUTH_TOKEN is unset', () => {
    expect(() => requireAuthToken({} as NodeJS.ProcessEnv)).toThrow(
      /required in HTTP mode/i
    );
  });
  it('throws when MCP_AUTH_TOKEN is blank', () => {
    expect(() =>
      requireAuthToken({ MCP_AUTH_TOKEN: '   ' } as NodeJS.ProcessEnv)
    ).toThrow();
  });
  it('returns the token when set', () => {
    expect(
      requireAuthToken({ MCP_AUTH_TOKEN: 'secret' } as NodeJS.ProcessEnv)
    ).toBe('secret');
  });
});
