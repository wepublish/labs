<script lang="ts">
  import { Loading } from '@shared/components';
  import { EmptyState } from '../ui/primitives';
  import { FileCheck } from 'lucide-svelte';
  import { civicApi } from '../../lib/api';
  import PromiseCard from './PromiseCard.svelte';
  import type { Promise } from '../../lib/types';

  interface Props {
    scoutId: string;
  }

  let { scoutId }: Props = $props();

  let promises = $state<Promise[]>([]);
  let loading = $state(true);
  let error = $state('');

  $effect(() => {
    loadPromises(scoutId);
  });

  async function loadPromises(id: string) {
    loading = true;
    error = '';
    try {
      promises = await civicApi.promises.list(id);
    } catch (err) {
      error = (err as Error).message;
      promises = [];
    } finally {
      loading = false;
    }
  }
</script>

<div class="promise-list">
  {#if loading}
    <Loading label="Versprechen laden..." />
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if promises.length === 0}
    <EmptyState
      icon={FileCheck}
      title="Noch keine Versprechen"
      description="Sobald dieser Scout Ratsprotokolle analysiert, erscheinen die Versprechen hier."
    />
  {:else}
    <div class="cards">
      {#each promises as promise (promise.id)}
        <PromiseCard {promise} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .promise-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .error-text {
    color: var(--color-danger);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
