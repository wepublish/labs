<script lang="ts">
  import type { Location } from '../../lib/types';

  interface Props {
    locations: Location[];
    selected: string | null;
    onchange: (city: string | null) => void;
  }

  let { locations, selected, onchange }: Props = $props();
</script>

<div class="location-filter">
  <button
    type="button"
    class="location-chip"
    class:active={selected === null}
    onclick={() => onchange(null)}
  >
    Alle
  </button>
  {#each locations as loc}
    <button
      type="button"
      class="location-chip"
      class:active={selected === loc.city}
      onclick={() => onchange(loc.city)}
    >
      {loc.city}
      <span class="count">({loc.count})</span>
    </button>
  {/each}
</div>
