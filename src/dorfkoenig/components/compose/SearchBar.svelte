<script lang="ts">
  import { Button } from '@shared/components';

  interface Props {
    value: string;
    onsearch: (query: string) => void;
  }

  let { value: initialValue, onsearch }: Props = $props();

  let query = $state(initialValue);

  function handleSubmit(e: Event) {
    e.preventDefault();
    onsearch(query.trim());
  }

  function handleClear() {
    query = '';
    onsearch('');
  }
</script>

<form class="search-bar" onsubmit={handleSubmit}>
  <input
    type="search"
    bind:value={query}
    placeholder="Semantische Suche..."
  />
  <Button type="submit" size="sm">Suchen</Button>
  {#if query}
    <Button type="button" variant="ghost" size="sm" onclick={handleClear}>
      Löschen
    </Button>
  {/if}
</form>
