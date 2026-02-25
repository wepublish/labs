<script lang="ts">
  import { onMount } from 'svelte';
  import { scouts } from '../stores/scouts';
  import ScoutCard from '../components/scouts/ScoutCard.svelte';
  import PanelFilterBar from '../components/ui/PanelFilterBar.svelte';
  import { Loading } from '@shared/components';
  import type { Scout } from '../lib/types';

  // Filter state
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let selectedScout = $state<string | null>(null);
  // Expansion state
  let expandedScoutId = $state<string | null>(null);

  // Load data on mount
  onMount(() => {
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

  // Derive topics from scouts' topic field (split comma-separated, deduplicate, sort)
  let uniqueTopics = $derived(
    [...new Set(
      $scouts.scouts
        .filter((s: Scout) => s.topic)
        .flatMap((s: Scout) => s.topic!.split(',').map(t => t.trim()))
        .filter(Boolean)
    )].sort()
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
          { value: '', label: 'Alle Themen', count: $scouts.scouts.filter((s: Scout) => s.topic).length },
          ...uniqueTopics.map(t => ({
            value: t,
            label: t.slice(0, 40),
            count: $scouts.scouts.filter((s: Scout) =>
              s.topic?.split(',').map(x => x.trim()).includes(t)
            ).length
          }))
        ]
  );

  // Filtered scouts (by location AND topic)
  let filteredScouts = $derived(
    $scouts.scouts.filter((scout: Scout) => {
      const locationMatch = !selectedLocation || scout.location?.city === selectedLocation;
      const topicMatch = !selectedTopic || (scout.topic?.split(',').map(t => t.trim()) || []).includes(selectedTopic);
      return locationMatch && topicMatch;
    })
  );

  // Scout name options from filtered scouts
  let scoutNameOptions = $derived(
    filteredScouts.length === 0
      ? [{ value: '', label: 'Keine Scouts' }]
      : [
          { value: '', label: 'Alle Scouts', count: filteredScouts.length },
          ...filteredScouts.map(s => ({ value: s.id, label: s.name }))
        ]
  );

  // Further filter by selected scout
  let displayedScouts = $derived(
    selectedScout
      ? filteredScouts.filter(s => s.id === selectedScout)
      : filteredScouts
  );

  function toggleExpand(id: string) {
    expandedScoutId = expandedScoutId === id ? null : id;
  }
</script>

<PanelFilterBar
  {locationOptions}
  {topicOptions}
  {selectedLocation}
  {selectedTopic}
  onLocationChange={(v) => { selectedLocation = v; selectedScout = null; }}
  onTopicChange={(v) => { selectedTopic = v; selectedScout = null; }}
  scoutOptions={scoutNameOptions}
  {selectedScout}
  onScoutChange={(v) => { selectedScout = v; }}
  loading={$scouts.loading}
/>

<div class="panel-content">
  {#if $scouts.loading && $scouts.scouts.length === 0}
    <Loading label="Scouts laden..." />
  {:else if $scouts.error}
    <div class="error-message">{$scouts.error}</div>
  {:else if displayedScouts.length === 0}
    <div class="empty-state">
      <p>Keine Scouts gefunden.</p>
    </div>
  {:else}
    <div class="scouts-grid">
      {#each displayedScouts as scout (scout.id)}
        <ScoutCard
          {scout}
          expanded={expandedScoutId === scout.id}
          ontoggle={() => toggleExpand(scout.id)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 1.5rem;
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
