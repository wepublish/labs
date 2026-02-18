<script lang="ts">
  import { scouts } from '../stores/scouts';
  import { executions } from '../stores/executions';
  import ScoutList from '../components/scouts/ScoutList.svelte';
  import ScoutForm from '../components/scouts/ScoutForm.svelte';
  import ExecutionList from '../components/executions/ExecutionList.svelte';
  import { Button, Card, Loading } from '@shared/components';

  let showForm = $state(false);

  // Load data on mount
  $effect(() => {
    scouts.load();
    executions.load();
  });

  function handleFormSubmit() {
    showForm = false;
  }

  function handleFormCancel() {
    showForm = false;
  }
</script>

<div class="dashboard">
  <header class="page-header">
    <h1>Manage</h1>
    <Button onclick={() => (showForm = true)}>Neuer Scout</Button>
  </header>

  {#if showForm}
    <Card shadow="md" padding="lg">
      <ScoutForm onsubmit={handleFormSubmit} oncancel={handleFormCancel} />
    </Card>
  {/if}

  <section class="dashboard-section">
    <div class="section-header">
      <h2>Meine Scouts</h2>
      <span class="count">{$scouts.scouts.length} Scouts</span>
    </div>

    {#if $scouts.loading}
      <Loading label="Scouts laden..." />
    {:else if $scouts.error}
      <div class="error-message">{$scouts.error}</div>
    {:else}
      <ScoutList scouts={$scouts.scouts} />
    {/if}
  </section>

  <section class="dashboard-section">
    <div class="section-header">
      <h2>Letzte Ausführungen</h2>
      {#if $executions.executions.length > 5}
        <a href="#/history">Alle anzeigen</a>
      {/if}
    </div>

    {#if $executions.loading}
      <Loading label="Laden..." />
    {:else if $executions.error}
      <div class="error-message">{$executions.error}</div>
    {:else}
      <ExecutionList executions={$executions.executions.slice(0, 5)} compact />
    {/if}
  </section>
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
  }

  .dashboard-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-header h2 {
    margin: 0;
  }

  .section-header .count {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .section-header a {
    font-size: 0.875rem;
    color: var(--color-primary);
    text-decoration: none;
  }

  .section-header a:hover {
    text-decoration: underline;
  }
</style>
