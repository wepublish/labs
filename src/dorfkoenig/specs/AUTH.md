# Dorfkönig Authentication

## Overview

Dorfkönig uses a two-mode authentication system: URL token for CMS iframe embedding (production) and mock user login for local development.

## Auth v1: URL Token Mode (Current Production)

The app is embedded as an iframe in the WePublish CMS. The CMS passes a `?token=` URL parameter to identify the user.

### Flow

1. CMS loads iframe: `https://wepublish.github.io/labs/dorfkoenig/?token=493c6d51531c7444365b0ec094bc2d67`
2. `main.ts` reads `?token=` from URL **before** any GitHub Pages SPA redirect
3. `initAuth(token, inIframe)` is called with the token and iframe context
4. Token is stored in `localStorage` as `dev_user_id` for session persistence
5. Token is stripped from URL via `history.replaceState` (security: prevents leaking in browser history, Referer headers)
6. Auth store creates user: `{ id: token, name: "CMS Benutzer (493c6d51...)", email: "token@wepublish.ch" }`
7. All API calls send `x-user-id: <token>` header via `lib/api.ts`

### Priority Chain (`initAuth`)

```
1. URL token present?          → authenticate with token, store in localStorage
2. localStorage session?       → restore session
3. In iframe without token?    → show error: "Kein Token gefunden. Bitte über das CMS zugreifen."
4. Not in iframe, no session?  → show login page (local dev)
```

### Security Measures

- `<meta name="referrer" content="no-referrer">` — prevents token leaking via Referer headers to external resources
- Token stripped from URL after reading — prevents exposure in browser history
- Token read before `replaceState` — ensures GitHub Pages SPA redirect doesn't lose the parameter

## Mock User Mode (Local Dev)

For standalone browser development without CMS integration.

1. User opens `http://localhost:3200/dorfkoenig/` (no token, not in iframe)
2. Login page is shown with preset users
3. User selects or enters a mock user ID
4. ID is stored in `localStorage` (`dev_user_id`)
5. Auth store creates mock user object

### Preset Users

```typescript
export const PRESET_USERS = [
  { id: '493c6d51531c7444365b0ec094bc2d67', name: 'We.Publish Redaktion' },
  { id: 'journalist-1', name: 'Journalist Berlin' },
  { id: 'journalist-2', name: 'Journalist Hamburg' },
];
```

## API Integration

User ID is passed to Edge Functions via request headers:

```typescript
// lib/api.ts — all API calls include this header
headers: {
  'x-user-id': getUserId(),  // from auth store
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
}
```

Edge Functions extract `x-user-id` from the request. No JWT verification — `verify_jwt = false` on all functions.

### Testing with curl

```bash
curl -X GET https://xxx.supabase.co/functions/v1/scouts \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-user-id: 493c6d51531c7444365b0ec094bc2d67"
```

## Security Notes (v1)

### What v1 provides

- **User isolation via RLS**: Database enforces user_id scoping on all tables
- **Token not in URL after load**: `history.replaceState` removes it
- **No Referer leaking**: `no-referrer` meta tag
- **HTTPS only**: All API calls over TLS
- **Service role protected**: Only Edge Functions have admin access

### What v1 does NOT provide

- **No server-side token verification**: The token is used as-is as the user_id. Anyone who knows the token can impersonate the user.
- **No token expiration**: The token is permanent (until changed)
- **No cryptographic verification**: No JWT signature check on the token

This is acceptable for the MVP because:
- The app is embedded in the CMS (not publicly accessible)
- The token is not guessable (32-char hex)
- RLS still enforces data isolation per user_id

## CTO Questions for Auth v2

Before building server-side token verification, we need answers to:

1. **Token verification API**: Does the CMS provide an endpoint to verify tokens? (e.g., `GET /api/verify-token?token=xxx` → `{ user_id, name, email }`)
2. **User metadata**: What user data should we store in Supabase? (name, email, organization?)
3. **Users table**: Should we create a `users` table in Supabase, or keep using raw `user_id` strings in all tables?
4. **Token lifecycle**: Are tokens permanent or do they expire? If expiring, what's the refresh flow?
5. **User provisioning**: How are new users created? Options:
   - Auto-create on first token verification
   - Webhook from CMS on user creation
   - Pre-provisioned by admin
6. **Migration to JWT/postMessage**: Is the long-term plan to switch to JWT tokens via postMessage (as designed in the shared auth bridge)? If so, what's the timeline?
