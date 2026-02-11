# Labs Platform Overview

## Introduction

The Labs platform is a multi-application monorepo designed to host interactive web applications for wePublish. Each application is a standalone Svelte 5 + TypeScript application that shares common utilities, components, and authentication infrastructure.

## Architecture

### Deployment Model

Applications are deployed to GitHub Pages and accessed via:
- **Production**: `https://wepublish.github.io/labs/{app-name}/`
- **Development**: `https://localhost:3200/{app-name}/`

Apps are typically embedded as iframes within the wePublish CMS, receiving authentication tokens via postMessage.

### Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Svelte 5 with runes syntax |
| Language | TypeScript (strict mode) |
| Build Tool | Vite 6 with multi-entry configuration |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Authentication | JWT from parent CMS via iframe postMessage |
| Deployment | GitHub Pages with automatic CI/CD |

### Monorepo Structure

```
labs/
├── src/
│   ├── shared/              # Shared code library
│   │   ├── components/      # Reusable UI components
│   │   ├── stores/          # Svelte stores (auth state)
│   │   ├── utils/           # Utilities (supabase, jwt, iframe-bridge)
│   │   └── styles/          # Global CSS variables and reset
│   ├── _template/           # App template (not deployed)
│   ├── demo-app/            # Example application
│   └── {app-name}/          # Your applications
├── public/                  # Static assets (copied to all apps)
├── scripts/                 # Build and scaffolding scripts
├── docs/                    # Documentation
└── .github/workflows/       # CI/CD pipelines
```

## Shared Library

### Components

| Component | Description |
|-----------|-------------|
| `Button` | Styled button with `primary`, `secondary`, `ghost`, `danger` variants |
| `Card` | Container with optional header snippet, shadow, and padding |
| `Loading` | Spinner with optional label |
| `ErrorBoundary` | Catches errors in child components and displays fallback |

### Stores

#### Auth Store (`@shared/stores/auth`)

Manages authentication state across the application:

```typescript
interface AuthState {
  loading: boolean;
  user: User | null;
  error: string | null;
}

interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}
```

### Utilities

#### Supabase Client (`@shared/utils/supabase`)

Pre-configured Supabase client with auth token management:

```typescript
import { supabase, setAuthToken, isSupabaseConfigured } from '@shared/utils/supabase';

// Check if Supabase is configured
if (isSupabaseConfigured()) {
  // Set auth context after JWT validation
  setAuthToken(validatedToken);

  // Query with RLS context
  const { data, error } = await supabase.from('items').select('*');
}
```

#### JWT Verification (`@shared/utils/jwt`)

Validates tokens from the parent CMS:
- Verifies RS256 signature against configured public key
- Validates issuer matches `VITE_JWT_ISSUER`
- Validates audience is `labs.wepublish.ch`
- Checks expiration with 60-second clock tolerance

#### iframe Bridge (`@shared/utils/iframe-bridge`)

Secure communication with parent CMS:
- Origin allowlist enforcement
- Nonce verification for request/response matching
- Timeout handling for unresponsive parents

## Authentication Flow

### Production (iframe)

```
Parent CMS                          Labs iframe
    │                                    │
    │  ◄──── REQUEST_AUTH_TOKEN ─────   │
    │         {nonce: "xyz123"}          │
    │                                    │
    │  ────── AUTH_TOKEN ───────────►   │
    │   {token: "...", nonce: "xyz123"} │
    │                                    │
    │                              JWT verification
    │                              Auth store update
    │                              Supabase auth context
```

### Development (standalone)

When running outside an iframe in development mode:
1. Auth system detects standalone context
2. Mock user is automatically injected
3. Console warning indicates mock auth is active

## Security Model

### Defense Layers

1. **Origin Validation**: Only messages from approved CMS origins are processed
2. **Nonce Verification**: Each auth request includes a unique nonce that must match the response
3. **JWT Validation**: Tokens verified for issuer, audience, algorithm, and expiration
4. **Row Level Security**: All Supabase tables must have RLS policies

### Required RLS Pattern

```sql
-- Always enable RLS
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- User can only access their own data
CREATE POLICY "Users access own data" ON my_table
  FOR ALL USING (auth.uid() = user_id);
```

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start dev server (HTTPS required for iframe testing)
npm run dev

# Open https://localhost:3200/{app-name}/
```

### Creating New Apps

```bash
# Use the CLI to scaffold a new app
npm run new-app my-new-app

# This creates:
# - src/my-new-app/index.html
# - src/my-new-app/main.ts
# - src/my-new-app/App.svelte
# - src/my-new-app/styles.css
```

### Code Quality

```bash
npm run typecheck    # TypeScript validation
npm run lint         # ESLint checks
npm run format       # Prettier formatting
```

## Deployment

### Automatic (Recommended)

Push to `main` branch triggers GitHub Actions:
1. Install dependencies
2. Type check
3. Lint
4. Build for production
5. Deploy to GitHub Pages

### Manual

```bash
npm run build        # Build all apps
npm run preview      # Preview production build locally
```

## Configuration Reference

### vite.config.ts

Key settings:
- **base**: `/labs/` in production, `/` in development
- **root**: `src/` directory
- **resolve.alias**: Path mappings for `@shared` and `@`
- **build.rollupOptions.input**: Auto-discovered from `src/*/index.html`

### tsconfig.json

Key settings:
- **strict**: `true` - Full TypeScript strict mode
- **paths**: `@shared/*` → `src/shared/*`, `@/*` → `src/*`
- **verbatimModuleSyntax**: `true` - Explicit type imports

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `VITE_JWT_PUBLIC_KEY` | RSA public key (PEM format) | Yes |
| `VITE_JWT_ISSUER` | Expected JWT issuer URL | Yes |
