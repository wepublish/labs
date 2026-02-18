<script lang="ts">
  import { scouts } from '../stores/scouts';
  import ScoutForm from '../components/scouts/ScoutForm.svelte';
  import ScoutCard from '../components/scouts/ScoutCard.svelte';
  import PanelFilterBar from '../components/ui/PanelFilterBar.svelte';
  import { Button, Card, Loading } from '@shared/components';
  import type { Scout } from '../lib/types';

  let showForm = $state(false);

  // Filter state
  let filterMode = $state<'location' | 'topic'>('location');
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let typeFilter = $state('all');

  // Expansion state
  let expandedScoutId = $state<string | null>(null);

  // Load data on mount
  $effect(() => {
    scouts.load();
  });

  // Derive locations from scouts
  let uniqueLocations = $derived(
    [...new Set(
      $scouts.scouts
        .filter((s: Scout) => s.location?.city)
        .map((s: Scout) => s.location!.city)
    )].sort()
  );

  // Derive topics from scouts (using criteria as topic proxy)
  let uniqueTopics = $derived(
    [...new Set(
      $scouts.scouts
        .filter((s: Scout) => s.criteria)
        .map((s: Scout) => s.criteria)
    )].sort().slice(0, 20)
  );

  let locationOptions = $derived(
    uniqueLocations.length === 0
      ? [{ value: '', label: 'Keine Orte' }]
      : [
          { value: '', label: 'Alle Orte', count: $scouts.scouts.filter((s: Scout) => s.location).length },
          ...uniqueLocations.map(loc => ({
            value: loc,
            label: loc,
            count: $scouts.scouts.filter((s: Scout) => s.location?.city === loc).length
          }))
        ]
  );

  let topicOptions = $derived(
    uniqueTopics.length === 0
      ? [{ value: '', label: 'Keine Themen' }]
      : [
          { value: '', label: 'Alle Themen', count: $scouts.scouts.length },
          ...uniqueTopics.map(t => ({ value: t, label: t.slice(0, 40) }))
        ]
  );

  let typeOptions = $derived([
    { value: 'all', label: 'Alle', count: $scouts.scouts.length },
    { value: 'web', label: 'Website', count: $scouts.scouts.length },
  ]);

  // Filtered scouts
  let filteredScouts = $derived(
    $scouts.scouts.filter((scout: Scout) => {
      const typeMatch = typeFilter === 'all' || true; // only web scouts for now
      const dimMatch = filterMode === 'location'
        ? (!selectedLocation || scout.location?.city === selectedLocation)
        : (!selectedTopic || scout.criteria === selectedTopic);
      return typeMatch && dimMatch;
    })
  );

  function handleModeChange(mode: 'location' | 'topic') {
    filterMode = mode;
    selectedLocation = null;
    selectedTopic = null;
  }

  function handleFormSubmit() {
    showForm = false;
  }

  function handleFormCancel() {
    showForm = false;
  }

  function toggleExpand(id: string) {
    expandedScoutId = expandedScoutId === id ? null : id;
  }
</script>

<div class="manage">
  <header class="page-header">
    <h1>Manage</h1>
    <Button onclick={() => (showForm = true)}>Neuer Scout</Button>
  </header>

  {#if showForm}
    <Card shadow="md" padding="lg">
      <ScoutForm onsubmit={handleFormSubmit} oncancel={handleFormCancel} />
    </Card>
  {/if}

  <PanelFilterBar
    {filterMode}
    onModeChange={handleModeChange}
    {locationOptions}
    {topicOptions}
    {selectedLocation}
    {selectedTopic}
    onLocationChange={(v) => { selectedLocation = v; }}
    onTopicChange={(v) => { selectedTopic = v; }}
    {typeFilter}
    {typeOptions}
    onTypeChange={(v) => { typeFilter = v; }}
    loading={$scouts.loading}
  />

  <section class="scouts-section">
    {#if $scouts.loading}
      <Loading label="Scouts laden..." />
    {:else if $scouts.error}
      <div class="error-message">{$scouts.error}</div>
    {:else if filteredScouts.length === 0}
      <div class="empty-state">
        <p>Keine Scouts gefunden.</p>
      </div>
    {:else}
      <div class="scouts-grid">
        {#each filteredScouts as scout (scout.id)}
          <ScoutCard
            {scout}
            expanded={expandedScoutId === scout.id}
            ontoggle={() => toggleExpand(scout.id)}
          />
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .manage {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .scouts-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .scouts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--spacing-md);
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }
</style>
