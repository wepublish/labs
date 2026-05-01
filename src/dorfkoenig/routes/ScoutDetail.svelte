<script lang="ts">
  import { scouts } from '../stores/scouts';
  import { executions } from '../stores/executions';
  import ScoutForm from '../components/scouts/ScoutForm.svelte';
  import ExecutionList from '../components/executions/ExecutionList.svelte';
  import PromiseList from '../components/civic/PromiseList.svelte';
  import { Button, Card, Loading } from '@shared/components';
  import { EmptyState } from '../components/ui/primitives';
  import { History } from 'lucide-svelte';
  import type { Scout } from '../lib/types';

  interface Props {
    scoutId: string;
  }

  let { scoutId }: Props = $props();

  let scout = $state<Scout | null>(null);
  let loading = $state(true);
  let deleting = $state(false);
  let activeTab = $state<'promises' | 'executions'>('promises');

  // Load scout and executions when scoutId changes
  $effect(() => {
    const id = scoutId;
    loadScout(id);
    executions.load(id);
  });

  async function loadScout(id: string) {
    loading = true;
    scout = await scouts.get(id);
    loading = false;
  }

  async function handleDelete() {
    if (!scout) return;
    if (!confirm(`Scout "${scout.name}" wirklich löschen?`)) return;

    deleting = true;
    try {
      await scouts.delete(scoutId);
      location.hash = '#/scouts';
    } catch (error) {
      console.error('Delete failed:', error);
      deleting = false;
    }
  }

  function handleFormSubmit() {
    loadScout(scoutId);
  }

  function handleBack() {
    location.hash = '#/scouts';
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
        {#if scout.scout_type === 'civic'}
          <div class="tab-bar">
            <button
              class="tab-btn"
              class:active={activeTab === 'promises'}
              onclick={() => { activeTab = 'promises'; }}
              type="button"
            >
              Versprechen
            </button>
            <button
              class="tab-btn"
              class:active={activeTab === 'executions'}
              onclick={() => { activeTab = 'executions'; }}
              type="button"
            >
              Ausführungen
            </button>
          </div>

          {#if activeTab === 'promises'}
            <PromiseList scoutId={scoutId} />
          {:else}
            {#if $executions.loading}
              <Loading label="Laden..." />
            {:else if $executions.executions.length === 0}
              <EmptyState
                icon={History}
                title="Noch keine Ausführungen"
                description="Sobald dieser Scout ausgeführt wird, erscheint der Verlauf hier."
              />
            {:else}
              <ExecutionList executions={$executions.executions} />
              {#if $executions.hasMore}
                <Button variant="ghost" onclick={() => executions.loadMore(scoutId)}>
                  Mehr laden
                </Button>
              {/if}
            {/if}
          {/if}
        {:else}
          <div class="section-header">
            <h2>Ausführungsverlauf</h2>
          </div>

          {#if $executions.loading}
            <Loading label="Laden..." />
          {:else if $executions.executions.length === 0}
            <EmptyState
              icon={History}
              title="Noch keine Ausführungen"
              description="Sobald dieser Scout ausgeführt wird, erscheint der Verlauf hier."
            />
          {:else}
            <ExecutionList executions={$executions.executions} />
            {#if $executions.hasMore}
              <Button variant="ghost" onclick={() => executions.loadMore(scoutId)}>
                Mehr laden
              </Button>
            {/if}
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

  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--spacing-md);
  }

  .tab-btn {
    padding: 0.5rem 1rem;
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: var(--font-body);
    transition: all var(--transition-base);
  }

  .tab-btn:hover { color: var(--color-text); }

  .tab-btn.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  @media (max-width: 1024px) {
    .detail-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
