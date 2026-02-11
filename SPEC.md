# Labs Multi-App Monorepo Specification

## Overview

This repository hosts interactive web applications deployed to GitHub Pages at `wepublish.github.io/labs/{app-name}/`. Each app is a standalone Svelte 5 + TypeScript application that shares common utilities and components.

## Architecture

### Repository Structure

```
labs/
├── src/
│   ├── shared/              # Shared code across all apps
│   │   ├── components/      # Reusable UI components
│   │   ├── stores/          # Svelte stores (auth, etc.)
│   │   ├── utils/           # Utilities (supabase, jwt, iframe-bridge)
│   │   └── styles/          # Global CSS
│   ├── _template/           # Template for new apps (not deployed)
│   ├── demo-app/            # Example application
│   └── {app-name}/          # Your applications
├── public/                  # Static assets (copied to all apps)
├── scripts/                 # Build and scaffolding scripts
├── dist/                    # Build output (git-ignored)
└── .github/workflows/       # CI/CD pipelines
```

### Technology Stack

- **Framework**: Svelte 5 with runes syntax
- **Language**: TypeScript (strict mode)
- **Build Tool**: Vite with multi-entry configuration
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Authentication**: JWT from parent CMS via iframe postMessage
- **Deployment**: GitHub Pages with automatic deploys

## Application Structure Conventions

Each app must have this structure:

```
src/{app-name}/
├── index.html       # Entry point (must exist for Vite discovery)
├── main.ts          # Svelte mount and initialization
├── App.svelte       # Root component
├── styles.css       # App-specific styles (optional)
└── components/      # App-specific components (optional)
```

### index.html Requirements

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App Name | Labs</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

### main.ts Pattern

```typescript
import { mount } from 'svelte';
import App from './App.svelte';
import { initAuth } from '@shared/stores/auth';
import '@shared/styles/global.css';
import './styles.css';

// Handle GitHub Pages SPA redirect
const params = new URLSearchParams(window.location.search);
const redirectedRoute = params.get('route');
if (redirectedRoute) {
  window.history.replaceState(null, '', redirectedRoute);
}

// Initialize authentication
initAuth();

// Mount Svelte app
mount(App, { target: document.getElementById('app')! });
```

## Shared Library Usage

### Importing Shared Code

Use path aliases configured in `vite.config.ts` and `tsconfig.json`:

```typescript
// Import from shared utilities
import { supabase } from '@shared/utils/supabase';
import { verifyToken } from '@shared/utils/jwt';
import { auth, initAuth } from '@shared/stores/auth';

// Import shared components
import { Button, Card, Loading, ErrorBoundary } from '@shared/components';
```

### Available Shared Components

| Component | Purpose |
|-----------|---------|
| `Button` | Styled button with variants |
| `Card` | Container with shadow and padding |
| `Loading` | Loading spinner |
| `ErrorBoundary` | Catches and displays errors gracefully |

## Security Requirements

### JWT Validation (CRITICAL)

All JWT tokens from the parent CMS must be validated with:

1. **Issuer validation**: Token must be issued by `VITE_JWT_ISSUER`
2. **Audience validation**: Token must have audience `labs.wepublish.ch`
3. **Algorithm restriction**: Only RS256 allowed (prevents algorithm confusion attacks)
4. **Expiration check**: Tokens are rejected if expired

```typescript
// Example: jwt.ts enforces all these checks
const { payload } = await jwtVerify(token, publicKey, {
  issuer: import.meta.env.VITE_JWT_ISSUER,
  audience: 'labs.wepublish.ch',
  algorithms: ['RS256'],
  clockTolerance: 60
});
```

### iframe postMessage Security (CRITICAL)

The iframe bridge implements defense-in-depth:

1. **Origin allowlist**: Only messages from approved origins are processed
2. **Nonce verification**: Each request includes a unique nonce that must match the response
3. **No wildcard origins**: Production origins are explicitly listed

```typescript
// ALLOWED_ORIGINS in iframe-bridge.ts
const ALLOWED_ORIGINS = [
  'https://cms.wepublish.ch',
  'https://staging.cms.wepublish.ch'
];
```

### Supabase Row Level Security (MANDATORY)

**RLS must be enabled on ALL tables.** Never bypass RLS.

#### Before Creating Any Table

1. Design RLS policies FIRST
2. Consider who can read, insert, update, delete
3. Test policies with different user contexts

#### RLS Policy Examples

```sql
-- Enable RLS (required)
ALTER TABLE user_content ENABLE ROW LEVEL SECURITY;

-- Users can only read their own data
CREATE POLICY "Users can view own data" ON user_content
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY "Users can insert own data" ON user_content
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users can update own data" ON user_content
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own data
CREATE POLICY "Users can delete own data" ON user_content
  FOR DELETE USING (auth.uid() = user_id);
```

#### Dangerous Patterns to AVOID

```sql
-- NEVER DO THIS for write operations
CREATE POLICY "Anyone can write" ON tablename
  FOR INSERT WITH CHECK (true);  -- DANGEROUS!

-- NEVER expose service role key to frontend
-- The anon key + RLS is the correct pattern
```

## Authentication Flow

### Production Flow (in iframe)

```
┌─────────────────┐    postMessage     ┌──────────────────┐
│   Parent CMS    │ ────────────────▶  │   Labs iframe    │
│  (wepublish.ch) │                    │                  │
│                 │  REQUEST_AUTH_TOKEN│                  │
│                 │ ◀──────────────────│  iframe-bridge   │
│                 │    {nonce: "xyz"}  │                  │
│                 │                    │                  │
│  Validate child │ ────────────────▶  │  Validate origin │
│  origin + nonce │    AUTH_TOKEN      │  + nonce         │
│                 │  {token, nonce}    │                  │
│                 │                    │  jwt.ts verifies │
│                 │                    │  token signature │
│                 │                    │                  │
│                 │                    │  auth store      │
│                 │                    │  updates state   │
└─────────────────┘                    └──────────────────┘
```

### Development Flow (standalone)

When running outside an iframe in development:

1. `initAuth()` detects we're not in an iframe
2. Mock user is injected with dev credentials
3. Console warning indicates mock auth is active

```typescript
// Automatic in dev mode outside iframe
[Auth] Running in dev mode with mock user
```

### Auth Store Usage

```svelte
<script lang="ts">
  import { auth } from '@shared/stores/auth';
</script>

{#if $auth.loading}
  <Loading />
{:else if $auth.user}
  <p>Welcome, {$auth.user.name}!</p>
{:else}
  <p>Not authenticated</p>
{/if}
```

## Supabase Integration

### Client Initialization

```typescript
import { supabase } from '@shared/utils/supabase';

// Query data (RLS policies apply automatically)
const { data, error } = await supabase
  .from('items')
  .select('*')
  .eq('status', 'active');
```

### Setting Auth Context

When you receive a JWT, set it on the Supabase client:

```typescript
import { supabase, setAuthToken } from '@shared/utils/supabase';

// After JWT validation
setAuthToken(validatedToken);

// Now queries use the authenticated context
const { data } = await supabase.from('user_data').select('*');
```

### Error Handling Pattern

```typescript
async function fetchData() {
  const { data, error } = await supabase
    .from('items')
    .select('*');

  if (error) {
    console.error('Supabase error:', error.message);
    throw new Error(`Failed to fetch items: ${error.message}`);
  }

  return data;
}
```

## Development Workflow

### Getting Started

```bash
# Install dependencies
npm install

# Start dev server (HTTPS required for iframe testing)
npm run dev

# Open https://localhost:3200/{app-name}/
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server with HTTPS |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run new-app <name>` | Create a new app from template |

### Environment Variables

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

Required variables:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (safe for frontend)
- `VITE_JWT_PUBLIC_KEY` - Public key for JWT verification
- `VITE_JWT_ISSUER` - Expected JWT issuer (e.g., `https://cms.wepublish.ch`)

### PR-Based Workflow

1. Create feature branch from `main`
2. Make changes and test locally
3. Run `npm run typecheck && npm run lint` before committing
4. Create PR with description of changes
5. Get review from team member
6. Merge to `main` triggers automatic deployment

## Deployment Process

### Automatic Deployment

Pushing to `main` triggers the GitHub Actions workflow:

1. Install dependencies
2. Type check
3. Lint
4. Build for production (with `/labs/` base path)
5. Deploy to GitHub Pages

### Manual Deployment

```bash
# Build locally
npm run build

# Preview build
npm run preview
```

### URL Structure

- Production: `https://wepublish.github.io/labs/{app-name}/`
- Development: `https://localhost:3200/{app-name}/`

## Creating New Applications

### Using the CLI

```bash
npm run new-app my-new-app
```

This creates `src/my-new-app/` with all necessary files.

### Manual Creation

1. Copy `src/_template/` to `src/{app-name}/`
2. Update `<title>` in `index.html`
3. Modify `App.svelte` as needed
4. Start dev server to verify

### App Discovery

Vite automatically discovers apps by scanning for `src/*/index.html` files. No configuration needed.

Excluded directories:
- `src/shared/` - Shared library
- `src/_template/` - Template (not deployed)

## Svelte 5 Patterns

### Runes Syntax (Preferred)

Svelte 5 introduces runes for reactivity:

```svelte
<script lang="ts">
  // Reactive state
  let count = $state(0);

  // Derived values
  let doubled = $derived(count * 2);

  // Effects
  $effect(() => {
    console.log(`Count is now ${count}`);
  });

  // Props
  interface Props {
    title: string;
    onClose?: () => void;
  }
  let { title, onClose }: Props = $props();
</script>
```

### Legacy Syntax (Avoid in New Code)

Svelte 4 patterns still work but prefer runes:

```svelte
<script lang="ts">
  // Avoid: Svelte 4 reactive declaration
  export let title: string;
  let count = 0;
  $: doubled = count * 2;
</script>
```

### Component Patterns

```svelte
<!-- Button with variants -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  }

  let {
    variant = 'primary',
    disabled = false,
    onclick,
    children
  }: Props = $props();
</script>

<button
  class="btn btn-{variant}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>
```

### Error Boundaries

Wrap components that may fail:

```svelte
<script lang="ts">
  import { ErrorBoundary } from '@shared/components';
</script>

<ErrorBoundary>
  <RiskyComponent />
</ErrorBoundary>
```

## Troubleshooting

### "Module not found: @shared/..."

Ensure path aliases are configured in both:
- `vite.config.ts` (resolve.alias)
- `tsconfig.json` (paths)

### "CORS error when connecting to Supabase"

Check that your Supabase project has the correct URL in allowed origins.

### "JWT validation failed"

1. Check `VITE_JWT_ISSUER` matches the token's `iss` claim
2. Verify the public key is correct
3. Ensure token hasn't expired

### "404 on page refresh (GitHub Pages)"

The `public/404.html` workaround should handle this. If not:
1. Check the 404.html was copied to dist
2. Verify the redirect logic matches your base path

### "Mock auth not working in dev"

Mock auth only activates when:
1. `import.meta.env.DEV` is true (dev server running)
2. Not inside an iframe (`window.self === window.top`)

## Security Checklist

Before deploying any app, verify:

- [ ] RLS enabled on all Supabase tables used
- [ ] RLS policies restrict access appropriately
- [ ] No hardcoded secrets in code (use env vars)
- [ ] JWT audience and issuer are validated
- [ ] iframe-bridge only accepts allowed origins
- [ ] Error messages don't leak sensitive info
- [ ] User input is sanitized before database queries
