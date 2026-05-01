<script lang="ts">
  import { auth } from './stores/auth';
  import { Loading } from '@shared/components';
  import Layout from './components/Layout.svelte';
  import Login from './routes/Login.svelte';
  import Manage from './routes/Manage.svelte';
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

  // Parse route and params from hash
  // Examples: #/scouts, #/drafts, #/scout/uuid, #/history
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
    {:else if route === 'manage-legacy'}
      <Manage />
    {:else}
      <Feed />
    {/if}
  </Layout>
{/if}

<style>
  .loading-container,
  .auth-error {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }

  .auth-error-content {
    text-align: center;
  }

  .auth-error-content h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 0.5rem 0;
  }

  .auth-error-content p {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin: 0;
  }
</style>
