# coJournalist-Lite Authentication

## Overview

coJournalist-Lite uses the Labs monorepo's dual-mode authentication pattern: mock users for development and JWT tokens for production. The same user_id format works in both modes, enabling seamless migration.

## Authentication Modes

### 1. Mock User Mode (MVP)

For development and initial deployment without CMS integration.

**How it works:**
1. User selects or enters a mock user ID on login screen
2. ID is stored in localStorage (`dev_user_id`)
3. Auth store creates mock user object with this ID
4. All API calls include user_id in request headers

**Configuration:**
```typescript
// stores/auth.ts
import { auth } from '@shared/stores/auth';

export function initMockAuth() {
  const mockUserId = localStorage.getItem('dev_user_id') || 'tester-1';

  auth.mockAuth({
    sub: mockUserId,           // Becomes user_id in all tables
    email: `${mockUserId}@test.local`,
    name: `Test Benutzer (${mockUserId})`,
    roles: ['user'],
  });
}
```

**Login UI:**
```svelte
<!-- components/LoginForm.svelte -->
<script lang="ts">
  let userId = $state('');

  function login() {
    localStorage.setItem('dev_user_id', userId);
    initMockAuth();
  }
</script>

<form onsubmit={login}>
  <input
    type="text"
    bind:value={userId}
    placeholder="Benutzer-ID eingeben"
  />
  <button type="submit">Anmelden</button>
</form>
```

### 2. JWT Mode (Future)

For production with wepublish CMS integration.

**How it works:**
1. App is embedded as iframe in CMS
2. Parent window sends JWT via postMessage
3. Labs shared auth verifies JWT signature
4. User extracted from JWT claims

**No code changes needed** - Labs shared auth handles mode detection automatically:

```typescript
// @shared/stores/auth.ts (existing)
export function initAuth() {
  if (window.parent !== window) {
    // In iframe: request JWT from parent
    setupIframeAuth();
  } else {
    // Standalone: use mock user
    console.warn('[Auth] Running in dev mode with mock user');
    mockAuth({ sub: 'dev-user', ... });
  }
}
```

## User ID Format

Both modes use the same user_id format for database compatibility:

| Mode | Source | Example ID |
|------|--------|------------|
| Mock | localStorage | `tester-1`, `journalist-berlin` |
| JWT | `sub` claim | `usr_abc123xyz` |

**Database queries work identically:**
```sql
-- Works for both mock and JWT users
SELECT * FROM scouts WHERE user_id = 'tester-1';
SELECT * FROM scouts WHERE user_id = 'usr_abc123xyz';
```

## Frontend Integration

### Auth Store Usage

```svelte
<script lang="ts">
  import { auth } from './stores/auth';
</script>

{#if $auth.loading}
  <Loading label="Authentifizierung..." />
{:else if $auth.error}
  <p class="error">{$auth.error}</p>
{:else if $auth.user}
  <main>
    <p>Willkommen, {$auth.user.name}</p>
    <!-- App content -->
  </main>
{:else}
  <LoginForm />
{/if}
```

### API Requests

User ID is passed to Edge Functions via request headers:

```typescript
// lib/api.ts
import { auth } from '../stores/auth';
import { get } from 'svelte/store';

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const user = get(auth).user;
  if (!user) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
      'x-user-id': user.id,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

## Edge Function Integration

### Extracting User ID

Edge Functions extract user_id from request headers:

```typescript
// supabase/functions/_shared/auth.ts
export function getUserId(req: Request): string {
  const userId = req.headers.get('x-user-id');

  if (!userId) {
    throw new Error('Missing user ID');
  }

  return userId;
}

// Usage in Edge Function
import { getUserId } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  try {
    const userId = getUserId(req);

    // Use userId for database queries
    const { data } = await supabase
      .from('scouts')
      .select('*')
      .eq('user_id', userId);

    return new Response(JSON.stringify(data));
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 401 }
    );
  }
});
```

### Service Role Access

For scheduled jobs (pg_cron), Edge Functions use service role:

```typescript
// supabase/functions/_shared/supabase-client.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Service role client for scheduled jobs
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// The scout's user_id is stored in the scout record
// pg_cron dispatches with scoutId, function looks up user_id
```

## Row Level Security

RLS policies use the user_id from request context:

```sql
-- For Edge Functions with x-user-id header
CREATE POLICY "Users can access their own data"
ON scouts FOR ALL
USING (
  user_id = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    current_setting('request.headers', true)::json->>'x-user-id'
  )
);

-- For service role (bypasses RLS)
-- Service role has full access, no policy needed
```

**Note:** In practice, Edge Functions use service role client for simplicity, with user_id filtering in queries.

## Session Management

### Logout

```typescript
// stores/auth.ts
export function logout() {
  localStorage.removeItem('dev_user_id');
  auth.clear();
  window.location.href = '/';
}
```

### Session Persistence

Mock user sessions persist via localStorage:

```typescript
// main.ts
import { initMockAuth } from './stores/auth';

// Check for existing session on app load
const existingUserId = localStorage.getItem('dev_user_id');
if (existingUserId) {
  initMockAuth();
}
```

## Migration Path to JWT

When wepublish CMS integration is ready:

1. **No frontend code changes** - Labs shared auth handles iframe detection
2. **No database changes** - user_id column works for both formats
3. **Edge Function changes** - Add JWT verification option:

```typescript
// _shared/auth.ts (updated)
export async function getUserId(req: Request): Promise<string> {
  // Check for JWT first (production)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ey')) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) return user.id;
  }

  // Fall back to x-user-id header (development)
  const userId = req.headers.get('x-user-id');
  if (userId) return userId;

  throw new Error('Authentication required');
}
```

## Security Considerations

### MVP (Mock Auth)

- **Not suitable for public deployment** - anyone can claim any user ID
- **Use for**: development, internal testing, demo
- **Data isolation**: RLS still enforces user_id scoping

### Production (JWT)

- **Cryptographic verification** of user identity
- **Token expiration** handled by CMS
- **Audience/issuer validation** in JWT verification

### Shared Protections

- **HTTPS only** - all API calls over TLS
- **RLS enabled** - database enforces user isolation
- **Service role protected** - only Edge Functions have admin access
- **API keys in Vault** - not exposed to frontend

## Testing

### Mock User Testing

```bash
# Test with different users
localStorage.setItem('dev_user_id', 'user-a');
# Refresh page
# Create scouts, verify isolation

localStorage.setItem('dev_user_id', 'user-b');
# Refresh page
# Verify user-a's scouts not visible
```

### Edge Function Testing

```bash
# Test user ID extraction
curl -X GET https://xxx.supabase.co/functions/v1/scouts \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-user-id: tester-1"
```
