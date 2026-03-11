<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Sparkles,
    Loader2,
    Trash2,
    ChevronDown,
    FileText,
  } from 'lucide-svelte';
  import { units } from '../../stores/units';
  import { scouts } from '../../stores/scouts';
  import { composeApi } from '../../lib/api';
  import { bajourApi } from '../../bajour/api';
  import { villages, getScoutIdForVillage, getVillageByName } from '../../lib/villages';
  import { CUSTOM_PROMPT_TTL_MS } from '../../lib/constants';
  import PanelFilterBar from '../ui/PanelFilterBar.svelte';
  import UnitList from './UnitList.svelte';
  import AISelectDropdown from './AISelectDropdown.svelte';
  import DraftSlideOver from './DraftSlideOver.svelte';
  import { Loading } from '@shared/components';
  import { bajourDrafts } from '../../bajour/store';
  import type { Draft, Scout } from '../../lib/types';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let error = $state('');
  let showDraftSlideOver = $state(false);
  let openDraftList = $state(false);
  let customPrompt = $state<string | null>(null);
  let unitsUsedForDraft = $state<string[]>([]);

  // Frozen village context — captured at draft generation time
  let draftVillageName = $state<string | undefined>(undefined);
  let draftVillageId = $state<string | undefined>(undefined);

  // AI Select state
  let showAISelectDropdown = $state(false);
  let aiPhase = $state<'idle' | 'selecting' | 'generating'>('idle');

  // Track initial load to avoid full-page spinner on location change
  let initialLoadDone = $state(false);

  // Filter state
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
    bajourDrafts.load();
    const stored = localStorage.getItem('dk_custom_draft_prompt');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && Date.now() - parsed.timestamp < CUSTOM_PROMPT_TTL_MS) {
          customPrompt = parsed.value;
        } else {
          localStorage.removeItem('dk_custom_draft_prompt');
        }
      } catch { /* ignore invalid data */ }
    }
  });

  // Mark initial load done when loading transitions to false
  $effect(() => {
    if (!$units.loading && !initialLoadDone) {
      initialLoadDone = true;
    }
  });

  // Derive location options from village JSON
  let locationOptions = $derived([
    { value: '', label: 'Alle Orte' },
    ...villages.map(v => ({ value: v.name, label: v.name })),
  ]);

  let topicOptions = $derived(
    ($units.topics ?? []).length === 0
      ? [{ value: '', label: 'Keine Themen' }]
      : [
          { value: '', label: 'Alle Themen' },
          ...($units.topics ?? []).map((t: string) => ({ value: t, label: t }))
        ]
  );

  // Scouts matching current filter (AND logic)
  let matchingScouts = $derived(
    $scouts.scouts.filter((s: Scout) => {
      const locationMatch = !selectedLocation || s.location?.city === selectedLocation;
      const topicMatch = !selectedTopic || s.topic?.split(',').map(t => t.trim()).includes(selectedTopic);
      return locationMatch && topicMatch;
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

  function resetDraftState() {
    selectedUnitIds = new Set();
    draft = null;
    draftVillageName = undefined;
    draftVillageId = undefined;
  }

  function handleLocationChange(city: string | null) {
    selectedLocation = city;
    selectedScoutId = null;
    units.setLocation(city);
    units.load(city ?? undefined);
    resetDraftState();
  }

  function handleTopicChange(topic: string | null) {
    selectedTopic = topic;
    selectedScoutId = null;
    units.setTopic(topic);
    units.load(selectedLocation ?? undefined, true, topic ?? undefined);
    resetDraftState();
  }

  async function handleSearch(query: string) {
    searchQuery = query;
    if (query) {
      isSearching = true;
      try {
        await units.search(query, selectedLocation ?? undefined, selectedTopic ?? undefined);
      } finally {
        isSearching = false;
      }
    } else {
      units.load(selectedLocation ?? undefined, true, selectedTopic ?? undefined);
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

  function selectAll() {
    selectedUnitIds = new Set(filteredUnits.map(u => u.id));
  }

  function clearSelection() {
    selectedUnitIds = new Set();
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
    const village = selectedLocation ? getVillageByName(selectedLocation) : null;
    draftVillageName = village?.name;
    draftVillageId = village?.id;
    generating = true;
    error = '';
    aiPhase = 'generating';
    showDraftSlideOver = true;
    const unitIds = Array.from(selectedUnitIds);
    unitsUsedForDraft = unitIds;
    try {
      const result = await composeApi.generate({
        unit_ids: unitIds,
        style: 'news',
        max_words: 500,
        include_sources: true,
        ...(customPrompt && { custom_system_prompt: customPrompt }),
      });
      draft = result;
      await units.markUsed(unitIds);
      selectedUnitIds = new Set();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      generating = false;
      aiPhase = 'idle';
    }
  }

  async function handleAISelectRun(recencyDays: number | null, selectionPrompt: string) {
    showAISelectDropdown = false;

    // Derive village from selected location
    const village = selectedLocation ? getVillageByName(selectedLocation) : null;
    if (!village) {
      error = 'Bitte wähle zuerst einen Ort aus.';
      return;
    }

    const scoutId = getScoutIdForVillage(village.id);
    if (!scoutId) {
      error = 'Kein Scout für diesen Ort konfiguriert.';
      return;
    }

    // Freeze village context for this draft
    draftVillageName = village.name;
    draftVillageId = village.id;

    // Open slide-over immediately
    aiPhase = 'selecting';
    generating = true;
    error = '';
    showDraftSlideOver = true;
    draft = null;

    try {
      // Phase 1: AI selection
      const selectResult = await bajourApi.selectUnits({
        village_id: village.id,
        scout_id: scoutId,
        ...(recencyDays !== null && { recency_days: recencyDays }),
        selection_prompt: selectionPrompt.trim() || undefined,
      });

      const selectedIds = selectResult.selected_unit_ids;
      if (selectedIds.length === 0) {
        error = 'Keine relevanten Einheiten gefunden.';
        generating = false;
        aiPhase = 'idle';
        return;
      }
      unitsUsedForDraft = selectedIds;

      // Phase 2: Generate draft
      aiPhase = 'generating';
      const result = await composeApi.generate({
        unit_ids: selectedIds,
        style: 'news',
        max_words: 500,
        include_sources: true,
        ...(customPrompt && { custom_system_prompt: customPrompt }),
      });

      draft = result;
      await units.markUsed(selectedIds);
      selectedUnitIds = new Set();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      generating = false;
      aiPhase = 'idle';
    }
  }

  async function regenerateDraft(regenPrompt: string | null) {
    if (unitsUsedForDraft.length === 0) return;
    generating = true;
    error = '';
    aiPhase = 'generating';
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
      aiPhase = 'idle';
    }
  }

  let progressMessage = $derived(
    aiPhase === 'selecting'
      ? 'Informationen auswählen...'
      : 'Entwurf wird erstellt...'
  );
</script>

<PanelFilterBar
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
  searchPlaceholder="Informationen filtern..."
  onSearch={handleSearch}
  {isSearching}
>
  {#snippet toolbar()}
    {#if generating}
      <span class="toolbar-status">
        <Loader2 size={14} class="spin" />
        KI wählt aus...
      </span>
    {:else if selectedUnitIds.size > 0}
      <span class="selection-count">{selectedUnitIds.size} ausgewählt</span>
      <button class="toolbar-btn delete-btn" onclick={handleDeleteSelected} type="button" title="Auswahl löschen">
        <Trash2 size={14} />
      </button>
      <button class="toolbar-link" onclick={clearSelection} type="button">
        Auswahl aufheben
      </button>
      <button
        class="toolbar-btn generate-btn"
        onclick={generateDraft}
        disabled={generating}
      >
        <Sparkles size={14} />
        <span>Entwurf erstellen</span>
      </button>
    {:else if filteredUnits.length > 0}
      <span class="count-label">{filteredUnits.length} verfügbar</span>
      <button class="toolbar-link" onclick={selectAll} type="button">
        Alle auswählen
      </button>
      <div class="ai-select-wrapper">
        <button
          class="toolbar-btn ai-select-btn"
          class:active={showAISelectDropdown}
          disabled={!selectedLocation}
          title={!selectedLocation ? 'Bitte zuerst einen Ort auswählen' : ''}
          onclick={() => { if (!selectedLocation) return; showAISelectDropdown = !showAISelectDropdown; }}
          type="button"
        >
          <Sparkles size={14} />
          <span>AI Select</span>
          <ChevronDown size={12} />
        </button>
        {#if showAISelectDropdown}
          <AISelectDropdown
            loading={generating}
            onrun={handleAISelectRun}
            onclose={() => { showAISelectDropdown = false; }}
          />
        {/if}
      </div>
    {/if}
    <button class="toolbar-btn drafts-btn" onclick={() => { openDraftList = true; showDraftSlideOver = true; }} type="button">
      <FileText size={14} />
      <span>Entwürfe</span>
      {#if $bajourDrafts.drafts.length > 0}
        <span class="drafts-count-badge">{$bajourDrafts.drafts.length}</span>
      {/if}
    </button>
  {/snippet}
</PanelFilterBar>

{#if error && !showDraftSlideOver}
  <div class="error-banner" aria-live="polite">
    {error}
    <button class="error-dismiss" onclick={() => { error = ''; }} type="button">&times;</button>
  </div>
{/if}

<div class="panel-content">
  {#if $units.error}
    <div class="error-message" aria-live="polite">{$units.error}</div>
  {/if}

  {#if $units.loading && !initialLoadDone}
    <Loading label="Laden..." />
  {:else}
    <UnitList
      units={filteredUnits}
      selected={selectedUnitIds}
      ontoggle={toggleUnit}
      dimmed={($units.loading && initialLoadDone) || generating}
    />
  {/if}
</div>

<DraftSlideOver
  open={showDraftSlideOver}
  {draft}
  isGenerating={generating}
  generationError={error || null}
  selectedCount={selectedUnitIds.size || unitsUsedForDraft.length}
  {customPrompt}
  {progressMessage}
  villageName={draftVillageName}
  villageId={draftVillageId}
  unitIds={unitsUsedForDraft}
  initialShowDraftList={openDraftList}
  onClose={() => { showDraftSlideOver = false; openDraftList = false; }}
  onRetry={generateDraft}
  onRegenerate={regenerateDraft}
/>

<style>
  .panel-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .count-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .toolbar-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-sm);
    color: var(--color-primary);
    font-weight: 500;
  }

  .selection-count {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .toolbar-link {
    background: none;
    border: none;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .toolbar-link:hover {
    color: var(--color-text);
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    font-size: var(--text-sm);
    font-weight: 500;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .toolbar-btn:hover {
    background: var(--color-background);
    color: var(--color-text);
  }

  .delete-btn:hover {
    background: var(--color-status-error-bg);
    border-color: var(--color-danger-light);
    color: var(--color-danger-dark);
  }

  .generate-btn {
    gap: 0.375rem;
    color: white;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    border: none;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(234, 114, 110, 0.3);
  }

  .generate-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(234, 114, 110, 0.35);
  }

  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ai-select-wrapper {
    position: relative;
  }

  .ai-select-btn {
    gap: 0.375rem;
    color: var(--color-primary);
    border-color: rgba(234, 114, 110, 0.3);
  }

  .ai-select-btn:hover:not(:disabled),
  .ai-select-btn.active {
    background: rgba(234, 114, 110, 0.08);
    border-color: rgba(234, 114, 110, 0.4);
  }

  .ai-select-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .drafts-btn {
    gap: 0.375rem;
    margin-left: auto;
  }

  .drafts-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1;
    color: white;
    background: var(--color-primary);
    border-radius: 999px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--color-status-error-bg);
    color: var(--color-danger-dark);
    font-size: var(--text-sm);
    border-bottom: 1px solid var(--color-danger-border);
  }

  .error-dismiss {
    background: none;
    border: none;
    font-size: var(--text-lg);
    color: var(--color-danger-dark);
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }
</style>
