<script lang="ts">
  import { auth } from '@shared/stores/auth';
  import { supabase, isSupabaseConfigured } from '@shared/utils';
  import { Loading, ErrorBoundary, Card, Button } from '@shared/components';

  // Demo state using Svelte 5 runes
  let count = $state(0);
  let items = $state<{ id: number; name: string }[]>([]);
  let loadingItems = $state(false);
  let itemsError = $state<string | null>(null);

  // Derived value
  let doubled = $derived(count * 2);

  // Effect example
  $effect(() => {
    console.log(`Count changed to: ${count}`);
  });

  // Demo Supabase fetch (will fail without proper setup, which is expected)
  async function fetchDemoItems() {
    if (!isSupabaseConfigured()) {
      itemsError = 'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local';
      return;
    }

    loadingItems = true;
    itemsError = null;

    try {
      const { data, error } = await supabase.from('demo_items').select('*').limit(10);

      if (error) {
        throw new Error(error.message);
      }

      items = data || [];
    } catch (e) {
      itemsError = e instanceof Error ? e.message : 'Failed to fetch items';
    } finally {
      loadingItems = false;
    }
  }
</script>

<main>
  <ErrorBoundary>
    {#if $auth.loading}
      <div class="loading-container">
        <Loading label="Authenticating..." />
      </div>
    {:else if $auth.error}
      <Card>
        <div class="error">
          <h2>Authentication Error</h2>
          <p>{$auth.error}</p>
        </div>
      </Card>
    {:else}
      <header>
        <h1>Labs Demo App</h1>
        {#if $auth.user}
          <p class="welcome">
            Welcome, {$auth.user.name || $auth.user.email || 'User'}!
            <span class="badge">{$auth.user.roles.join(', ') || 'No roles'}</span>
          </p>
        {/if}
      </header>

      <div class="grid">
        <!-- Counter Demo -->
        <Card>
          {#snippet header()}
            <h2>Svelte 5 Runes Demo</h2>
          {/snippet}

          <div class="counter-demo">
            <p>
              Count: <strong>{count}</strong>
            </p>
            <p>
              Doubled (derived): <strong>{doubled}</strong>
            </p>
            <div class="button-group">
              <Button onclick={() => count++}>Increment</Button>
              <Button variant="secondary" onclick={() => count--}>Decrement</Button>
              <Button variant="ghost" onclick={() => (count = 0)}>Reset</Button>
            </div>
          </div>
        </Card>

        <!-- Auth Info -->
        <Card>
          {#snippet header()}
            <h2>Authentication Info</h2>
          {/snippet}

          {#if $auth.user}
            <dl class="info-list">
              <dt>User ID</dt>
              <dd><code>{$auth.user.id}</code></dd>

              <dt>Email</dt>
              <dd>{$auth.user.email || 'Not provided'}</dd>

              <dt>Name</dt>
              <dd>{$auth.user.name || 'Not provided'}</dd>

              <dt>Roles</dt>
              <dd>{$auth.user.roles.length > 0 ? $auth.user.roles.join(', ') : 'None'}</dd>

              <dt>Mode</dt>
              <dd>
                {#if import.meta.env.DEV}
                  <span class="badge badge-warning">Development (Mock User)</span>
                {:else}
                  <span class="badge badge-success">Production</span>
                {/if}
              </dd>
            </dl>
          {:else}
            <p>No user authenticated</p>
          {/if}
        </Card>

        <!-- Supabase Demo -->
        <Card>
          {#snippet header()}
            <h2>Supabase Integration</h2>
          {/snippet}

          <div class="supabase-demo">
            <p class="description">
              {#if isSupabaseConfigured()}
                Supabase is configured. Click below to test fetching from a <code>demo_items</code> table.
              {:else}
                <span class="warning">
                  Supabase not configured. Add <code>VITE_SUPABASE_URL</code> and
                  <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>
                </span>
              {/if}
            </p>

            <Button
              onclick={fetchDemoItems}
              loading={loadingItems}
              disabled={!isSupabaseConfigured()}
            >
              Fetch Demo Items
            </Button>

            {#if itemsError}
              <p class="error-text">{itemsError}</p>
            {/if}

            {#if items.length > 0}
              <ul class="items-list">
                {#each items as item (item.id)}
                  <li>{item.name}</li>
                {/each}
              </ul>
            {/if}
          </div>
        </Card>

        <!-- Environment Info -->
        <Card>
          {#snippet header()}
            <h2>Environment</h2>
          {/snippet}

          <dl class="info-list">
            <dt>Mode</dt>
            <dd><code>{import.meta.env.MODE}</code></dd>

            <dt>Dev</dt>
            <dd><code>{String(import.meta.env.DEV)}</code></dd>

            <dt>Prod</dt>
            <dd><code>{String(import.meta.env.PROD)}</code></dd>

            <dt>Base URL</dt>
            <dd><code>{import.meta.env.BASE_URL}</code></dd>

            <dt>Supabase URL</dt>
            <dd>
              <code>{import.meta.env.VITE_SUPABASE_URL ? '(configured)' : '(not set)'}</code>
            </dd>

            <dt>JWT Issuer</dt>
            <dd>
              <code>{import.meta.env.VITE_JWT_ISSUER || '(not set)'}</code>
            </dd>
          </dl>
        </Card>
      </div>

      <footer>
        <p>
          Labs Monorepo Demo |
          <a href="https://github.com/wepublish/labs" target="_blank" rel="noopener">GitHub</a>
        </p>
      </footer>
    {/if}
  </ErrorBoundary>
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--spacing-lg);
  }

  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 50vh;
  }

  header {
    margin-bottom: var(--spacing-xl);
  }

  h1 {
    font-size: 2rem;
    color: var(--color-text);
    margin-bottom: var(--spacing-sm);
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  .welcome {
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    background-color: var(--color-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: var(--radius-full);
  }

  .badge-warning {
    background-color: var(--color-warning);
    color: var(--color-text);
  }

  .badge-success {
    background-color: var(--color-success);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-xl);
  }

  .counter-demo {
    text-align: center;
  }

  .counter-demo p {
    margin-bottom: var(--spacing-md);
    font-size: 1.125rem;
  }

  .button-group {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: center;
    flex-wrap: wrap;
  }

  .info-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--spacing-sm) var(--spacing-md);
  }

  .info-list dt {
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .info-list dd {
    margin: 0;
  }

  code {
    background-color: var(--color-surface-muted);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: 0.875rem;
  }

  .supabase-demo .description {
    margin-bottom: var(--spacing-md);
    color: var(--color-text-muted);
  }

  .warning {
    color: var(--color-warning-dark);
  }

  .error-text {
    color: var(--color-danger);
    margin-top: var(--spacing-md);
  }

  .items-list {
    margin-top: var(--spacing-md);
    padding-left: var(--spacing-lg);
  }

  .error {
    text-align: center;
    padding: var(--spacing-lg);
  }

  .error h2 {
    color: var(--color-danger);
  }

  .error p {
    color: var(--color-text-muted);
  }

  footer {
    text-align: center;
    color: var(--color-text-muted);
    padding-top: var(--spacing-xl);
    border-top: 1px solid var(--color-border);
  }

  footer a {
    color: var(--color-primary);
    text-decoration: none;
  }

  footer a:hover {
    text-decoration: underline;
  }
</style>
