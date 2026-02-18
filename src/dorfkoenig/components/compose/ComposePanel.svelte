<script lang="ts">
  import { units } from '../../stores/units';
  import { composeApi } from '../../lib/api';
  import PanelFilterBar from '../ui/PanelFilterBar.svelte';
  import UnitList from './UnitList.svelte';
  import DraftPreview from './DraftPreview.svelte';
  import { Button, Loading } from '@shared/components';
  import type { Draft, InformationUnit } from '../../lib/types';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let error = $state('');

  // Filter state
  let filterMode = $state<'location' | 'topic'>('location');
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let typeFilter = $state('all');
  let searchQuery = $state('');
  let isSearching = $state(false);

  // Load on mount
  $effect(() => {
    units.loadLocations();
    units.load();
  });

  // Derive options
  let locationOptions = $derived(
    $units.locations.length === 0
      ? [{ value: '', label: 'Keine Orte' }]
      : [
          { value: '', label: 'Alle Orte' },
          ...$units.locations.map(loc => ({ value: loc.city, label: loc.city, count: loc.count }))
        ]
  );

  let topicOptions = $derived(
    ($units.topics ?? []).length === 0
      ? [{ value: '', label: 'Keine Themen' }]
      : [
          { value: '', label: 'Alle Themen' },
          ...($units.topics ?? []).map((t: string) => ({ value: t, label: t }))
        ]
  );

  let typeOptions = $derived([
    { value: 'all', label: 'Alle', count: $units.units.filter(u => !u.used_in_article).length },
  ]);

  // Filtered units (client-side)
  let filteredUnits = $derived(
    $units.units
      .filter(u => !u.used_in_article)
      .filter(u => typeFilter === 'all' || true)
  );

  function handleModeChange(mode: 'location' | 'topic') {
    filterMode = mode;
    selectedLocation = null;
    selectedTopic = null;
    searchQuery = '';
  }

  function handleLocationChange(city: string | null) {
    selectedLocation = city;
    units.setLocation(city);
    units.load(city ?? undefined);
    selectedUnitIds = new Set();
    draft = null;
  }

  function handleTopicChange(topic: string | null) {
    selectedTopic = topic;
    units.setTopic(topic);
    units.load(selectedLocation ?? undefined);
    selectedUnitIds = new Set();
    draft = null;
  }

  function handleSearch(query: string) {
    searchQuery = query;
    if (query) {
      isSearching = true;
      units.search(query, selectedLocation ?? undefined).then(() => {
        isSearching = false;
      });
    } else {
      units.load(selectedLocation ?? undefined);
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

<div class="feed-layout">
  <PanelFilterBar
    {filterMode}
    onModeChange={handleModeChange}
    {locationOptions}
    {topicOptions}
    selectedLocation={selectedLocation}
    selectedTopic={selectedTopic}
    onLocationChange={handleLocationChange}
    onTopicChange={handleTopicChange}
    {typeFilter}
    {typeOptions}
    onTypeChange={(v) => { typeFilter = v; }}
    loading={$units.loading}
    showSearch={true}
    {searchQuery}
    searchPlaceholder="Semantische Suche..."
    onSearch={handleSearch}
    {isSearching}
  >
    {#snippet toolbar()}
      {#if filteredUnits.length > 0}
        <span class="count-label">{filteredUnits.length} verfügbar</span>
      {/if}
    {/snippet}
  </PanelFilterBar>

  {#if $units.error}
    <div class="error-message">{$units.error}</div>
  {/if}

  <div class="feed-content">
    {#if $units.loading}
      <Loading label="Laden..." />
    {:else}
      <UnitList
        units={filteredUnits}
        selected={selectedUnitIds}
        ontoggle={toggleUnit}
      />
    {/if}
  </div>

  <div class="feed-actions">
    <span class="selection-count">{selectedUnitIds.size} ausgewählt</span>
    <Button
      onclick={generateDraft}
      disabled={selectedUnitIds.size === 0}
      loading={generating}
    >
      Entwurf erstellen
    </Button>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if draft}
    <div class="draft-section">
      <div class="draft-header">
        <h2>Entwurf</h2>
        <Button variant="ghost" size="sm" onclick={clearDraft}>Zurücksetzen</Button>
      </div>
      <DraftPreview {draft} />
    </div>
  {/if}
</div>

<style>
  .feed-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .feed-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  .feed-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .selection-count {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .count-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .draft-section {
    border-top: 1px solid var(--color-border);
    padding: var(--spacing-md);
  }

  .draft-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .draft-header h2 {
    margin: 0;
  }
</style>
