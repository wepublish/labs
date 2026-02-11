<script lang="ts">
  import { units } from '../../stores/units';
  import { composeApi } from '../../lib/api';
  import LocationFilter from './LocationFilter.svelte';
  import SearchBar from './SearchBar.svelte';
  import UnitList from './UnitList.svelte';
  import DraftPreview from './DraftPreview.svelte';
  import { Button, Loading } from '@shared/components';
  import type { Draft } from '../../lib/types';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let error = $state('');

  // Load locations and initial units on mount
  $effect(() => {
    units.loadLocations();
    units.load();
  });

  function handleLocationChange(city: string | null) {
    units.setLocation(city);
    units.load(city ?? undefined);
    selectedUnitIds = new Set();
    draft = null;
  }

  function handleSearch(query: string) {
    const location = $units.selectedLocation;
    if (query) {
      units.search(query, location ?? undefined);
    } else {
      units.load(location ?? undefined);
    }
  }

  function toggleUnit(id: string) {
    const newSet = new Set(selectedUnitIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedUnitIds = newSet;
  }

  async function generateDraft() {
    if (selectedUnitIds.size === 0) return;

    generating = true;
    error = '';

    try {
      const result = await composeApi.generate({
        unit_ids: Array.from(selectedUnitIds),
        style: 'news',
        max_words: 500,
        include_sources: true,
      });
      draft = result;

      // Mark units as used
      await units.markUsed(Array.from(selectedUnitIds));
      selectedUnitIds = new Set();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      generating = false;
    }
  }

  function clearDraft() {
    draft = null;
  }
</script>

<div class="compose-layout">
  <div class="compose-sidebar">
    <h2>Informationseinheiten</h2>

    <LocationFilter
      locations={$units.locations}
      selected={$units.selectedLocation}
      onchange={handleLocationChange}
    />

    <SearchBar value={$units.searchQuery} onsearch={handleSearch} />

    {#if $units.loading}
      <Loading label="Laden..." />
    {:else if $units.error}
      <div class="error-message">{$units.error}</div>
    {:else}
      <UnitList
        units={$units.units}
        selected={selectedUnitIds}
        ontoggle={toggleUnit}
      />
    {/if}

    <div class="compose-actions">
      <span class="selection-count">{selectedUnitIds.size} ausgewählt</span>
      <Button
        onclick={generateDraft}
        disabled={selectedUnitIds.size === 0}
        loading={generating}
      >
        Entwurf erstellen
      </Button>
    </div>
  </div>

  <div class="compose-preview">
    <div class="preview-header">
      <h2>Entwurf</h2>
      {#if draft}
        <Button variant="ghost" size="sm" onclick={clearDraft}>Zurücksetzen</Button>
      {/if}
    </div>

    {#if error}
      <div class="error-message">{error}</div>
    {:else if draft}
      <DraftPreview {draft} />
    {:else}
      <div class="empty-state">
        <p>Wählen Sie Informationseinheiten aus und klicken Sie auf "Entwurf erstellen"</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .preview-header h2 {
    margin: 0;
  }
</style>
