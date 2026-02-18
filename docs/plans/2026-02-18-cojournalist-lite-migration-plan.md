# coJournalist-Lite Panel Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Manage panel (with status pills, delete, filters), Feed panel (with PanelFilterBar, topic support), and ScoutForm modal (criteria mode, extract_baseline, run-now) from coJournalist to coJournalist-lite.

**Architecture:** Component-by-component migration. Rename routes first, then build shared PanelFilterBar, then upgrade each panel and finally the ScoutForm. Backend gets a single edge function modification to include latest execution data per scout.

**Tech Stack:** Svelte 5 (runes), TypeScript, Supabase Edge Functions (Deno), CSS variables from shared styles

---

### Task 1: Rename Dashboard to Manage

**Files:**
- Rename: `src/cojournalist-lite/routes/Dashboard.svelte` → `src/cojournalist-lite/routes/Manage.svelte`
- Modify: `src/cojournalist-lite/App.svelte`
- Modify: `src/cojournalist-lite/components/Layout.svelte`

**Step 1: Rename the file**

```bash
cd /Users/tomvaillant/Code/labs
mv src/cojournalist-lite/routes/Dashboard.svelte src/cojournalist-lite/routes/Manage.svelte
```

**Step 2: Update App.svelte imports and routes**

In `src/cojournalist-lite/App.svelte`:
- Change `import Dashboard from './routes/Dashboard.svelte'` → `import Manage from './routes/Manage.svelte'`
- Change route `'dashboard'` references to `'manage'`
- Change default route fallback to `'manage'`
- Change `<Dashboard />` to `<Manage />`

```svelte
<script lang="ts">
  import { auth } from './stores/auth';
  import { Loading } from '@shared/components';
  import Layout from './components/Layout.svelte';
  import Login from './routes/Login.svelte';
  import Manage from './routes/Manage.svelte';
  import ScoutDetail from './routes/ScoutDetail.svelte';
  import History from './routes/History.svelte';
  import Feed from './routes/Feed.svelte';

  let hash = $state(window.location.hash || '#/');

  $effect(() => {
    const handleHashChange = () => {
      hash = window.location.hash || '#/';
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  let route = $derived(hash.slice(2).split('/')[0] || 'manage');
  let routeParams = $derived(hash.slice(2).split('/').slice(1));
</script>

{#if $auth.loading}
  <div class="loading-container">
    <Loading label="Authentifizierung..." />
  </div>
{:else if !$auth.user}
  <Login />
{:else}
  <Layout>
    {#if route === 'manage' || route === ''}
      <Manage />
    {:else if route === 'scout' && routeParams[0]}
      <ScoutDetail scoutId={routeParams[0]} />
    {:else if route === 'history'}
      <History />
    {:else if route === 'feed'}
      <Feed />
    {:else}
      <Manage />
    {/if}
  </Layout>
{/if}

<style>
  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }
</style>
```

**Step 3: Update Layout.svelte nav links**

In `src/cojournalist-lite/components/Layout.svelte`, update nav:

```svelte
<div class="nav-links">
  <a href="#/manage" class:active={location.hash === '#/' || location.hash === '#/manage'}>
    Manage
  </a>
  <a href="#/history" class:active={location.hash === '#/history'}>
    Verlauf
  </a>
  <a href="#/feed" class:active={location.hash === '#/feed'}>
    Feed
  </a>
</div>
```

**Step 4: Update Manage.svelte header text**

In `src/cojournalist-lite/routes/Manage.svelte`, change `<h1>Dashboard</h1>` to `<h1>Manage</h1>`.

**Step 5: Verify dev server loads**

```bash
cd /Users/tomvaillant/Code/labs && npm run dev
```

Navigate to `#/manage` and `#/feed` in browser. Verify routes resolve.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: rename Dashboard→Manage, Compose→Feed routes and nav"
```

---

### Task 2: Rename Compose to Feed

**Files:**
- Rename: `src/cojournalist-lite/routes/Compose.svelte` → `src/cojournalist-lite/routes/Feed.svelte`
- Modify: `src/cojournalist-lite/routes/Feed.svelte` (update header text)

**Step 1: Rename the file**

```bash
mv src/cojournalist-lite/routes/Compose.svelte src/cojournalist-lite/routes/Feed.svelte
```

**Step 2: Update Feed.svelte content**

```svelte
<script lang="ts">
  import ComposePanel from '../components/compose/ComposePanel.svelte';
</script>

<div class="feed-page">
  <header class="page-header">
    <h1>Feed</h1>
  </header>

  <ComposePanel />
</div>

<style>
  .feed-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    height: calc(100vh - 80px);
  }
</style>
```

Note: App.svelte import was already updated in Task 1.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: rename Compose route file to Feed"
```

---

### Task 3: Create ModeToggle Component

**Files:**
- Create: `src/cojournalist-lite/components/ui/ModeToggle.svelte`

**Step 1: Create the component**

Ported from coJournalist's ModeToggle. Simplified for Svelte 5 runes, no i18n.

```svelte
<script lang="ts">
  import { MapPin, Tag } from 'lucide-svelte';

  interface Props {
    mode: 'location' | 'topic';
    compact?: boolean;
    onchange: (mode: 'location' | 'topic') => void;
  }

  let { mode, compact = true, onchange }: Props = $props();
</script>

<div class="mode-toggle" class:compact>
  <button
    type="button"
    class="mode-btn"
    class:active={mode === 'location'}
    onclick={() => onchange('location')}
  >
    <MapPin size={14} />
    {#if !compact}<span>Ort</span>{/if}
  </button>
  <button
    type="button"
    class="mode-btn"
    class:active={mode === 'topic'}
    onclick={() => onchange('topic')}
  >
    <Tag size={14} />
    {#if !compact}<span>Thema</span>{/if}
  </button>
</div>

<style>
  .mode-toggle {
    display: inline-flex;
    border-radius: 0.375rem;
    border: 1px solid var(--color-border, #e5e7eb);
    overflow: hidden;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: transparent;
    border: none;
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:not(:last-child) {
    border-right: 1px solid var(--color-border, #e5e7eb);
  }

  .mode-btn.active {
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-primary, #6366f1);
  }

  .mode-btn:hover:not(.active) {
    background: var(--color-background, #f9fafb);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/components/ui/ModeToggle.svelte
git commit -m "feat: add ModeToggle component for location/topic filter"
```

---

### Task 4: Create FilterSelect Component

**Files:**
- Create: `src/cojournalist-lite/components/ui/FilterSelect.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
  import type { Component } from 'svelte';

  interface Option {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    icon?: Component<{ size?: number }>;
    options: Option[];
    value: string;
    onchange: (value: string) => void;
    disabled?: boolean;
  }

  let { icon, options, value, onchange, disabled = false }: Props = $props();
</script>

<div class="filter-select" class:disabled>
  {#if icon}
    <span class="filter-icon">
      <svelte:component this={icon} size={14} />
    </span>
  {/if}
  <select
    {value}
    {disabled}
    onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
  >
    {#each options as opt}
      <option value={opt.value}>
        {opt.label}{opt.count !== undefined ? ` (${opt.count})` : ''}
      </option>
    {/each}
  </select>
</div>

<style>
  .filter-select {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    position: relative;
  }

  .filter-icon {
    display: flex;
    color: var(--color-text-muted, #6b7280);
    pointer-events: none;
  }

  select {
    appearance: none;
    padding: 0.375rem 1.5rem 0.375rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 0.5rem center;
    color: var(--color-text, #111827);
    cursor: pointer;
    min-width: 0;
    max-width: 200px;
  }

  select:focus {
    outline: none;
    border-color: var(--color-primary, #6366f1);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
  }

  .disabled select {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/components/ui/FilterSelect.svelte
git commit -m "feat: add FilterSelect dropdown component"
```

---

### Task 5: Create PanelFilterBar Component

**Files:**
- Create: `src/cojournalist-lite/components/ui/PanelFilterBar.svelte`

**Step 1: Create the component**

Ported from coJournalist's PanelFilterBar. Uses ModeToggle and FilterSelect. Adapted for Svelte 5 runes.

```svelte
<script lang="ts">
  import { MapPin, Tag, Filter, Search, Loader2 } from 'lucide-svelte';
  import ModeToggle from './ModeToggle.svelte';
  import FilterSelect from './FilterSelect.svelte';
  import type { Snippet } from 'svelte';

  interface Option {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    filterMode: 'location' | 'topic';
    onModeChange: (mode: 'location' | 'topic') => void;
    locationOptions: Option[];
    topicOptions: Option[];
    selectedLocation: string | null;
    selectedTopic: string | null;
    onLocationChange: (value: string | null) => void;
    onTopicChange: (value: string | null) => void;
    typeFilter: string;
    typeOptions: Option[];
    onTypeChange: (value: string) => void;
    loading?: boolean;
    showSearch?: boolean;
    searchQuery?: string;
    searchPlaceholder?: string;
    onSearch?: (query: string) => void;
    isSearching?: boolean;
    toolbar?: Snippet;
  }

  let {
    filterMode,
    onModeChange,
    locationOptions,
    topicOptions,
    selectedLocation,
    selectedTopic,
    onLocationChange,
    onTopicChange,
    typeFilter,
    typeOptions,
    onTypeChange,
    loading = false,
    showSearch = false,
    searchQuery = '',
    searchPlaceholder = 'Suchen...',
    onSearch,
    isSearching = false,
    toolbar,
  }: Props = $props();

  let searchInput = $state(searchQuery);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchInput = value;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onSearch?.(value);
    }, 300);
  }

  function handleSearchClear() {
    searchInput = '';
    onSearch?.('');
  }
</script>

<div class="panel-filter-bar">
  <div class="filter-row">
    {#if loading}
      <div class="loading-inline">
        <Loader2 size={14} class="spin" />
        <span>Laden...</span>
      </div>
    {:else}
      <ModeToggle mode={filterMode} onchange={onModeChange} />

      <FilterSelect
        icon={filterMode === 'location' ? MapPin : Tag}
        options={filterMode === 'location' ? locationOptions : topicOptions}
        value={filterMode === 'location' ? (selectedLocation || '') : (selectedTopic || '')}
        onchange={(v) => filterMode === 'location' ? onLocationChange(v || null) : onTopicChange(v || null)}
      />

      <div class="filter-divider"></div>

      <FilterSelect
        icon={Filter}
        options={typeOptions}
        value={typeFilter}
        onchange={(v) => onTypeChange(v)}
      />
    {/if}
  </div>

  {#if showSearch}
    <div class="search-row">
      <div class="search-input-wrapper">
        <Search size={14} />
        <input
          type="text"
          value={searchInput}
          oninput={handleSearchInput}
          placeholder={searchPlaceholder}
        />
        {#if isSearching}
          <Loader2 size={14} class="spin" />
        {:else if searchInput}
          <button class="search-clear" onclick={handleSearchClear}>&times;</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if toolbar}
    <div class="toolbar-row">
      {@render toolbar()}
    </div>
  {/if}
</div>

<style>
  .panel-filter-bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-surface, white);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-divider {
    width: 1px;
    height: 20px;
    background: var(--color-border, #d1d5db);
    margin: 0 0.25rem;
    flex-shrink: 0;
  }

  .loading-inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #6b7280);
  }

  .search-row {
    display: flex;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text-muted, #6b7280);
  }

  .search-input-wrapper input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    outline: none;
  }

  .search-input-wrapper input::placeholder {
    color: var(--color-text-muted, #9ca3af);
  }

  .search-clear {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--color-text-muted, #9ca3af);
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .search-clear:hover {
    color: var(--color-text, #374151);
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/components/ui/PanelFilterBar.svelte
git commit -m "feat: add PanelFilterBar with mode toggle, filter selects, and search"
```

---

### Task 6: Update Types for Execution Status on Scouts

**Files:**
- Modify: `src/cojournalist-lite/lib/types.ts`

**Step 1: Add last execution fields to Scout interface**

Add these optional fields to the `Scout` interface in `types.ts`:

```typescript
export interface Scout {
  id: string;
  user_id: string;
  name: string;
  url: string;
  criteria: string;
  location: Location | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  is_active: boolean;
  last_run_at: string | null;
  consecutive_failures: number;
  notification_email: string | null;
  created_at: string;
  updated_at: string;
  // Last execution data (joined from scout_executions)
  last_execution_status?: 'running' | 'completed' | 'failed' | null;
  last_criteria_matched?: boolean | null;
  last_change_status?: 'changed' | 'same' | 'error' | 'first_run' | null;
  last_summary_text?: string | null;
}
```

Also add `criteria_mode` and `extract_baseline` to `ScoutCreateInput`:

```typescript
export interface ScoutCreateInput {
  name: string;
  url: string;
  criteria: string;
  criteria_mode?: 'any' | 'specific';
  location?: Location | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  notification_email?: string | null;
  is_active?: boolean;
  extract_baseline?: boolean;
}
```

And add `topic` to `InformationUnit`:

```typescript
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
  created_at: string;
  used_in_article: boolean;
  similarity?: number;
}
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/lib/types.ts
git commit -m "feat: add execution status fields to Scout, criteria_mode to create input"
```

---

### Task 7: Modify Scouts Edge Function to Include Latest Execution

**Files:**
- Modify: `src/cojournalist-lite/supabase/functions/scouts/index.ts`

**Step 1: Read current implementation**

Read `src/cojournalist-lite/supabase/functions/scouts/index.ts` fully to understand the current `listScouts` implementation.

**Step 2: Update listScouts to include latest execution**

In the `listScouts` function, after fetching scouts, add a second query to get the latest execution per scout. Modify the response to include these fields.

The implementation approach: after fetching scouts, query `scout_executions` for the latest execution per scout using a `DISTINCT ON` pattern:

```typescript
async function listScouts(client: SupabaseClient, userId: string): Promise<Response> {
  // Fetch scouts
  const { data: scouts, error } = await client
    .from('scouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return errorResponse(error.message, 500);
  }

  if (!scouts || scouts.length === 0) {
    return jsonResponse([]);
  }

  // Fetch latest execution per scout
  const scoutIds = scouts.map(s => s.id);
  const { data: executions } = await client
    .from('scout_executions')
    .select('scout_id, status, criteria_matched, change_status, summary_text, completed_at')
    .in('scout_id', scoutIds)
    .order('started_at', { ascending: false });

  // Build map of latest execution per scout
  const latestExecMap = new Map<string, {
    status: string;
    criteria_matched: boolean | null;
    change_status: string | null;
    summary_text: string | null;
  }>();

  if (executions) {
    for (const exec of executions) {
      if (!latestExecMap.has(exec.scout_id)) {
        latestExecMap.set(exec.scout_id, {
          status: exec.status,
          criteria_matched: exec.criteria_matched,
          change_status: exec.change_status,
          summary_text: exec.summary_text,
        });
      }
    }
  }

  // Merge execution data into scouts
  const enrichedScouts = scouts.map(scout => {
    const lastExec = latestExecMap.get(scout.id);
    return {
      ...scout,
      last_execution_status: lastExec?.status ?? null,
      last_criteria_matched: lastExec?.criteria_matched ?? null,
      last_change_status: lastExec?.change_status ?? null,
      last_summary_text: lastExec?.summary_text ?? null,
    };
  });

  return jsonResponse(enrichedScouts);
}
```

**Step 3: Commit**

```bash
git add src/cojournalist-lite/supabase/functions/scouts/index.ts
git commit -m "feat: enrich scout list with latest execution status"
```

---

### Task 8: Update ScoutCard with Status Pills and Delete

**Files:**
- Modify: `src/cojournalist-lite/components/scouts/ScoutCard.svelte`

**Step 1: Rewrite ScoutCard**

Replace the current ScoutCard with a version that includes:
- Status pills in footer (execution status + criteria status)
- Delete button with inline confirm strip
- Run now button
- Expandable card (click to expand/collapse)

```svelte
<script lang="ts">
  import { Card, Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { formatDate, FREQUENCY_OPTIONS } from '../../lib/constants';
  import type { Scout } from '../../lib/types';

  interface Props {
    scout: Scout;
    expanded?: boolean;
    ontoggle?: () => void;
  }

  let { scout, expanded = false, ontoggle }: Props = $props();

  let running = $state(false);
  let deleting = $state(false);
  let confirmingDelete = $state(false);

  async function handleRun(e: Event) {
    e.stopPropagation();
    running = true;
    try {
      await scouts.run(scout.id);
      await scouts.load();
    } catch (error) {
      console.error('Run failed:', error);
    } finally {
      running = false;
    }
  }

  function initiateDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = true;
  }

  function cancelDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = false;
  }

  async function confirmDeleteAction(e: Event) {
    e.stopPropagation();
    deleting = true;
    try {
      await scouts.delete(scout.id);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      deleting = false;
      confirmingDelete = false;
    }
  }

  function getFrequencyLabel(value: string): string {
    return FREQUENCY_OPTIONS.find((f) => f.value === value)?.label || value;
  }

  interface CriteriaDisplay {
    text: string;
    variant: 'success' | 'error' | 'neutral' | 'pending';
  }

  function getCriteriaDisplay(): CriteriaDisplay {
    const status = scout.last_criteria_matched;
    const changeStatus = scout.last_change_status;

    if (status === undefined || status === null) {
      return { text: 'Ausstehend', variant: 'pending' };
    }
    if (status === true) {
      return { text: 'Treffer', variant: 'success' };
    }
    // criteria_matched === false
    if (changeStatus === 'same') {
      return { text: 'Keine Änderung', variant: 'neutral' };
    }
    return { text: 'Kein Treffer', variant: 'error' };
  }

  function getExecutionDisplay(): { text: string; variant: 'success' | 'error' | 'pending' } {
    const status = scout.last_execution_status;
    if (!status) return { text: 'Ausstehend', variant: 'pending' };
    if (status === 'completed') return { text: 'OK', variant: 'success' };
    if (status === 'failed') return { text: 'Fehlgeschlagen', variant: 'error' };
    return { text: 'Läuft...', variant: 'pending' };
  }

  let criteriaDisplay = $derived(getCriteriaDisplay());
  let executionDisplay = $derived(getExecutionDisplay());
</script>

<div
  class="scout-card"
  class:expanded
  class:deleting
  onclick={ontoggle}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && ontoggle?.()}
  role="button"
  tabindex="0"
  aria-expanded={expanded}
>
  <div class="scout-card-header">
    <div class="scout-header-info">
      <h3 class="scout-name">{scout.name}</h3>
      <span class="status-badge" class:active={scout.is_active} class:inactive={!scout.is_active}>
        {scout.is_active ? 'Aktiv' : 'Inaktiv'}
      </span>
    </div>
    <div class="card-actions">
      {#if running}
        <div class="run-spinner">
          <span class="spinner-small"></span>
        </div>
      {:else}
        <button class="card-icon-btn run-btn" onclick={handleRun} title="Jetzt ausführen">
          &#9654;
        </button>
      {/if}
      {#if confirmingDelete}
        <div class="confirm-strip" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="toolbar" tabindex="0">
          {#if deleting}
            <span class="spinner-small"></span>
          {:else}
            <button class="action-btn cancel-btn" onclick={cancelDelete}>&times;</button>
            <span class="confirm-label">Löschen?</span>
            <button class="action-btn confirm-btn" onclick={confirmDeleteAction}>&#10003;</button>
          {/if}
        </div>
      {:else}
        <button class="card-icon-btn trash-btn" onclick={initiateDelete} title="Scout löschen">
          &#128465;
        </button>
      {/if}
    </div>
  </div>

  <div class="scout-card-body">
    <p class="scout-url">{scout.url}</p>
    <div class="scout-meta">
      {#if scout.location?.city}
        <span class="meta-item">📍 {scout.location.city}</span>
      {/if}
      <span class="meta-item">🔄 {getFrequencyLabel(scout.frequency)}</span>
      {#if scout.consecutive_failures > 0}
        <span class="meta-item failures">⚠ {scout.consecutive_failures} Fehler</span>
      {/if}
    </div>
    {#if scout.criteria}
      <p class="scout-criteria">{scout.criteria}</p>
    {:else}
      <p class="scout-criteria muted">Alle Änderungen</p>
    {/if}
  </div>

  {#if expanded && scout.last_summary_text}
    <div class="scout-expanded">
      <p class="expanded-summary">{scout.last_summary_text}</p>
    </div>
  {/if}

  <div class="scout-card-footer">
    <div class="status-badges">
      <span class="status-pill status-pill-{executionDisplay.variant}">
        <span class="status-dot"></span>
        {executionDisplay.text}
      </span>
      <span class="status-pill status-pill-{criteriaDisplay.variant}">
        <span class="status-dot"></span>
        {criteriaDisplay.text}
      </span>
    </div>
    <span class="last-run-text">
      {formatDate(scout.last_run_at)}
    </span>
  </div>
</div>

<style>
  .scout-card {
    background: var(--color-surface, white);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-md, 0.5rem);
    padding: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .scout-card:hover {
    border-color: var(--color-primary, #6366f1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .scout-card.expanded {
    border-color: var(--color-primary, #6366f1);
  }

  .scout-card.deleting {
    opacity: 0.5;
  }

  .scout-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }

  .scout-header-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .scout-name {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .status-badge.active {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  .status-badge.inactive {
    background: rgba(156, 163, 175, 0.15);
    color: #6b7280;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .card-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    background: transparent;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
  }

  .run-btn:hover {
    background: #f0fdf4;
    color: #16a34a;
  }

  .trash-btn:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .run-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid #e5e7eb;
    border-top-color: var(--color-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .confirm-strip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .confirm-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #b91c1c;
    text-transform: uppercase;
    padding: 0 0.25rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .cancel-btn {
    background: white;
    color: #6b7280;
  }

  .cancel-btn:hover {
    background: #f9fafb;
    color: #374151;
  }

  .confirm-btn {
    background: #dc2626;
    color: white;
  }

  .confirm-btn:hover {
    background: #b91c1c;
  }

  .scout-card-body {
    margin-bottom: 0.5rem;
  }

  .scout-url {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0 0 0.375rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scout-meta {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.375rem;
  }

  .meta-item {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
  }

  .meta-item.failures {
    color: var(--color-danger, #dc2626);
  }

  .scout-criteria {
    font-size: 0.8125rem;
    color: var(--color-text, #374151);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .scout-criteria.muted {
    color: var(--color-text-muted, #9ca3af);
    font-style: italic;
  }

  .scout-expanded {
    padding: 0.75rem 0;
    border-top: 1px solid var(--color-border, #f3f4f6);
    margin-bottom: 0.5rem;
  }

  .expanded-summary {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #4b5563;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .scout-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #f3f4f6);
  }

  .status-badges {
    display: flex;
    gap: 0.375rem;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 500;
    background: #f3f4f6;
    color: #6b7280;
    border-radius: 9999px;
  }

  .status-pill-success {
    background: #dcfce7;
    color: #15803d;
  }

  .status-pill-error {
    background: #fee2e2;
    color: #b91c1c;
  }

  .status-pill-neutral {
    background: #f3f4f6;
    color: #6b7280;
  }

  .status-pill-pending {
    background: #f3f4f6;
    color: #6b7280;
  }

  .status-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 9999px;
    background: currentColor;
  }

  .last-run-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/components/scouts/ScoutCard.svelte
git commit -m "feat: add status pills, delete confirm strip, and expandable cards to ScoutCard"
```

---

### Task 9: Refactor Manage Panel with PanelFilterBar

**Files:**
- Modify: `src/cojournalist-lite/routes/Manage.svelte`
- Modify: `src/cojournalist-lite/components/scouts/ScoutList.svelte`

**Step 1: Rewrite Manage.svelte**

Replace current Dashboard content with filtered scout list using PanelFilterBar:

```svelte
<script lang="ts">
  import { scouts } from '../stores/scouts';
  import ScoutForm from '../components/scouts/ScoutForm.svelte';
  import ScoutCard from '../components/scouts/ScoutCard.svelte';
  import PanelFilterBar from '../components/ui/PanelFilterBar.svelte';
  import { Button, Card, Loading } from '@shared/components';
  import type { Scout } from '../lib/types';

  let showForm = $state(false);

  // Filter state
  let filterMode = $state<'location' | 'topic'>('location');
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let typeFilter = $state('all');

  // Expansion state
  let expandedScoutId = $state<string | null>(null);

  // Load data on mount
  $effect(() => {
    scouts.load();
  });

  // Derive locations from scouts
  let uniqueLocations = $derived(
    [...new Set(
      $scouts.scouts
        .filter((s: Scout) => s.location?.city)
        .map((s: Scout) => s.location!.city)
    )].sort()
  );

  // Derive topics from scouts (using criteria as topic proxy for now)
  let uniqueTopics = $derived(
    [...new Set(
      $scouts.scouts
        .filter((s: Scout) => s.criteria)
        .map((s: Scout) => s.criteria)
    )].sort().slice(0, 20)
  );

  let locationOptions = $derived(
    uniqueLocations.length === 0
      ? [{ value: '', label: 'Keine Orte' }]
      : [
          { value: '', label: 'Alle Orte', count: $scouts.scouts.filter((s: Scout) => s.location).length },
          ...uniqueLocations.map(loc => ({
            value: loc,
            label: loc,
            count: $scouts.scouts.filter((s: Scout) => s.location?.city === loc).length
          }))
        ]
  );

  let topicOptions = $derived(
    uniqueTopics.length === 0
      ? [{ value: '', label: 'Keine Themen' }]
      : [
          { value: '', label: 'Alle Themen', count: $scouts.scouts.length },
          ...uniqueTopics.map(t => ({ value: t, label: t.slice(0, 40) }))
        ]
  );

  let typeOptions = $derived([
    { value: 'all', label: 'Alle', count: $scouts.scouts.length },
    { value: 'web', label: 'Website', count: $scouts.scouts.length },
  ]);

  // Filtered scouts
  let filteredScouts = $derived(
    $scouts.scouts.filter((scout: Scout) => {
      const typeMatch = typeFilter === 'all' || true; // only web scouts for now
      const dimMatch = filterMode === 'location'
        ? (!selectedLocation || scout.location?.city === selectedLocation)
        : (!selectedTopic || scout.criteria === selectedTopic);
      return typeMatch && dimMatch;
    })
  );

  function handleModeChange(mode: 'location' | 'topic') {
    filterMode = mode;
    selectedLocation = null;
    selectedTopic = null;
  }

  function handleFormSubmit() {
    showForm = false;
  }

  function handleFormCancel() {
    showForm = false;
  }

  function toggleExpand(id: string) {
    expandedScoutId = expandedScoutId === id ? null : id;
  }
</script>

<div class="manage">
  <header class="page-header">
    <h1>Manage</h1>
    <Button onclick={() => (showForm = true)}>Neuer Scout</Button>
  </header>

  {#if showForm}
    <Card shadow="md" padding="lg">
      <ScoutForm onsubmit={handleFormSubmit} oncancel={handleFormCancel} />
    </Card>
  {/if}

  <PanelFilterBar
    {filterMode}
    onModeChange={handleModeChange}
    {locationOptions}
    {topicOptions}
    {selectedLocation}
    {selectedTopic}
    onLocationChange={(v) => { selectedLocation = v; }}
    onTopicChange={(v) => { selectedTopic = v; }}
    {typeFilter}
    {typeOptions}
    onTypeChange={(v) => { typeFilter = v; }}
    loading={$scouts.loading}
  />

  <section class="scouts-section">
    {#if $scouts.loading}
      <Loading label="Scouts laden..." />
    {:else if $scouts.error}
      <div class="error-message">{$scouts.error}</div>
    {:else if filteredScouts.length === 0}
      <div class="empty-state">
        <p>Keine Scouts gefunden.</p>
      </div>
    {:else}
      <div class="scouts-grid">
        {#each filteredScouts as scout (scout.id)}
          <ScoutCard
            {scout}
            expanded={expandedScoutId === scout.id}
            ontoggle={() => toggleExpand(scout.id)}
          />
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .manage {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .scouts-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .scouts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--spacing-md);
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/routes/Manage.svelte
git commit -m "feat: add PanelFilterBar, status pills, and delete to Manage panel"
```

---

### Task 10: Refactor Feed Panel

**Files:**
- Rename: `src/cojournalist-lite/components/compose/ComposePanel.svelte` → keep but refactor
- Modify: `src/cojournalist-lite/stores/units.ts`

**Step 1: Add topic support to units store**

Add a `loadTopics` method and `topics` to the units store state:

In `src/cojournalist-lite/stores/units.ts`, update the state and add topic derivation:

```typescript
interface UnitsState {
  units: InformationUnit[];
  locations: Location[];
  topics: string[];
  selectedLocation: string | null;
  selectedTopic: string | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
}
```

Add initial state `topics: []`, `selectedTopic: null`.

Add method:
```typescript
setTopic(topic: string | null) {
  update((s) => ({ ...s, selectedTopic: topic }));
},
```

After loading units, derive topics client-side:
```typescript
// In load(), after setting units:
const topics = [...new Set(data.filter(u => u.topic).map(u => u.topic!))].sort();
update((s) => ({ ...s, units: data, topics, loading: false }));
```

**Step 2: Refactor ComposePanel.svelte**

Replace the two-column layout with PanelFilterBar + full-width UnitList:

```svelte
<script lang="ts">
  import { units } from '../../stores/units';
  import { composeApi } from '../../lib/api';
  import PanelFilterBar from '../ui/PanelFilterBar.svelte';
  import UnitList from './UnitList.svelte';
  import DraftPreview from './DraftPreview.svelte';
  import { Button, Loading } from '@shared/components';
  import type { Draft, InformationUnit } from '../../lib/types';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let error = $state('');

  // Filter state
  let filterMode = $state<'location' | 'topic'>('location');
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let typeFilter = $state('all');
  let searchQuery = $state('');
  let isSearching = $state(false);

  // Load on mount
  $effect(() => {
    units.loadLocations();
    units.load();
  });

  // Derive options
  let locationOptions = $derived(
    $units.locations.length === 0
      ? [{ value: '', label: 'Keine Orte' }]
      : [
          { value: '', label: 'Alle Orte' },
          ...$units.locations.map(loc => ({ value: loc.city, label: loc.city, count: loc.count }))
        ]
  );

  let topicOptions = $derived(
    ($units.topics ?? []).length === 0
      ? [{ value: '', label: 'Keine Themen' }]
      : [
          { value: '', label: 'Alle Themen' },
          ...($units.topics ?? []).map((t: string) => ({ value: t, label: t }))
        ]
  );

  let typeOptions = $derived([
    { value: 'all', label: 'Alle', count: $units.units.filter(u => !u.used_in_article).length },
  ]);

  // Filtered units (client-side)
  let filteredUnits = $derived(
    $units.units
      .filter(u => !u.used_in_article)
      .filter(u => typeFilter === 'all' || true)
  );

  function handleModeChange(mode: 'location' | 'topic') {
    filterMode = mode;
    selectedLocation = null;
    selectedTopic = null;
    searchQuery = '';
  }

  function handleLocationChange(city: string | null) {
    selectedLocation = city;
    units.setLocation(city);
    units.load(city ?? undefined);
    selectedUnitIds = new Set();
    draft = null;
  }

  function handleTopicChange(topic: string | null) {
    selectedTopic = topic;
    // Filter units client-side by topic
    if (topic) {
      units.load(selectedLocation ?? undefined);
    } else {
      units.load(selectedLocation ?? undefined);
    }
    selectedUnitIds = new Set();
    draft = null;
  }

  function handleSearch(query: string) {
    searchQuery = query;
    if (query) {
      isSearching = true;
      units.search(query, selectedLocation ?? undefined).then(() => {
        isSearching = false;
      });
    } else {
      units.load(selectedLocation ?? undefined);
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
    error = '';
    try {
      const result = await composeApi.generate({
        unit_ids: Array.from(selectedUnitIds),
        style: 'news',
        max_words: 500,
        include_sources: true,
      });
      draft = result;
      await units.markUsed(Array.from(selectedUnitIds));
      selectedUnitIds = new Set();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      generating = false;
    }
  }

  function clearDraft() {
    draft = null;
  }
</script>

<div class="feed-layout">
  <PanelFilterBar
    {filterMode}
    onModeChange={handleModeChange}
    {locationOptions}
    {topicOptions}
    selectedLocation={selectedLocation}
    selectedTopic={selectedTopic}
    onLocationChange={handleLocationChange}
    onTopicChange={handleTopicChange}
    {typeFilter}
    {typeOptions}
    onTypeChange={(v) => { typeFilter = v; }}
    loading={$units.loading}
    showSearch={true}
    {searchQuery}
    searchPlaceholder="Semantische Suche..."
    onSearch={handleSearch}
    {isSearching}
  >
    {#snippet toolbar()}
      {#if filteredUnits.length > 0}
        <span class="count-label">{filteredUnits.length} verfügbar</span>
      {/if}
    {/snippet}
  </PanelFilterBar>

  {#if $units.error}
    <div class="error-message">{$units.error}</div>
  {/if}

  <div class="feed-content">
    {#if $units.loading}
      <Loading label="Laden..." />
    {:else}
      <UnitList
        units={filteredUnits}
        selected={selectedUnitIds}
        ontoggle={toggleUnit}
      />
    {/if}
  </div>

  <div class="feed-actions">
    <span class="selection-count">{selectedUnitIds.size} ausgewählt</span>
    <Button
      onclick={generateDraft}
      disabled={selectedUnitIds.size === 0}
      loading={generating}
    >
      Entwurf erstellen
    </Button>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if draft}
    <div class="draft-section">
      <div class="draft-header">
        <h2>Entwurf</h2>
        <Button variant="ghost" size="sm" onclick={clearDraft}>Zurücksetzen</Button>
      </div>
      <DraftPreview {draft} />
    </div>
  {/if}
</div>

<style>
  .feed-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .feed-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  .feed-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .selection-count {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .count-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .draft-section {
    border-top: 1px solid var(--color-border);
    padding: var(--spacing-md);
  }

  .draft-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .draft-header h2 {
    margin: 0;
  }
</style>
```

**Step 3: Commit**

```bash
git add src/cojournalist-lite/components/compose/ComposePanel.svelte src/cojournalist-lite/stores/units.ts
git commit -m "feat: refactor Feed panel with PanelFilterBar, topic support, and semantic search"
```

---

### Task 11: Upgrade ScoutForm with Criteria Mode and Extract Baseline

**Files:**
- Modify: `src/cojournalist-lite/components/scouts/ScoutForm.svelte`

**Step 1: Add criteria mode toggle, extract_baseline toggle, and run-now-on-create**

Key changes:
- Add `criteriaMode: 'any' | 'specific'` state with CSS toggle
- Add `extractBaseline` toggle
- When `criteriaMode === 'any'`, hide criteria textarea, submit empty criteria
- After create, call `scouts.run(newScout.id, { extract_units: extractBaseline })`
- Add topic input field

Update the full ScoutForm:

```svelte
<script lang="ts">
  import { Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { FREQUENCY_OPTIONS } from '../../lib/constants';
  import type { Scout, ScoutCreateInput, ScoutUpdateInput } from '../../lib/types';

  interface Props {
    scout?: Scout;
    onsubmit?: () => void;
    oncancel?: () => void;
  }

  let { scout: initialScout, onsubmit, oncancel }: Props = $props();

  const isEdit = !!initialScout;

  // Form state
  let name = $state(initialScout?.name || '');
  let url = $state(initialScout?.url || '');
  let criteria = $state(initialScout?.criteria || '');
  let criteriaMode = $state<'any' | 'specific'>(initialScout?.criteria ? 'specific' : 'any');
  let frequency = $state<'daily' | 'weekly' | 'monthly'>(initialScout?.frequency || 'daily');
  let notificationEmail = $state(initialScout?.notification_email || '');
  let locationCity = $state(initialScout?.location?.city || '');
  let topic = $state('');
  let isActive = $state(initialScout?.is_active ?? true);
  let extractBaseline = $state(false);

  let saving = $state(false);
  let runningInitial = $state(false);
  let error = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    if (!name.trim()) { error = 'Name ist erforderlich'; return; }
    if (!url.trim()) { error = 'URL ist erforderlich'; return; }

    try { new URL(url); } catch { error = 'Ungültige URL'; return; }

    if (criteriaMode === 'specific' && !criteria.trim()) {
      error = 'Kriterien sind erforderlich im spezifischen Modus';
      return;
    }

    saving = true;

    try {
      const location = locationCity.trim()
        ? { city: locationCity.trim(), country: 'Germany' }
        : null;

      const effectiveCriteria = criteriaMode === 'any' ? '' : criteria.trim();

      if (isEdit && initialScout) {
        const updates: ScoutUpdateInput = {
          name: name.trim(),
          url: url.trim(),
          criteria: effectiveCriteria,
          frequency,
          notification_email: notificationEmail.trim() || null,
          location,
          is_active: isActive,
        };
        await scouts.update(initialScout.id, updates);
      } else {
        const input: ScoutCreateInput = {
          name: name.trim(),
          url: url.trim(),
          criteria: effectiveCriteria,
          frequency,
          notification_email: notificationEmail.trim() || null,
          location,
          is_active: isActive,
        };
        const newScout = await scouts.create(input);

        // Trigger initial run
        runningInitial = true;
        try {
          await scouts.run(newScout.id, { extract_units: extractBaseline });
        } catch (runErr) {
          console.warn('Initial run failed (scout was created):', runErr);
        } finally {
          runningInitial = false;
        }
      }

      onsubmit?.();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="scout-form">
  <h2>{isEdit ? 'Scout bearbeiten' : 'Neuer Scout'}</h2>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="form-group">
    <label for="name">Name</label>
    <input id="name" type="text" bind:value={name} placeholder="z.B. Berlin News Monitor" required />
  </div>

  <div class="form-group">
    <label for="url">URL</label>
    <input id="url" type="url" bind:value={url} placeholder="https://example.com/news" required />
  </div>

  <!-- Criteria Mode Toggle -->
  <div class="form-group">
    <label>Benachrichtigung bei</label>
    <div class="criteria-toggle-wrapper">
      <div class="criteria-toggle">
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'any'}
          onclick={() => { criteriaMode = 'any'; }}
        >
          🔔 Jede Änderung
        </button>
        <button
          type="button"
          class="criteria-track"
          class:specific={criteriaMode === 'specific'}
          onclick={() => { criteriaMode = criteriaMode === 'any' ? 'specific' : 'any'; }}
        >
          <span class="criteria-thumb"></span>
        </button>
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'specific'}
          onclick={() => { criteriaMode = 'specific'; }}
        >
          🎯 Bestimmte Kriterien
        </button>
      </div>
    </div>
  </div>

  {#if criteriaMode === 'specific'}
    <div class="form-group">
      <label for="criteria">Kriterien</label>
      <textarea
        id="criteria"
        bind:value={criteria}
        placeholder="Welche Informationen sollen gefunden werden?"
        rows="3"
      ></textarea>
    </div>
  {/if}

  <div class="form-row">
    <div class="form-group">
      <label for="frequency">Häufigkeit</label>
      <select id="frequency" bind:value={frequency}>
        {#each FREQUENCY_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
    <div class="form-group">
      <label for="location">Ort (optional)</label>
      <input id="location" type="text" bind:value={locationCity} placeholder="z.B. Berlin" />
    </div>
  </div>

  <div class="form-group">
    <label for="topic">Thema (optional)</label>
    <input id="topic" type="text" bind:value={topic} placeholder="z.B. Stadtentwicklung" />
  </div>

  <div class="form-group">
    <label for="email">Benachrichtigungs-E-Mail (optional)</label>
    <input id="email" type="email" bind:value={notificationEmail} placeholder="email@example.com" />
  </div>

  <div class="form-group checkbox-group">
    <label>
      <input type="checkbox" bind:checked={isActive} />
      <span>Scout aktiv</span>
    </label>
  </div>

  {#if !isEdit}
    <!-- Extract Baseline Toggle -->
    <div class="form-group">
      <div class="criteria-toggle-wrapper">
        <div class="criteria-toggle">
          <button
            type="button"
            class="criteria-track"
            class:specific={extractBaseline}
            onclick={() => { extractBaseline = !extractBaseline; }}
          >
            <span class="criteria-thumb"></span>
          </button>
          <button
            type="button"
            class="criteria-label"
            class:active={extractBaseline}
            onclick={() => { extractBaseline = !extractBaseline; }}
          >
            Aktuelle Seiteninhalte importieren
          </button>
        </div>
      </div>
      <p class="hint-text">
        Wenn aktiviert, werden vorhandene Inhalte der Seite beim ersten Lauf als Informationseinheiten gespeichert.
      </p>
    </div>
  {/if}

  <div class="form-actions">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel}>Abbrechen</Button>
    {/if}
    <Button type="submit" variant="primary" loading={saving || runningInitial}>
      {#if runningInitial}
        Erster Lauf...
      {:else if saving}
        Speichern...
      {:else}
        {isEdit ? 'Speichern' : 'Erstellen & Ausführen'}
      {/if}
    </Button>
  </div>
</form>

<style>
  h2 { margin: 0 0 var(--spacing-lg); }

  .checkbox-group { flex-direction: row !important; }
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }
  .checkbox-group input[type='checkbox'] { width: auto; }

  .criteria-toggle-wrapper {
    display: flex;
    justify-content: flex-start;
  }

  .criteria-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .criteria-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    transition: color 0.2s ease;
    white-space: nowrap;
  }

  .criteria-label.active {
    color: var(--color-primary, #4f46e5);
  }

  .criteria-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: #e0e7ff;
    border: 1px solid #c7d2fe;
    border-radius: 9999px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.2s ease;
  }

  .criteria-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: var(--color-primary, #4f46e5);
    border-radius: 9999px;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .criteria-track.specific .criteria-thumb {
    transform: translateX(16px);
  }

  .hint-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin-top: 0.375rem;
    line-height: 1.4;
  }
</style>
```

**Step 2: Commit**

```bash
git add src/cojournalist-lite/components/scouts/ScoutForm.svelte
git commit -m "feat: add criteria mode toggle, extract baseline, and run-now-on-create to ScoutForm"
```

---

### Task 12: Final Verification

**Step 1: Run typecheck**

```bash
cd /Users/tomvaillant/Code/labs && npm run typecheck
```

Fix any type errors.

**Step 2: Run dev server and verify all routes**

```bash
npm run dev
```

Verify:
- `#/manage` loads with PanelFilterBar and scout cards with status pills
- `#/feed` loads with PanelFilterBar, unit list, and search
- New scout form shows criteria mode toggle and extract baseline toggle
- Creating a scout triggers initial run
- Delete on scout card works with confirm strip
- Filters work on both panels

**Step 3: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: resolve typecheck and integration issues"
```
