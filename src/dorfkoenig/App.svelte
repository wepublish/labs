<script lang="ts">
  import { auth } from './stores/auth';
  import { Loading } from '@shared/components';
  import Layout from './components/Layout.svelte';
  import Login from './routes/Login.svelte';
  import Manage from './routes/Manage.svelte';
  import ScoutDetail from './routes/ScoutDetail.svelte';
  import History from './routes/History.svelte';
  import Feed from './routes/Feed.svelte';

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
  // Examples: #/manage, #/scout/uuid, #/history, #/feed
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
