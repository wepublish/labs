# Labs Monorepo - Agent Guide

## Project Overview

Multi-app monorepo hosting Svelte 5 + TypeScript applications deployed to GitHub Pages at `wepublish.github.io/labs/{app-name}/`. Apps are embedded as iframes in a parent CMS and authenticate via JWT postMessage.

## Key Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Build config, path aliases, app discovery |
| `tsconfig.json` | TypeScript config with path mappings |
| `package.json` | Scripts and dependencies |
| `SPEC.md` | Full specification (security, patterns, API) |
| `.env.example` | Required environment variables |

## Repository Structure

```
src/
├── shared/           # Shared library (NOT an app)
│   ├── components/   # Button, Card, Loading, ErrorBoundary
│   ├── stores/       # auth store
│   ├── utils/        # supabase, jwt, iframe-bridge
│   └── styles/       # global.css
├── _template/        # Template for new apps (NOT deployed)
├── dorfkoenig/       # Dorfkoenig app
├── slides/           # We.Publish AI strategy presentation (static HTML, no Svelte)
└── {app-name}/       # Your apps (auto-discovered)
```

## App Discovery

Vite auto-discovers apps by scanning `src/*/index.html`. Excluded: `shared/`, `_template/`.

Each app requires:
- `index.html` - Entry point
- `main.ts` - Mounts Svelte app
- `App.svelte` - Root component

## Path Aliases

```typescript
import { supabase } from '@shared/utils/supabase';
import { auth } from '@shared/stores/auth';
import { Button, Card } from '@shared/components';
```

## Commands

```bash
npm run dev          # Start dev server (https://localhost:3200)
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run new-app NAME # Create new app from template
```

## Environment Variables

Copy `.env.example` to `.env.local`:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `VITE_JWT_PUBLIC_KEY` - RSA public key for JWT verification
- `VITE_JWT_ISSUER` - Expected JWT issuer

## Security Requirements

1. **RLS Required**: All Supabase tables must have Row Level Security enabled
2. **JWT Validation**: Tokens validated for issuer, audience (`labs.wepublish.ch`), RS256 algorithm
3. **Origin Allowlist**: iframe-bridge only accepts messages from approved CMS origins

## Svelte 5 Patterns

Use runes syntax:
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => console.log(count));
</script>
```

## Creating a New App

```bash
npm run new-app my-app
# Creates src/my-app/ with all required files
# Access at https://localhost:3200/my-app/
```

## Deployment

Push to `main` triggers GitHub Actions: typecheck → lint → build → deploy to Pages.

Production URLs: `https://wepublish.github.io/labs/{app-name}/`
