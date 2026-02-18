<script lang="ts">
  import ScoutCard from './ScoutCard.svelte';
  import type { Scout } from '../../lib/types';

  interface Props {
    scouts: Scout[];
  }

  let { scouts }: Props = $props();
</script>

{#if scouts.length === 0}
  <div class="empty-state">
    <p>Noch keine Scouts erstellt.</p>
  </div>
{:else}
  <div class="scouts-grid">
    {#each scouts as scout (scout.id)}
      <ScoutCard {scout} />
    {/each}
  </div>
{/if}
