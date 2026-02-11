<script lang="ts">
  import { scouts } from '../stores/scouts';
  import { executions } from '../stores/executions';
  import ScoutForm from '../components/scouts/ScoutForm.svelte';
  import ExecutionList from '../components/executions/ExecutionList.svelte';
  import { Button, Card, Loading } from '@shared/components';
  import type { Scout } from '../lib/types';

  interface Props {
    scoutId: string;
  }

  let { scoutId }: Props = $props();

  let scout = $state<Scout | null>(null);
  let loading = $state(true);
  let deleting = $state(false);

  // Load scout and executions on mount or when scoutId changes
  $effect(() => {
    loadScout();
    executions.load(scoutId);
  });

  async function loadScout() {
    loading = true;
    scout = await scouts.get(scoutId);
    loading = false;
  }

  async function handleDelete() {
    if (!scout) return;
    if (!confirm(`Scout "${scout.name}" wirklich löschen?`)) return;

    deleting = true;
    try {
      await scouts.delete(scoutId);
      location.hash = '#/dashboard';
    } catch (error) {
      console.error('Delete failed:', error);
      deleting = false;
    }
  }

  function handleFormSubmit() {
    loadScout();
  }

  function handleBack() {
    location.hash = '#/dashboard';
  }
</script>

<div class="scout-detail">
  <header class="page-header">
    <div class="header-left">
      <Button variant="ghost" onclick={handleBack}>
        ← Zurück
      </Button>
      <h1>{scout?.name || 'Scout laden...'}</h1>
    </div>
    {#if scout}
      <Button variant="danger" onclick={handleDelete} loading={deleting}>
        Löschen
      </Button>
    {/if}
  </header>

  {#if loading}
    <Loading label="Scout laden..." />
  {:else if !scout}
    <div class="error-message">Scout nicht gefunden</div>
  {:else}
    <div class="detail-layout">
      <section class="detail-form">
        <Card shadow="sm" padding="lg">
          <ScoutForm scout={scout} onsubmit={handleFormSubmit} />
        </Card>
      </section>

      <section class="detail-history">
        <div class="section-header">
          <h2>Ausführungsverlauf</h2>
        </div>

        {#if $executions.loading}
          <Loading label="Laden..." />
        {:else if $executions.executions.length === 0}
          <div class="empty-state">
            <p>Noch keine Ausführungen für diesen Scout.</p>
          </div>
        {:else}
          <ExecutionList executions={$executions.executions} />
          {#if $executions.hasMore}
            <Button
              variant="ghost"
              onclick={() => executions.loadMore(scoutId)}
            >
              Mehr laden
            </Button>
          {/if}
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .scout-detail {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .header-left h1 {
    margin: 0;
  }

  .detail-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-xl);
  }

  .detail-form,
  .detail-history {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .section-header h2 {
    margin: 0;
  }

  @media (max-width: 1024px) {
    .detail-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
