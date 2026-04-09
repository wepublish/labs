<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Sparkles,
    Loader2,
    Trash2,
    Upload,
    FileText,
  } from 'lucide-svelte';
  import { units } from '../../stores/units';
  import { scouts } from '../../stores/scouts';
  import { composeApi } from '../../lib/api';
  import { bajourApi } from '../../bajour/api';
  import { villages, getScoutIdForVillage, getVillageByName } from '../../lib/villages';
  import { CUSTOM_PROMPT_TTL_MS } from '../../lib/constants';
  import { showUploadModal } from '../../stores/ui';
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

  // Retry handler — captures the last generation context
  let retryHandler = $state<(() => void) | null>(null);

  // Track initial load to avoid full-page spinner on location change
  let initialLoadDone = $state(false);

  // Filter state
  let selectedLocation = $state<string | null>(null);
  let selectedTopic = $state<string | null>(null);
  let selectedScoutId = $state<string | null>(null);
  let searchQuery = $state('');
  let isSearching = $state(false);

  // Load on mount + start background draft polling
  onMount(() => {
    units.loadLocations();
    units.load();
    scouts.load();
    bajourDrafts.load().then(() => {
      bajourDrafts.startPolling();
    });
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

  onDestroy(() => {
    bajourDrafts.stopPolling();
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
    retryHandler = () => generateDraft();
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

  async function handleAISelectRun(villageName: string, recencyDays: number | null, selectionPrompt: string, systemPromptOverride?: string) {
    showAISelectDropdown = false;
    retryHandler = () => handleAISelectRun(villageName, recencyDays, selectionPrompt);

    const village = getVillageByName(villageName);
    if (!village) {
      error = 'Ort nicht gefunden.';
      return;
    }

    const scoutId = getScoutIdForVillage(village.id);
    if (!scoutId) {
      error = 'Kein Scout für diesen Ort konfiguriert.';
      return;
    }

    draftVillageName = village.name;
    draftVillageId = village.id;

    aiPhase = 'selecting';
    generating = true;
    error = '';
    showDraftSlideOver = true;
    draft = null;

    try {
      const selectResult = await bajourApi.selectUnits({
        village_id: village.id,
        scout_id: scoutId,
        ...(recencyDays !== null && { recency_days: recencyDays }),
        selection_prompt: systemPromptOverride || selectionPrompt.trim() || undefined,
      });

      const selectedIds = selectResult.selected_unit_ids;
      if (selectedIds.length === 0) {
        error = 'Keine relevanten Einheiten gefunden.';
        generating = false;
        aiPhase = 'idle';
        return;
      }
      unitsUsedForDraft = selectedIds;

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

<div class="feed-panel">
  <!-- ═══ TOP BAR: Data concerns (sticky) ═══ -->
  <div class="top-bar">
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
    />

    <!-- Data status row -->
    <div class="data-status-row">
      {#if generating}
        <span class="status-text">
          <Loader2 size={14} class="spin" />
          KI wählt aus...
        </span>
      {:else if selectedUnitIds.size > 0}
        <span class="selection-pill">{selectedUnitIds.size} ausgewählt</span>
        <button class="text-link" onclick={clearSelection} type="button">Aufheben</button>
        <button class="icon-btn icon-btn-danger" onclick={handleDeleteSelected} type="button" title="Auswahl löschen">
          <Trash2 size={14} />
        </button>
      {:else}
        <span class="count-label">{filteredUnits.length} Einheiten</span>
        {#if filteredUnits.length > 0}
          <button class="text-link" onclick={selectAll} type="button">Alle auswählen</button>
        {/if}
      {/if}

      <button class="upload-btn" onclick={() => showUploadModal.set(true)} type="button" style="margin-left: auto;">
        <Upload size={14} />
        <span>Hochladen</span>
      </button>
    </div>
  </div>

  {#if error && !showDraftSlideOver}
    <div class="error-banner" aria-live="polite">
      {error}
      <button class="error-dismiss" onclick={() => { error = ''; }} type="button">&times;</button>
    </div>
  {/if}

  <!-- ═══ SCROLLABLE CONTENT ═══ -->
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

  <!-- ═══ FLOATING BAR: Draft actions (bottom-right) ═══ -->
  <div class="floating-bar">
    <div class="ai-select-wrapper">
      <button
        class="fab-btn ai-select-btn"
        class:active={showAISelectDropdown}
        disabled={generating}
        onclick={() => {
          if (selectedUnitIds.size > 0) {
            generateDraft();
          } else {
            showAISelectDropdown = !showAISelectDropdown;
          }
        }}
        type="button"
      >
        <Sparkles size={16} />
        <span>{selectedUnitIds.size > 0 ? 'Entwurf erstellen' : 'KI-Entwurf'}</span>
      </button>
      {#if showAISelectDropdown}
        <AISelectDropdown
          loading={generating}
          {villages}
          prefilledLocation={selectedLocation}
          onrun={handleAISelectRun}
          onclose={() => { showAISelectDropdown = false; }}
        />
      {/if}
    </div>

    <button class="fab-btn drafts-btn" onclick={() => { openDraftList = true; showDraftSlideOver = true; }} type="button">
      <FileText size={16} />
      <span>Entwürfe</span>
      {#if $bajourDrafts.drafts.length > 0}
        <span class="drafts-count-badge">{$bajourDrafts.drafts.length}</span>
      {/if}
    </button>
  </div>
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
  onRetry={() => retryHandler?.()}
  onRegenerate={regenerateDraft}
/>

<style>
  .feed-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  /* ── TOP BAR: sticky data concerns ── */
  .top-bar {
    flex-shrink: 0;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .data-status-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.375rem var(--spacing-lg);
    border-top: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }

  .count-label {
    color: var(--color-text-muted);
  }

  .status-text {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-primary);
    font-weight: 500;
  }

  .selection-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.0625rem 0.5rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
    border-radius: var(--radius-full);
    font-weight: 600;
  }

  .text-link {
    background: none;
    border: none;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .text-link:hover {
    color: var(--color-text);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-light);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .icon-btn:hover {
    background: var(--color-background);
    color: var(--color-text);
  }

  .icon-btn-danger:hover {
    background: var(--color-status-error-bg);
    border-color: var(--color-danger-light);
    color: var(--color-danger-dark);
  }

  .upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem 0.25rem 0.5rem;
    font-size: var(--text-sm);
    font-weight: 500;
    font-family: var(--font-body);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .upload-btn:hover {
    background: var(--color-background);
    color: var(--color-text);
    border-color: var(--color-primary);
  }

  /* ── SCROLLABLE CONTENT ── */
  .panel-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* ── FLOATING BAR: bottom-right draft actions ── */
  .floating-bar {
    position: absolute;
    bottom: 1.25rem;
    right: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
    z-index: var(--z-dropdown);
  }

  .ai-select-wrapper {
    position: relative;
  }

  .fab-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1.125rem 0.5rem 0.875rem;
    font-size: var(--text-base);
    font-weight: 600;
    font-family: var(--font-body);
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .ai-select-btn {
    background: var(--color-primary);
    color: white;
  }

  .ai-select-btn:hover {
    background: var(--color-primary-dark);
    box-shadow: 0 2px 10px rgba(234, 114, 110, 0.35);
    transform: translateY(-0.5px);
  }

  .ai-select-btn.active {
    background: var(--color-primary-dark);
  }

  .ai-select-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .drafts-btn {
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
  }

  .drafts-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
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

  /* ── ERROR ── */
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--color-status-error-bg);
    color: var(--color-danger-dark);
    font-size: var(--text-sm);
    border-bottom: 1px solid var(--color-danger-border);
    flex-shrink: 0;
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
