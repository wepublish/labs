<script lang="ts">
  import { onMount } from 'svelte';
  import { units } from '../../stores/units';
  import { scouts } from '../../stores/scouts';
  import { composeApi } from '../../lib/api';
  import PanelFilterBar from '../ui/PanelFilterBar.svelte';
  import UnitList from './UnitList.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import DraftSlideOver from './DraftSlideOver.svelte';
  import { Loading } from '@shared/components';
  import type { Draft, Scout } from '../../lib/types';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let error = $state('');
  let showDraftSlideOver = $state(false);
  let customPrompt = $state<string | null>(null);
  let unitsUsedForDraft = $state<string[]>([]);

  // Filter state
  let filterMode = $state<'location' | 'topic'>('location');
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let selectedScoutId = $state<string | null>(null);
  let searchQuery = $state('');
  let isSearching = $state(false);

  // Load on mount
  onMount(() => {
    units.loadLocations();
    units.load();
    scouts.load();
    // Load persisted custom prompt
    const stored = localStorage.getItem('dk_custom_draft_prompt');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
          customPrompt = parsed.value;
        } else {
          localStorage.removeItem('dk_custom_draft_prompt');
        }
      } catch { /* ignore invalid data */ }
    }
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

  // Scouts matching current filter
  let matchingScouts = $derived(
    $scouts.scouts.filter((s: Scout) => {
      if (filterMode === 'location') {
        return !selectedLocation || s.location?.city === selectedLocation;
      }
      if (!selectedTopic) return true;
      return s.topic?.split(',').map(t => t.trim()).includes(selectedTopic);
    })
  );

  let scoutNameOptions = $derived(
    matchingScouts.length === 0
      ? [{ value: '', label: 'Keine Scouts' }]
      : [
          { value: '', label: 'Alle Scouts', count: matchingScouts.length },
          ...matchingScouts.map(s => ({ value: s.id, label: s.name }))
        ]
  );

  // Filtered units (client-side)
  let filteredUnits = $derived(
    $units.units
      .filter(u => !u.used_in_article)
      .filter(u => !selectedScoutId || u.scout_id === selectedScoutId)
  );

  function handleModeChange(mode: 'location' | 'topic') {
    filterMode = mode;
    selectedLocation = null;
    selectedTopic = null;
    selectedScoutId = null;
    searchQuery = '';
  }

  function handleLocationChange(city: string | null) {
    selectedLocation = city;
    selectedScoutId = null;
    units.setLocation(city);
    units.load(city ?? undefined);
    selectedUnitIds = new Set();
    draft = null;
  }

  function handleTopicChange(topic: string | null) {
    selectedTopic = topic;
    selectedScoutId = null;
    units.setTopic(topic);
    units.load(selectedLocation ?? undefined, true, topic ?? undefined);
    selectedUnitIds = new Set();
    draft = null;
  }

  async function handleSearch(query: string) {
    searchQuery = query;
    if (query) {
      isSearching = true;
      try {
        await units.search(query, selectedLocation ?? undefined);
      } finally {
        isSearching = false;
      }
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

  function handlePromptChange(prompt: string | null) {
    customPrompt = prompt;
    if (prompt) {
      localStorage.setItem('dk_custom_draft_prompt', JSON.stringify({ value: prompt, timestamp: Date.now() }));
    } else {
      localStorage.removeItem('dk_custom_draft_prompt');
    }
  }

  async function handleDeleteSelected() {
    if (selectedUnitIds.size === 0) return;
    await units.markUsed(Array.from(selectedUnitIds));
    selectedUnitIds = new Set();
  }

  async function generateDraft() {
    if (selectedUnitIds.size === 0) return;
    generating = true;
    error = '';
    showDraftSlideOver = true;
    unitsUsedForDraft = Array.from(selectedUnitIds);
    try {
      const result = await composeApi.generate({
        unit_ids: Array.from(selectedUnitIds),
        style: 'news',
        max_words: 500,
        include_sources: true,
        ...(customPrompt && { custom_system_prompt: customPrompt }),
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

  async function regenerateDraft(regenPrompt: string | null) {
    if (unitsUsedForDraft.length === 0) return;
    generating = true;
    error = '';
    handlePromptChange(regenPrompt);
    try {
      const result = await composeApi.generate({
        unit_ids: unitsUsedForDraft,
        style: 'news',
        max_words: 500,
        include_sources: true,
        ...(regenPrompt && { custom_system_prompt: regenPrompt }),
      });
      draft = result;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      generating = false;
    }
  }
</script>

<PanelFilterBar
  {filterMode}
  onModeChange={handleModeChange}
  {locationOptions}
  {topicOptions}
  selectedLocation={selectedLocation}
  selectedTopic={selectedTopic}
  onLocationChange={handleLocationChange}
  onTopicChange={handleTopicChange}
  scoutOptions={scoutNameOptions}
  selectedScout={selectedScoutId}
  onScoutChange={(v) => { selectedScoutId = v; }}
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

<div class="panel-content">
  {#if $units.error}
    <div class="error-message">{$units.error}</div>
  {/if}

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

<SelectionBar
  selectedCount={selectedUnitIds.size}
  isGenerating={generating}
  {customPrompt}
  hasDraft={draft !== null}
  {showDraftSlideOver}
  onGenerate={generateDraft}
  onViewDraft={() => showDraftSlideOver = true}
  onPromptChange={handlePromptChange}
  onDelete={handleDeleteSelected}
/>

<DraftSlideOver
  open={showDraftSlideOver}
  {draft}
  isGenerating={generating}
  generationError={error || null}
  selectedCount={selectedUnitIds.size || unitsUsedForDraft.length}
  {customPrompt}
  onClose={() => showDraftSlideOver = false}
  onRetry={generateDraft}
  onRegenerate={regenerateDraft}
/>

<style>
  .panel-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 1.5rem;
  }

  .count-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
