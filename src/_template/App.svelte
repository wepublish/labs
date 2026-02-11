<script lang="ts">
  import { auth } from '@shared/stores/auth';
  import { Loading, ErrorBoundary, Card, Button } from '@shared/components';

  // App state
  let count = $state(0);
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
        <h1>__APP_NAME__</h1>
        {#if $auth.user}
          <p class="welcome">Welcome, {$auth.user.name || $auth.user.email || 'User'}!</p>
        {/if}
      </header>

      <section class="content">
        <Card>
          <h2>Getting Started</h2>
          <p>Edit <code>App.svelte</code> to build your app.</p>

          <div class="demo">
            <p>Count: {count}</p>
            <div class="button-group">
              <Button onclick={() => count++}>Increment</Button>
              <Button variant="secondary" onclick={() => (count = 0)}>Reset</Button>
            </div>
          </div>
        </Card>
      </section>
    {/if}
  </ErrorBoundary>
</main>

<style>
  main {
    max-width: 800px;
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

  .welcome {
    color: var(--color-text-muted);
  }

  .content h2 {
    margin-bottom: var(--spacing-md);
  }

  .content p {
    margin-bottom: var(--spacing-md);
    color: var(--color-text-muted);
  }

  code {
    background-color: var(--color-surface-muted);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    font-family: monospace;
  }

  .demo {
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .demo p {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: var(--spacing-md);
  }

  .button-group {
    display: flex;
    gap: var(--spacing-sm);
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
</style>
