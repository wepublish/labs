<script lang="ts">
  import { onMount } from 'svelte';
  import { scouts } from '../stores/scouts';
  import ScoutCard from '../components/scouts/ScoutCard.svelte';
  import UploadsManagePanel from '../components/uploads/UploadsManagePanel.svelte';
  import PanelFilterBar from '../components/ui/PanelFilterBar.svelte';
  import { Loading } from '@shared/components';
  import { EmptyState } from '../components/ui/primitives';
  import { Radar, Upload } from 'lucide-svelte';
  import { showScoutModal } from '../stores/ui';
  import type { Scout } from '../lib/types';

  type ManageMode = 'scouts' | 'uploads';

  // Filter state
  let activeMode = $state<ManageMode>('scouts');
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

  function handleScoutDeleted(id: string) {
    if (expandedScoutId === id) expandedScoutId = null;
    if (selectedScout === id) selectedScout = null;
  }
</script>

<h1 class="visually-hidden">Scouts verwalten</h1>

<div class="manage-mode-bar" role="tablist" aria-label="Verwaltungsbereich">
  <button
    class="mode-tab"
    class:active={activeMode === 'scouts'}
    type="button"
    role="tab"
    aria-selected={activeMode === 'scouts'}
    onclick={() => { activeMode = 'scouts'; }}
  >
    <Radar size={15} />
    <span>Scouts</span>
  </button>
  <button
    class="mode-tab"
    class:active={activeMode === 'uploads'}
    type="button"
    role="tab"
    aria-selected={activeMode === 'uploads'}
    onclick={() => { activeMode = 'uploads'; }}
  >
    <Upload size={15} />
    <span>Uploads</span>
  </button>
</div>

{#if activeMode === 'scouts'}
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
{/if}

<div class="panel-content">
  {#if activeMode === 'uploads'}
    <UploadsManagePanel />
  {:else if $scouts.loading && $scouts.scouts.length === 0}
    <Loading label="Scouts laden..." />
  {:else if $scouts.error}
    <div class="error-message" aria-live="polite">{$scouts.error}</div>
  {:else if displayedScouts.length === 0}
    <EmptyState
      icon={Radar}
      title="Noch keine Scouts"
      description="Erstellen Sie Ihren ersten Scout, um Webseiten zu überwachen."
    >
      {#snippet action()}
        <button class="empty-cta" onclick={() => showScoutModal.set(true)}>
          Neuer Scout
        </button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="scouts-grid">
      {#each displayedScouts as scout (scout.id)}
        <ScoutCard
          {scout}
          expanded={expandedScoutId === scout.id}
          ontoggle={() => toggleExpand(scout.id)}
          ondelete={handleScoutDeleted}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .manage-mode-bar {
    display: flex;
    gap: 0.25rem;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .mode-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
  }

  .mode-tab:hover,
  .mode-tab.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .mode-tab.active {
    background: rgba(234, 114, 110, 0.08);
  }

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .scouts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--spacing-md);
    align-items: start;
  }

  .empty-cta {
    padding: var(--spacing-xs) var(--spacing-md);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: white;
    font-size: var(--text-base-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .empty-cta:hover {
    background: var(--color-primary-dark);
  }
</style>
