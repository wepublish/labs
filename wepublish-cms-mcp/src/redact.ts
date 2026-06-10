/**
 * Redaction gate. The single chokepoint that strips secrets, payment-provider
 * credentials, and member PII before any value leaves a tool. The envelope
 * builder runs every output through `redact()` as defense-in-depth, so a tool
 * that accidentally includes a raw response value still cannot leak it.
 */

export const REDACTED = '[REDACTED]';

/** Key names whose values are always masked (case-insensitive substring match). */
const SENSITIVE_KEY = new RegExp(
  [
    'token',
    'secret',
    'password',
    'passwd',
    'api[-_]?key',
    'private[-_]?key',
    'client[-_]?secret',
    'webhook',
    'whsec',
    'stripe',
    'payrexx',
    'saferpay',
    'bexio',
    'credentials?',
    'authorization',
    'iban',
    'card',
    'cvv',
    'ssn',
    'email',
    'phone',
    'mobile',
    'address',
    'street',
    'zip',
    'postal',
    'first[-_]?name',
    'last[-_]?name',
    'birth',
    'dob',
  ].join('|'),
  'i'
);

/** Value patterns masked regardless of key — known secret/token shapes. */
const SECRET_VALUE = [
  /\b(sk|pk|rk)_[A-Za-z0-9_]{6,}\b/, // Stripe-style live/test keys (tail may contain _)
  /\bwhsec_[A-Za-z0-9_]{6,}\b/, // webhook signing secrets
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/, // JWTs
];

function maskString(value: string): string {
  return SECRET_VALUE.some(re => re.test(value)) ? REDACTED : value;
}

/**
 * Recursively redact a value. Objects/arrays are walked; a key matching
 * SENSITIVE_KEY masks its whole subtree; string values matching a secret shape
 * are masked even under a benign key.
 */
export function redact<T>(value: T): T {
  return redactInternal(value, false) as T;
}

function redactInternal(value: unknown, parentSensitive: boolean): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (parentSensitive) return REDACTED;
    return maskString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return parentSensitive ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map(item => redactInternal(item, parentSensitive));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const keySensitive = parentSensitive || SENSITIVE_KEY.test(key);
      out[key] = redactInternal(val, keySensitive);
    }
    return out;
  }

  return value;
}
