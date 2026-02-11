<script lang="ts">
  import { executions } from '../stores/executions';
  import { scouts } from '../stores/scouts';
  import ExecutionList from '../components/executions/ExecutionList.svelte';
  import { Button, Loading } from '@shared/components';

  let selectedScoutId = $state<string | undefined>(undefined);

  // Load data on mount
  $effect(() => {
    scouts.load();
    executions.load(selectedScoutId);
  });

  function handleScoutFilter(scoutId: string | undefined) {
    selectedScoutId = scoutId;
    executions.load(scoutId);
  }
</script>

<div class="history-page">
  <header class="page-header">
    <h1>Ausführungsverlauf</h1>
  </header>

  <div class="filter-bar">
    <label for="scout-filter">Scout filtern:</label>
    <select
      id="scout-filter"
      value={selectedScoutId || ''}
      onchange={(e) => handleScoutFilter((e.target as HTMLSelectElement).value || undefined)}
    >
      <option value="">Alle Scouts</option>
      {#each $scouts.scouts as scout}
        <option value={scout.id}>{scout.name}</option>
      {/each}
    </select>
  </div>

  <section class="history-content">
    {#if $executions.loading && $executions.executions.length === 0}
      <Loading label="Ausführungen laden..." />
    {:else if $executions.error}
      <div class="error-message">{$executions.error}</div>
    {:else if $executions.executions.length === 0}
      <div class="empty-state">
        <p>Noch keine Ausführungen.</p>
      </div>
    {:else}
      <ExecutionList executions={$executions.executions} />

      {#if $executions.hasMore}
        <div class="load-more">
          <Button
            variant="ghost"
            onclick={() => executions.loadMore(selectedScoutId)}
            loading={$executions.loading}
          >
            Mehr laden
          </Button>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .history-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-md);
  }

  .filter-bar label {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .filter-bar select {
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    min-width: 200px;
  }

  .history-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .load-more {
    display: flex;
    justify-content: center;
    padding: var(--spacing-md);
  }
</style>
