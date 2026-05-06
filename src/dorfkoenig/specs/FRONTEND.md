# Dorfkoenig Frontend Specification

## Overview

Svelte 5 SPA using Labs monorepo patterns. German-only UI deployed to GitHub Pages.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Svelte 5 (with runes) |
| Build | Vite 6 |
| Styling | CSS with design tokens |
| State | Svelte stores |
| HTTP | Fetch API |
| Routing | Hash-based SPA routing |

## File Structure

```
src/dorfkoenig/
├── index.html              # Entry point
├── main.ts                 # App initialization
├── App.svelte              # Root component with router
├── styles.css              # App-specific styles
│
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── api.ts              # API wrapper functions
│   ├── types.ts            # TypeScript interfaces
│   ├── execution-labels.ts # Shared scout execution outcome labels
│   └── constants.ts        # App constants
│
├── stores/
│   ├── auth.ts             # Auth store (extends shared)
│   ├── scouts.ts           # Scout management
│   ├── units.ts            # Information units
│   ├── executions.ts       # Execution history
│   └── ui.ts               # UI state (modals)
│
├── components/
│   ├── Layout.svelte       # Main layout wrapper (nav + modals)
│   ├── LoginForm.svelte    # Mock user selector
│   ├── scouts/
│   │   ├── ScoutList.svelte
│   │   ├── ScoutCard.svelte
│   │   └── ScoutForm.svelte
│   ├── executions/
│   │   ├── ExecutionList.svelte
│   │   └── ExecutionCard.svelte
│   ├── compose/
│   │   ├── ComposePanel.svelte
│   │   ├── UnitList.svelte
│   │   ├── SearchBar.svelte
│   │   ├── LocationFilter.svelte
│   │   ├── DraftPreview.svelte
│   │   ├── DraftContent.svelte
│   │   ├── DraftPromptEditor.svelte
│   │   ├── DraftSlideOver.svelte
│   │   └── SelectionBar.svelte
│   └── ui/
│       ├── ModeToggle.svelte
│       ├── ProgressIndicator.svelte
│       ├── FilterSelect.svelte
│       ├── ScopeToggle.svelte
│       ├── PanelFilterBar.svelte
│       ├── ScoutModal.svelte
│       ├── ScoutWizardStep1.svelte
│       ├── ScoutWizardStep2.svelte
│       ├── ScoutTestResult.svelte
│       ├── UploadModal.svelte
│       ├── UploadTextTab.svelte
│       ├── UploadPhotoTab.svelte
│       ├── UploadPdfTab.svelte
│       └── LocationAutocomplete.svelte
│
├── bajour/                     # Bajour village newsletter feature (feature-flagged)
│   ├── api.ts                  # Bajour API client
│   ├── store.ts                # Bajour drafts store
│   ├── types.ts                # Village, BajourDraft, selection diagnostic types
│   ├── utils.ts                # Utility functions
│   └── __tests__/
│       ├── api.test.ts
│       ├── store.test.ts
│       └── utils.test.ts
│
└── routes/
    ├── Login.svelte
    ├── ScoutDetail.svelte
    ├── History.svelte
    ├── Feed.svelte             # Scouts/uploads toggle, unit search + article drafting
    └── Drafts.svelte           # Saved Bajour drafts
```

---

## Entry Point

### index.html

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dorfkoenig | Labs</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

### main.ts

```typescript
import { mount } from 'svelte';
import App from './App.svelte';
import { initAuth } from './stores/auth';
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

---

## Routing

Hash-based routing for GitHub Pages compatibility.

### App.svelte

```svelte
<script lang="ts">
  import { auth } from './stores/auth';
  import { Loading } from '@shared/components';
  import Layout from './components/Layout.svelte';
  import Login from './routes/Login.svelte';
  import ScoutDetail from './routes/ScoutDetail.svelte';
  import History from './routes/History.svelte';
  import Feed from './routes/Feed.svelte';
  import Drafts from './routes/Drafts.svelte';

  // Simple hash-based routing
  let hash = $state(window.location.hash || '#/');

  $effect(() => {
    const handleHashChange = () => {
      hash = window.location.hash || '#/';
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  // Route parsing
  let route = $derived(hash.slice(2).split('/')[0].split('?')[0] || 'scouts');
  let routeParams = $derived(hash.slice(2).split('/').slice(1));
</script>

{#if $auth.loading}
  <div class="loading-container">
    <Loading label="Authentifizierung..." />
  </div>
{:else if $auth.error}
  <div class="auth-error">
    <div class="auth-error-content">
      <h2>Dorfkönig</h2>
      <p>{$auth.error}</p>
    </div>
  </div>
{:else if !$auth.user}
  <Login />
{:else}
  <Layout>
    {#if route === 'scouts' || route === 'manage' || route === 'feed' || route === ''}
      <Feed />
    {:else if route === 'drafts'}
      <Drafts />
    {:else if route === 'scout' && routeParams[0]}
      <ScoutDetail scoutId={routeParams[0]} />
    {:else if route === 'history'}
      <History />
    {:else}
      <Feed />
    {/if}
  </Layout>
{/if}
```

### Route Summary

| Hash | Component | Description |
|------|-----------|-------------|
| `#/scouts`, `#/manage`, `#/feed`, or `#/` | `Feed` | Scouts/uploads toggle, unit search, drafting |
| `#/drafts` | `Drafts` | Saved Bajour drafts |
| `#/scout/{id}` | `ScoutDetail` | Scout edit + execution history |
| `#/history` | `History` | All executions |

### Navigation Helper

```typescript
// lib/navigation.ts
export function navigate(path: string) {
  window.location.hash = `#/${path}`;
}

export function navigateToScout(id: string) {
  navigate(`scout/${id}`);
}
```

---

## Stores

### auth.ts

```typescript
import { auth as sharedAuth, type AuthState } from '@shared/stores/auth';
import { get } from 'svelte/store';

// Re-export shared auth store
export const auth = sharedAuth;

// Mock auth initialization
export function initAuth() {
  const existingUserId = localStorage.getItem('dev_user_id');

  if (existingUserId) {
    sharedAuth.mockAuth({
      sub: existingUserId,
      email: `${existingUserId}@test.local`,
      name: `Test Benutzer (${existingUserId})`,
      roles: ['user'],
    });
  }
}

// Login with mock user
export function login(userId: string) {
  localStorage.setItem('dev_user_id', userId);
  sharedAuth.mockAuth({
    sub: userId,
    email: `${userId}@test.local`,
    name: `Test Benutzer (${userId})`,
    roles: ['user'],
  });
}

// Logout
export function logout() {
  localStorage.removeItem('dev_user_id');
  sharedAuth.clear();
}

// Get current user ID
export function getUserId(): string | null {
  return get(sharedAuth).user?.id ?? null;
}
```

### scouts.ts

```typescript
import { writable, derived } from 'svelte/store';
import { api } from '../lib/api';
import type { Scout } from '../lib/types';

interface ScoutsState {
  scouts: Scout[];
  loading: boolean;
  error: string | null;
}

function createScoutsStore() {
  const { subscribe, set, update } = writable<ScoutsState>({
    scouts: [],
    loading: false,
    error: null,
  });

  return {
    subscribe,

    async load() {
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get<Scout[]>('scouts');
        update(s => ({ ...s, scouts: data, loading: false }));
      } catch (error) {
        update(s => ({ ...s, error: error.message, loading: false }));
      }
    },

    async create(scout: Omit<Scout, 'id' | 'created_at' | 'updated_at'>) {
      const data = await api.post<Scout>('scouts', scout);
      update(s => ({ ...s, scouts: [...s.scouts, data] }));
      return data;
    },

    async update(id: string, updates: Partial<Scout>) {
      const data = await api.put<Scout>(`scouts/${id}`, updates);
      update(s => ({
        ...s,
        scouts: s.scouts.map(sc => sc.id === id ? data : sc),
      }));
      return data;
    },

    async delete(id: string) {
      await api.delete(`scouts/${id}`);
      update(s => ({
        ...s,
        scouts: s.scouts.filter(sc => sc.id !== id),
      }));
    },

    async run(id: string) {
      return api.post(`scouts/${id}/run`);
    },

    async test(id: string) {
      return api.post(`scouts/${id}/test`);
    },
  };
}

export const scouts = createScoutsStore();

// Derived stores
export const scoutsCount = derived(
  scouts,
  $s => $s.scouts.length
);
```

### units.ts

```typescript
import { writable } from 'svelte/store';
import { api } from '../lib/api';
import type { InformationUnit, Location } from '../lib/types';

interface UnitsState {
  units: InformationUnit[];
  locations: Location[];
  selectedLocation: string | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
}

function createUnitsStore() {
  const { subscribe, set, update } = writable<UnitsState>({
    units: [],
    locations: [],
    selectedLocation: null,
    searchQuery: '',
    loading: false,
    error: null,
  });

  return {
    subscribe,

    async loadLocations() {
      const data = await api.get<Location[]>('units/locations');
      update(s => ({ ...s, locations: data }));
    },

    async load(locationCity?: string, unusedOnly = true, topic?: string) {
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const params = new URLSearchParams();
        if (locationCity) params.set('location_city', locationCity);
        if (unusedOnly) params.set('unused_only', 'true');
        if (topic) params.set('topic', topic);

        const data = await api.get<InformationUnit[]>(`units?${params}`);
        update(s => ({ ...s, units: data, loading: false }));
      } catch (error) {
        update(s => ({ ...s, error: error.message, loading: false }));
      }
    },

    async search(query: string, locationCity?: string, topic?: string) {
      update(s => ({ ...s, loading: true, searchQuery: query }));
      try {
        const params = new URLSearchParams({ q: query });
        if (locationCity) params.set('location_city', locationCity);
        if (topic) params.set('topic', topic);

        const data = await api.get<InformationUnit[]>(`units/search?${params}`);
        update(s => ({ ...s, units: data, loading: false }));
      } catch (error) {
        update(s => ({ ...s, error: error.message, loading: false }));
      }
    },

    setLocation(city: string | null) {
      update(s => ({ ...s, selectedLocation: city }));
    },

    async markUsed(unitIds: string[]) {
      await api.patch('units/mark-used', { unit_ids: unitIds });
      update(s => ({
        ...s,
        units: s.units.filter(u => !unitIds.includes(u.id)),
      }));
    },
  };
}

export const units = createUnitsStore();
```

### executions.ts

```typescript
import { writable } from 'svelte/store';
import { api } from '../lib/api';
import type { Execution } from '../lib/types';

interface ExecutionsState {
  executions: Execution[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  offset: number;
}

function createExecutionsStore() {
  const { subscribe, set, update } = writable<ExecutionsState>({
    executions: [],
    loading: false,
    error: null,
    hasMore: true,
    offset: 0,
  });

  const LIMIT = 20;

  return {
    subscribe,

    async load(scoutId?: string, reset = true) {
      update(s => ({
        ...s,
        loading: true,
        error: null,
        ...(reset ? { executions: [], offset: 0 } : {}),
      }));

      try {
        const params = new URLSearchParams({ limit: String(LIMIT) });
        if (scoutId) params.set('scout_id', scoutId);

        const data = await api.get<Execution[]>(`executions?${params}`);
        update(s => ({
          ...s,
          executions: reset ? data : [...s.executions, ...data],
          hasMore: data.length === LIMIT,
          offset: reset ? LIMIT : s.offset + LIMIT,
          loading: false,
        }));
      } catch (error) {
        update(s => ({ ...s, error: error.message, loading: false }));
      }
    },

    async loadMore(scoutId?: string) {
      // Uses current offset from state
      await this.load(scoutId, false);
    },

    async getDetail(id: string): Promise<Execution> {
      return api.get(`executions/${id}`);
    },
  };
}

export const executions = createExecutionsStore();
```

---

## Components

### Layout.svelte

The layout includes a sticky navbar with:
- **Brand**: DorfKönig logo (SVG crown + village) with text
- **Center nav**: Scouts (`#/scouts`) and Entwürfe (`#/drafts`)
- **Left actions**: "Neuer Scout" CTA button and "Hochladen" upload button
- **User area**: Display name + logout icon
- **Modals**: `ScoutModal` and `UploadModal` rendered at layout level
- **Manual upload review**: PDF/text extraction stages review units in
  `newspaper_jobs.extracted_units`; the modal finalizes selected UIDs and shows
  `dedup_summary` after save so editors can see which units were deduplicated.
- **Scout run logs**: expanded scout cards lazy-load the latest three
  `scout_executions` rows and show compact outcome labels, time, unit counts,
  duplicate/merge counts, and error/summary details. `ScoutCard`,
  `ScoutRunLog`, and `ExecutionCard` must all derive their visible labels from
  `lib/execution-labels.ts`. The full history remains under `#/scout/{id}` and
  `#/history`.

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth, logout } from '../stores/auth';
  import { showScoutModal, showUploadModal } from '../stores/ui';
  import ScoutModal from './ui/ScoutModal.svelte';
  import UploadModal from './ui/UploadModal.svelte';
  import { Radar, Newspaper, Plus, Upload, LogOut } from 'lucide-svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
  // ... nav active state tracking via hash
</script>

<div class="layout">
  <nav class="navbar">
    <div class="nav-brand">
      <a href="#/">
        <!-- SVG brand symbol -->
        <span class="brand-text">Dorf<span class="brand-accent">König</span></span>
      </a>
    </div>
    <div class="nav-center">
      <a href="#/scouts">Scouts</a>
      <a href="#/drafts">Entwürfe</a>
      <button class="new-scout-btn" onclick={handleNewScout}>Neuer Scout</button>
      <button class="upload-btn" onclick={handleUpload}>Hochladen</button>
    </div>
    <div class="nav-user">
      <span>{displayName}</span>
      <button class="btn-logout" onclick={logout}>
        <LogOut size={15} />
      </button>
    </div>
  </nav>
  <main class="main-content">{@render children()}</main>
  <ScoutModal ... />
  <UploadModal ... />
</div>
```

### LoginForm.svelte

```svelte
<script lang="ts">
  import { login } from '../stores/auth';
  import { Button, Card } from '@shared/components';

  let userId = $state('');
  let error = $state('');

  const presetUsers = [
    { id: 'journalist-1', name: 'Journalist Berlin' },
    { id: 'journalist-2', name: 'Journalist Hamburg' },
    { id: '493c6d51531c7444365b0ec094bc2d67', name: 'Tester' },
  ];

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!userId.trim()) {
      error = 'Bitte geben Sie eine Benutzer-ID ein';
      return;
    }
    login(userId.trim());
  }

  function selectPreset(id: string) {
    userId = id;
    login(id);
  }
</script>

<div class="login-container">
  <Card shadow="lg">
    {#snippet header()}
      <h1>Dorfkoenig</h1>
      <p class="subtitle">Anmelden zum Fortfahren</p>
    {/snippet}

    <form onsubmit={handleSubmit}>
      <div class="form-group">
        <label for="userId">Benutzer-ID</label>
        <input
          id="userId"
          type="text"
          bind:value={userId}
          placeholder="z.B. journalist-1"
        />
        {#if error}
          <p class="error">{error}</p>
        {/if}
      </div>

      <Button type="submit" variant="primary">Anmelden</Button>
    </form>

    <div class="presets">
      <p>Oder wählen Sie einen Test-Benutzer:</p>
      <div class="preset-buttons">
        {#each presetUsers as user}
          <button
            class="preset-btn"
            onclick={() => selectPreset(user.id)}
          >
            {user.name}
          </button>
        {/each}
      </div>
    </div>
  </Card>
</div>

<style>
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: var(--spacing-lg);
  }

  h1 {
    margin: 0;
    color: var(--color-primary);
  }

  .subtitle {
    margin: var(--spacing-xs) 0 0;
    color: var(--color-text-muted);
  }

  .form-group {
    margin-bottom: var(--spacing-md);
  }

  label {
    display: block;
    margin-bottom: var(--spacing-xs);
    font-weight: 500;
  }

  input {
    width: 100%;
    padding: var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .error {
    color: var(--color-danger);
    font-size: 0.875rem;
    margin-top: var(--spacing-xs);
  }

  .presets {
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .preset-buttons {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }

  .preset-btn {
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-primary);
    cursor: pointer;
  }

  .preset-btn:hover {
    background: var(--color-primary);
    color: white;
  }
</style>
```

### scouts/ScoutCard.svelte

```svelte
<script lang="ts">
  import { Card, Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { navigate } from '../../lib/navigation';
  import type { Scout } from '../../lib/types';

  interface Props {
    scout: Scout;
  }

  let { scout }: Props = $props();

  let running = $state(false);
  let testing = $state(false);

  async function handleRun() {
    running = true;
    try {
      await scouts.run(scout.id);
    } finally {
      running = false;
    }
  }

  async function handleTest() {
    testing = true;
    try {
      const result = await scouts.test(scout.id);
      // Show result in modal or navigate to detail
      console.log('Test result:', result);
    } finally {
      testing = false;
    }
  }

  function formatDate(date: string | null) {
    if (!date) return 'Nie';
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<Card shadow="sm">
  <div class="scout-card">
    <div class="scout-header">
      <h3>{scout.name}</h3>
      <span class="status" class:active={scout.is_active}>
        {scout.is_active ? 'Aktiv' : 'Inaktiv'}
      </span>
    </div>

    <p class="url">{scout.url}</p>

    <div class="meta">
      {#if scout.location?.city}
        <span class="location">{scout.location.city}</span>
      {/if}
      <span class="frequency">
        {scout.frequency === 'daily' ? 'Alle 8 Stunden' :
         scout.frequency === 'weekly' ? 'Wöchentlich' :
         scout.frequency === 'biweekly' ? 'Alle 2 Wochen' : 'Monatlich'}
      </span>
    </div>

    <p class="criteria">{scout.criteria}</p>

    <div class="footer">
      <span class="last-run">
        Letzter Lauf: {formatDate(scout.last_run_at)}
      </span>
      <div class="actions">
        <Button size="sm" variant="ghost" onclick={handleTest} loading={testing}>
          Testen
        </Button>
        <Button size="sm" onclick={handleRun} loading={running}>
          Ausführen
        </Button>
        <Button size="sm" variant="ghost" onclick={() => navigate(`scout/${scout.id}`)}>
          Bearbeiten
        </Button>
      </div>
    </div>
  </div>
</Card>

<style>
  .scout-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .scout-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
  }

  .status {
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    background: var(--color-secondary);
  }

  .status.active {
    background: var(--color-success);
    color: white;
  }

  .url {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    word-break: break-all;
  }

  .meta {
    display: flex;
    gap: var(--spacing-sm);
  }

  .meta span {
    padding: 2px 8px;
    background: var(--color-background);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
  }

  .criteria {
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--color-border);
  }

  .last-run {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    gap: var(--spacing-xs);
  }
</style>
```

### compose/ComposePanel.svelte

```svelte
<script lang="ts">
  import { units } from '../../stores/units';
  import { api } from '../../lib/api';
  import LocationFilter from './LocationFilter.svelte';
  import SearchBar from './SearchBar.svelte';
  import UnitList from './UnitList.svelte';
  import DraftPreview from './DraftPreview.svelte';
  import { Button, Loading } from '@shared/components';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<object | null>(null);
  let generating = $state(false);

  // Load locations on mount
  $effect(() => {
    units.loadLocations();
    units.load();
  });

  function handleLocationChange(city: string | null) {
    units.setLocation(city);
    units.load(city ?? undefined);
    selectedUnitIds = new Set();
  }

  function handleSearch(query: string) {
    const location = $units.selectedLocation;
    if (query) {
      units.search(query, location ?? undefined);
    } else {
      units.load(location ?? undefined);
    }
  }

  function toggleUnit(id: string) {
    const newSet = new Set(selectedUnitIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedUnitIds = newSet;
  }

  async function generateDraft() {
    if (selectedUnitIds.size === 0) return;

    generating = true;
    try {
      const result = await api.post('compose/generate', {
        unit_ids: Array.from(selectedUnitIds),
        style: 'news',
        max_words: 500,
      });
      draft = result.data;

      // Mark units as used
      await units.markUsed(Array.from(selectedUnitIds));
      selectedUnitIds = new Set();
    } finally {
      generating = false;
    }
  }
</script>

<div class="compose-panel">
  <div class="sidebar">
    <h2>Informationseinheiten</h2>

    <LocationFilter
      locations={$units.locations}
      selected={$units.selectedLocation}
      onchange={handleLocationChange}
    />

    <SearchBar
      value={$units.searchQuery}
      onsearch={handleSearch}
    />

    {#if $units.loading}
      <Loading label="Laden..." />
    {:else}
      <UnitList
        units={$units.units}
        selected={selectedUnitIds}
        ontoggle={toggleUnit}
      />
    {/if}

    <div class="generate-actions">
      <span>{selectedUnitIds.size} ausgewählt</span>
      <Button
        onclick={generateDraft}
        disabled={selectedUnitIds.size === 0}
        loading={generating}
      >
        Entwurf erstellen
      </Button>
    </div>
  </div>

  <div class="preview">
    <h2>Entwurf</h2>
    {#if draft}
      <DraftPreview {draft} />
    {:else}
      <p class="placeholder">
        Wählen Sie Informationseinheiten aus und klicken Sie auf "Entwurf erstellen"
      </p>
    {/if}
  </div>
</div>

<style>
  .compose-panel {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: var(--spacing-lg);
    height: calc(100vh - 120px);
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    overflow-y: auto;
  }

  h2 {
    margin: 0;
  }

  .generate-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    margin-top: auto;
  }

  .preview {
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    overflow-y: auto;
  }

  .placeholder {
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--spacing-2xl);
  }
</style>
```

---

## Routes

### Feed.svelte (was Compose.svelte)

The main scouts/uploads and drafting view. Renders `ComposePanel` with a visible Scouts/Uploads toggle, location/topic filters, semantic search, and draft generation.

The Scouts and Uploads tabs use the same two-state browsing pattern:

1. **List state**: show every matching Scout or recent PDF upload; the inbox shows units from the current scope and labels the panel `Scouts-Inbox` or `Uploads-Inbox`.
2. **Focused state**: clicking a Scout or PDF hides sibling items, expands details for the selected item, and filters the inbox to only units from that Scout/PDF. The back control returns to the full list.

Inbox search bars include a `DraftCoverageModal` trigger. The modal accepts pasted draft text, runs vector search through `units/search`, and displays grouped matches with similarity scores.

---

## Scout Execution Outcomes

`lib/execution-labels.ts` is the single frontend source of truth for scout run
labels, tones, and compact badge variants. The helper keeps the math readable:

1. `running` / `failed` infrastructure states win first.
2. `change_status === 'same'` is always `Keine Änderung` / `Seite unverändert`.
3. Explicit criteria with `criteria_matched === false` is `Nicht relevant`.
4. `units_extracted > 0` is `Neue Einheiten`.
5. `merged_existing_count > 0` or `is_duplicate` is `Bereits bekannt`.
6. A changed page with no saved or merged units is `Nichts Verwertbares`.

Empty criteria means "Jede Änderung"; those scouts skip the `Nicht relevant`
branch and show whether the changed page produced new, already-known, or no
usable units.

---

## API Client

### lib/api.ts

```typescript
import { getUserId } from '../stores/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const userId = getUserId();
  if (!userId) {
    throw new ApiError('Nicht authentifiziert', 401, 'UNAUTHORIZED');
  }

  const url = `${SUPABASE_URL}/functions/v1/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'x-user-id': userId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.error?.message || `HTTP ${response.status}`,
      response.status,
      error.error?.code
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const result = await response.json();
  return result.data ?? result;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, data?: object) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data: object) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data: object) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (endpoint: string) => request<void>(endpoint, { method: 'DELETE' }),
};
```

---

## Types

### lib/types.ts

```typescript
export interface Scout {
  id: string;
  user_id: string;
  name: string;
  url: string | null;
  criteria: string;
  location: Location | null;
  location_mode: 'manual' | 'auto';
  topic?: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  is_active: boolean;
  last_run_at: string | null;
  consecutive_failures: number;
  provider?: string | null;        // 'firecrawl' | 'firecrawl_plain'
  content_hash?: string | null;    // SHA-256 for hash-based change detection
  scout_type: 'web' | 'civic';
  root_domain?: string | null;
  tracked_urls?: string[] | null;
  created_at: string;
  updated_at: string;
  // Last execution data (joined from scout_executions)
  last_execution_status?: 'running' | 'completed' | 'failed' | null;
  last_criteria_matched?: boolean | null;
  last_change_status?: 'changed' | 'same' | 'error' | 'first_run' | null;
  last_summary_text?: string | null;
  last_units_extracted?: number | null;
  last_merged_existing_count?: number | null;
  last_is_duplicate?: boolean | null;
}

export interface Location {
  city: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  count?: number;
}

export interface Execution {
  id: string;
  scout_id: string;
  scout_name?: string;
  scout?: { name: string; url: string; criteria?: string | null };
  scout_criteria?: string | null;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  change_status: 'changed' | 'same' | 'error' | 'first_run' | null;
  criteria_matched: boolean | null;
  is_duplicate: boolean;
  duplicate_similarity: number | null;
  notification_sent: boolean;
  notification_error: string | null;
  units_extracted: number;
  merged_existing_count?: number;
  scrape_duration_ms?: number | null;
  summary_text: string | null;
  error_message: string | null;
  units?: InformationUnit[];
}

export interface InformationUnit {
  id: string;
  statement: string;
  unit_type: 'fact' | 'event' | 'entity_update';
  entities: string[];
  source_url: string;
  source_domain: string;
  source_title: string | null;
  location: Location | null;
  topic?: string | null;
  scout_id?: string;
  source_type?: 'scout' | 'manual_text' | 'manual_photo' | 'manual_pdf';
  file_path?: string | null;
  file_url?: string | null;
  created_at: string;
  used_in_article: boolean;
  event_date?: string | null;
  similarity?: number;
}

export interface TestResult {
  scrape_result: {
    success: boolean;
    title?: string;
    content_preview?: string;
    word_count?: number;
    error?: string;
  };
  criteria_analysis: {
    matches: boolean;
    summary: string;
    key_findings: string[];
  } | null;
  would_notify: boolean;
  would_extract_units: boolean;
  provider?: string | null;
  content_hash?: string | null;
}

export interface Draft {
  title: string;
  headline: string;
  sections: DraftSection[];
  gaps: string[];
  sources: DraftSource[];
  word_count: number;
  units_used: number;
}
```

---

## Bajour Feature (Feature-Flagged)

Enabled via `VITE_FEATURE_BAJOUR=true`. Bajour draft functionality is integrated into the Feed panel via `DraftSlideOver` (no separate route).

### Architecture

Self-contained in `bajour/` subdirectory with its own API client, store, types, utilities, components, and tests.

### Workflow

1. **Village Select** (`AISelectDropdown.svelte`): Pick a village from the active pilot list. AI auto-selects relevant information units via `bajour-select-units` using the fixed 48h publication-date news window; the response includes `selection_diagnostics` so saved drafts can show what was selected/rejected and why.
2. **Generate** (`ComposePanel.svelte`): Generate newsletter draft via `compose/generate`. Optional custom system prompt.
3. **Preview & Send** (`DraftSlideOver.svelte`): Review draft, send to village correspondents via WhatsApp for verification (`bajour-send-verification`), then aggregate verified drafts into a Mailchimp campaign (`bajour-send-mailchimp`) from the backend workflow.

### Key Components

- `DraftPanel.svelte`: Legacy wizard component (dead code, kept for reference)
- `DraftSlideOver.svelte` (in `compose/`): Current slide-over panel integrated into Feed; passes selection diagnostics into saved/manual drafts.
- `DraftContent.svelte` (in `compose/`): Renders draft body plus the selection-ranking audit when `selection_diagnostics` exists, and reconstructs legacy selected-unit details from saved IDs when older drafts have no ranking snapshot. Reconstruction uses `units?ids=...` first, then a direct authenticated `information_units` lookup if the deployed Edge Function cannot resolve exact IDs yet.
- `VerificationBadge.svelte`: Status badge (ausstehend/bestätigt/abgelehnt)
- `SettingsModal.svelte` (in `ui/`): Prompt editor, max-unit limit, and editable deterministic selection-ranking weights. The compose prompt request uses `compose/prompt?schema=auto` so the displayed default matches the active auto-draft schema flag.

### Store (`bajour/store.ts`)

`load()`, `create(data)`, `sendVerification(draftId)`, `updateVerificationStatus(draftId, status)`, `startPolling()`, `stopPolling()`. Polls every 30s for pending verifications.

---

## Styling

### styles.css

```css
/* App-specific styles */

/* Scout form */
.scout-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.scout-form .form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.scout-form label {
  font-weight: 500;
}

.scout-form input,
.scout-form textarea,
.scout-form select {
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 1rem;
}

.scout-form textarea {
  min-height: 100px;
  resize: vertical;
}

/* Unit cards */
.unit-card {
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.unit-card:hover {
  border-color: var(--color-primary);
}

.unit-card.selected {
  border-color: var(--color-primary);
  background: rgba(99, 102, 241, 0.05);
}

.unit-card .statement {
  font-size: 0.9375rem;
  line-height: 1.5;
}

.unit-card .meta {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

/* Draft preview */
.draft-preview h2 {
  margin-top: 0;
}

.draft-preview .headline {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-lg);
}

.draft-preview section {
  margin-bottom: var(--spacing-lg);
}

.draft-preview h3 {
  margin: 0 0 var(--spacing-sm);
}

.draft-preview .gaps {
  padding: var(--spacing-md);
  background: rgba(245, 158, 11, 0.1);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-lg);
}

.draft-preview .sources {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.draft-preview .sources a {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
```
