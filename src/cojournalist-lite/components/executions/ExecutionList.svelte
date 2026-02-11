<script lang="ts">
  import ExecutionCard from './ExecutionCard.svelte';
  import type { Execution } from '../../lib/types';

  interface Props {
    executions: Execution[];
    compact?: boolean;
  }

  let { executions, compact = false }: Props = $props();
</script>

{#if executions.length === 0}
  <div class="empty-state">
    <p>Noch keine Ausführungen.</p>
  </div>
{:else}
  <div class="executions-list">
    {#each executions as execution (execution.id)}
      <ExecutionCard {execution} {compact} />
    {/each}
  </div>
{/if}

<style>
  .executions-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
</style>
