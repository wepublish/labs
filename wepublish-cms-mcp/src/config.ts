/**
 * Fail-closed configuration.
 *
 * Tenancy in We.Publish is PER-DEPLOYMENT (one API + Postgres per newsroom; there
 * is no tenant header). So this server is configured with one or more *upstreams*,
 * each an (apiUrl, token) pair for one newsroom's admin API. A tool's `newsroom`
 * argument selects among CONFIGURED upstreams — it can never point at an arbitrary
 * URL/token. Unknown newsroom → fail closed.
 *
 * Two modes:
 *  - single  : WEPUBLISH_API_URL + WEPUBLISH_API_TOKEN (+ optional WEPUBLISH_TENANT label)
 *  - fleet   : WEPUBLISH_UPSTREAMS = JSON map { "<slug>": { "apiUrl": "...", "token": "..." } }
 *
 * Fleet mode concentrates several newsrooms' (effectively admin-read) tokens in one
 * process — prefer single mode (one deployment per newsroom) unless you accept that
 * blast radius. Tokens should be scoped read-only roles, not full admin.
 */

export interface Upstream {
  /** Admin GraphQL endpoint, e.g. https://api.<newsroom>/v1 */
  apiUrl: string;
  /** Long-lived service token (sent as Bearer + peer User-Agent). */
  token: string;
}

export interface CmsMcpConfig {
  environment: string;
  timeoutMs: number;
  /** Newsroom slug used when a tool call omits `newsroom`. */
  defaultNewsroom?: string;
  /** Configured upstreams keyed by newsroom slug. Always non-empty. */
  upstreams: Record<string, Upstream>;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function validUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function validateUpstream(slug: string, u: unknown): Upstream {
  if (typeof u !== 'object' || u === null)
    throw new ConfigError(`Upstream '${slug}' must be an object`);
  const { apiUrl, token } = u as Record<string, unknown>;
  if (typeof apiUrl !== 'string' || !validUrl(apiUrl))
    throw new ConfigError(`Upstream '${slug}' has an invalid apiUrl`);
  if (typeof token !== 'string' || token.trim() === '')
    throw new ConfigError(`Upstream '${slug}' is missing a token`);
  return { apiUrl: apiUrl.trim(), token: token.trim() };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CmsMcpConfig {
  const environment = env.WEPUBLISH_ENV?.trim() || 'unknown';

  let timeoutMs = 15_000;
  if (env.WEPUBLISH_TIMEOUT_MS) {
    const parsed = Number(env.WEPUBLISH_TIMEOUT_MS);
    if (!Number.isFinite(parsed) || parsed <= 0)
      throw new ConfigError(
        `WEPUBLISH_TIMEOUT_MS must be a positive number, got: ${env.WEPUBLISH_TIMEOUT_MS}`
      );
    timeoutMs = parsed;
  }

  let upstreams: Record<string, Upstream> = {};
  let defaultNewsroom: string | undefined;

  if (env.WEPUBLISH_UPSTREAMS) {
    let raw: unknown;
    try {
      raw = JSON.parse(env.WEPUBLISH_UPSTREAMS);
    } catch {
      throw new ConfigError('WEPUBLISH_UPSTREAMS is not valid JSON');
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new ConfigError(
        'WEPUBLISH_UPSTREAMS must be a JSON object of slug → {apiUrl, token}'
      );
    for (const [slug, u] of Object.entries(raw as Record<string, unknown>))
      upstreams[slug] = validateUpstream(slug, u);
    if (Object.keys(upstreams).length === 0)
      throw new ConfigError('WEPUBLISH_UPSTREAMS is empty');
    defaultNewsroom = env.WEPUBLISH_TENANT?.trim() || undefined;
  } else {
    const apiUrl = env.WEPUBLISH_API_URL?.trim();
    const token = env.WEPUBLISH_API_TOKEN?.trim();
    if (!apiUrl)
      throw new ConfigError(
        'Missing required environment variable: WEPUBLISH_API_URL'
      );
    if (!validUrl(apiUrl))
      throw new ConfigError(`WEPUBLISH_API_URL is not a valid URL: ${apiUrl}`);
    if (!token)
      throw new ConfigError(
        'Missing required environment variable: WEPUBLISH_API_TOKEN'
      );
    const slug = env.WEPUBLISH_TENANT?.trim() || 'default';
    upstreams = { [slug]: { apiUrl, token } };
    defaultNewsroom = slug;
  }

  return { environment, timeoutMs, defaultNewsroom, upstreams };
}

/** Resolve a configured upstream by newsroom slug. Fail closed on unknown/absent. */
export function resolveUpstream(
  config: CmsMcpConfig,
  newsroom?: string
): Upstream {
  const slug = newsroom?.trim() || config.defaultNewsroom;
  if (!slug)
    throw new ConfigError(
      'No newsroom specified and no default newsroom configured (fail closed).'
    );
  const upstream = config.upstreams[slug];
  if (!upstream)
    throw new ConfigError(
      `Unknown newsroom '${slug}' — not a configured upstream (fail closed).`
    );
  return upstream;
}
