/**
 * Secure JWT verification using the jose library.
 *
 * Security measures:
 * 1. Explicit algorithm specification (RS256) - prevents algorithm confusion attacks
 * 2. Issuer validation - ensures token comes from trusted source
 * 3. Audience validation - ensures token is intended for this application
 * 4. Expiration checking - rejects expired tokens
 */

import { jwtVerify, importSPKI, type JWTPayload as JoseJWTPayload, type KeyLike } from 'jose';

export interface JWTPayload extends JoseJWTPayload {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
}

let cachedPublicKey: KeyLike | null = null;

/**
 * Get the public key for JWT verification.
 *
 * The key is cached after first import for performance.
 */
async function getPublicKey(): Promise<KeyLike> {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  const publicKeyPEM = import.meta.env.VITE_JWT_PUBLIC_KEY;

  if (!publicKeyPEM) {
    throw new Error('JWT public key not configured (VITE_JWT_PUBLIC_KEY)');
  }

  // Handle escaped newlines in environment variable
  const formattedKey = publicKeyPEM.replace(/\\n/g, '\n');

  cachedPublicKey = await importSPKI(formattedKey, 'RS256');
  return cachedPublicKey;
}

/**
 * Verify a JWT token and return the payload.
 *
 * @throws Error if the token is invalid, expired, or has wrong issuer/audience
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const publicKey = await getPublicKey();
  const issuer = import.meta.env.VITE_JWT_ISSUER;

  if (!issuer) {
    throw new Error('JWT issuer not configured (VITE_JWT_ISSUER)');
  }

  const { payload } = await jwtVerify(token, publicKey, {
    // CRITICAL: Validate issuer
    issuer: issuer,

    // CRITICAL: Validate audience - token must be intended for this app
    audience: 'labs.wepublish.ch',

    // CRITICAL: Explicit algorithm - prevents algorithm confusion attacks
    algorithms: ['RS256'],

    // Allow 60 seconds clock skew
    clockTolerance: 60
  });

  // Explicit expiration check (jose does this, but be explicit for clarity)
  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  // Validate required claims
  if (!payload.sub) {
    throw new Error('Token missing required claim: sub');
  }

  return payload as JWTPayload;
}

/**
 * Check if a token is expired without full verification.
 *
 * Useful for quick checks before making API calls.
 */
export function isTokenExpired(token: string): boolean {
  try {
    // Decode without verification (just to check expiration)
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;

    // Add 60 second buffer
    return payload.exp < Date.now() / 1000 - 60;
  } catch {
    return true;
  }
}

/**
 * Clear the cached public key (useful for testing or key rotation).
 */
export function clearKeyCache(): void {
  cachedPublicKey = null;
}
