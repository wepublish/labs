/**
 * Secure iframe communication bridge for JWT authentication.
 *
 * Security measures:
 * 1. Strict origin allowlist - only accept messages from approved origins
 * 2. Nonce verification - prevent replay attacks
 * 3. No wildcard origins in production
 */

export interface AuthMessage {
  type: 'AUTH_TOKEN';
  token: string;
  nonce: string;
}

export interface AuthRequestMessage {
  type: 'REQUEST_AUTH_TOKEN';
  nonce: string;
}

export type MessageHandler = (token: string) => void;

// STRICT origin allowlist - only these origins can send auth tokens
const ALLOWED_ORIGINS: readonly string[] = [
  'https://cms.wepublish.ch',
  'https://staging.cms.wepublish.ch'
];

// Dev origins (only in development mode)
const DEV_ORIGINS: readonly string[] = ['http://localhost:3000', 'http://localhost:5173'];

let pendingNonce: string | null = null;
let messageHandler: MessageHandler | null = null;
let isListenerSetup = false;

/**
 * Generate a cryptographically secure nonce for request/response matching.
 */
function generateNonce(): string {
  return crypto.randomUUID();
}

/**
 * Check if an origin is in the allowlist.
 */
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  // Allow dev origins only in development mode
  if (import.meta.env.DEV && DEV_ORIGINS.includes(origin)) {
    return true;
  }

  return false;
}

/**
 * Handle incoming postMessage events.
 */
function handleMessage(event: MessageEvent): void {
  // CRITICAL: Validate origin FIRST before any processing
  if (!isAllowedOrigin(event.origin)) {
    console.warn('[iframe-bridge] Rejected message from unauthorized origin:', event.origin);
    return;
  }

  // Validate message structure
  if (!event.data || typeof event.data !== 'object') {
    return;
  }

  const message = event.data as AuthMessage;

  // Only handle AUTH_TOKEN messages
  if (message.type !== 'AUTH_TOKEN') {
    return;
  }

  // Validate nonce matches our pending request
  if (!pendingNonce) {
    console.warn('[iframe-bridge] Received token without pending request');
    return;
  }

  if (message.nonce !== pendingNonce) {
    console.warn('[iframe-bridge] Nonce mismatch - potential replay attack');
    return;
  }

  // Clear nonce after successful validation (single use)
  pendingNonce = null;

  // Validate token exists
  if (!message.token || typeof message.token !== 'string') {
    console.error('[iframe-bridge] Invalid token in message');
    return;
  }

  // Pass token to handler for JWT verification
  if (messageHandler) {
    messageHandler(message.token);
  }
}

/**
 * Set up the message listener (idempotent).
 */
function setupListener(): void {
  if (isListenerSetup) return;

  window.addEventListener('message', handleMessage);
  isListenerSetup = true;
}

/**
 * Request an auth token from the parent frame.
 *
 * The parent must respond with an AUTH_TOKEN message containing the same nonce.
 */
export function requestAuthToken(): void {
  // Set up listener if not already done
  setupListener();

  // Generate new nonce for this request
  pendingNonce = generateNonce();

  // Send request to parent
  // Using '*' for targetOrigin because we validate incoming messages by origin
  // The parent validates our origin before responding
  const request: AuthRequestMessage = {
    type: 'REQUEST_AUTH_TOKEN',
    nonce: pendingNonce
  };

  window.parent.postMessage(request, '*');

  console.log('[iframe-bridge] Requested auth token from parent');
}

/**
 * Register a handler for received auth tokens.
 *
 * The handler receives the raw JWT string and should validate it.
 */
export function onAuthToken(handler: MessageHandler): void {
  messageHandler = handler;
  setupListener();
}

/**
 * Remove the message listener and clear state.
 */
export function cleanup(): void {
  if (isListenerSetup) {
    window.removeEventListener('message', handleMessage);
    isListenerSetup = false;
  }
  pendingNonce = null;
  messageHandler = null;
}

/**
 * Check if we're running inside an iframe.
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Same-origin policy blocked access = definitely in iframe
    return true;
  }
}
