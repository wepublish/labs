<script lang="ts">
  import { auth } from './stores/auth';
  import { Loading } from '@shared/components';
  import Layout from './components/Layout.svelte';
  import Login from './routes/Login.svelte';
  import Dashboard from './routes/Dashboard.svelte';
  import ScoutDetail from './routes/ScoutDetail.svelte';
  import History from './routes/History.svelte';
  import Compose from './routes/Compose.svelte';

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
  // Examples: #/dashboard, #/scout/uuid, #/history
  let route = $derived(hash.slice(2).split('/')[0] || 'dashboard');
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
    {#if route === 'dashboard' || route === ''}
      <Dashboard />
    {:else if route === 'scout' && routeParams[0]}
      <ScoutDetail scoutId={routeParams[0]} />
    {:else if route === 'history'}
      <History />
    {:else if route === 'compose'}
      <Compose />
    {:else}
      <Dashboard />
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
