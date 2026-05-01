<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Sparkles,
    Loader2,
    Trash2,
    Search,
    X,
  } from 'lucide-svelte';
  import { units } from '../../stores/units';
  import { scouts } from '../../stores/scouts';
  import { composeApi } from '../../lib/api';
  import { bajourApi } from '../../bajour/api';
  import { getActiveVillages, getVillageByName, loadPilotVillages, pilotVillages } from '../../lib/villages';

  import PanelFilterBar from '../ui/PanelFilterBar.svelte';
  import UnitList from './UnitList.svelte';
  import AISelectDropdown from './AISelectDropdown.svelte';
  import DraftSlideOver from './DraftSlideOver.svelte';
  import ScoutCard from '../scouts/ScoutCard.svelte';
  import ScoutRunLog from '../scouts/ScoutRunLog.svelte';
  import { Loading } from '@shared/components';
  import { bajourDrafts } from '../../bajour/store';
  import type { Draft, Scout } from '../../lib/types';
  import type { BajourDraft } from '../../bajour/types';

  let selectedUnitIds = $state<Set<string>>(new Set());
  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let error = $state('');
  let showDraftSlideOver = $state(false);
  let customPrompt = $state<string | null>(null);
  let unitsUsedForDraft = $state<string[]>([]);
  let adminLinkedDraft = $state<BajourDraft | null>(null);

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
  let isSearching = $state(false);
  let dateFrom = $state<string>('');
  let dateTo = $state<string>('');
  let searchInput = $state('');
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let runLogRefreshKey = $state(0);

  // Load on mount + start background draft polling
  onMount(() => {
    units.loadLocations();
    units.load();
    scouts.load();
    loadPilotVillages();
    bajourDrafts.load().then(() => {
      bajourDrafts.startPolling();
    });

    // Admin email deep-link: ?draft=<id>&sig=<hex>&exp=<unix>
    const params = new URLSearchParams(window.location.search);
    const adminDraftId = params.get('draft');
    const adminSig = params.get('sig');
    const adminExp = params.get('exp');
    if (adminDraftId && adminSig && adminExp) {
      bajourApi
        .getDraftAdmin(adminDraftId, adminSig, adminExp)
        .then((fetched) => {
          adminLinkedDraft = fetched;
          showDraftSlideOver = true;
        })
        .catch((err) => {
          error = `Entwurf konnte nicht geladen werden: ${(err as Error).message}`;
        });
    }
  });

  onDestroy(() => {
    bajourDrafts.stopPolling();
    if (searchTimeout) clearTimeout(searchTimeout);
  });

  // Mark initial load done when loading transitions to false
  $effect(() => {
    if (!$units.loading && !initialLoadDone) {
      initialLoadDone = true;
    }
  });

  let activeVillages = $derived(getActiveVillages($pilotVillages));

  function villageIsActive(city: string | null | undefined): boolean {
    if (!city) return false;
    return activeVillages.some((v) => v.id === city || v.name === city);
  }

  function cityMatchesSelection(city: string | null | undefined, selected: string | null): boolean {
    if (!selected) return true;
    if (!city) return false;
    const selectedVillage = activeVillages.find((v) => v.name === selected || v.id === selected);
    if (!selectedVillage) return city === selected;
    return city === selectedVillage.name || city === selectedVillage.id;
  }

  $effect(() => {
    if (selectedLocation && !villageIsActive(selectedLocation)) {
      handleLocationChange(null);
    }
  });

  // Derive location options from the active village allowlist.
  let locationOptions = $derived([
    { value: '', label: 'Alle Orte' },
    ...activeVillages.map(v => ({ value: v.name, label: v.name })),
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
      const activeVillageMatch = !!selectedLocation || villageIsActive(s.location?.city);
      const locationMatch = cityMatchesSelection(s.location?.city, selectedLocation);
      const topicMatch = !selectedTopic || s.topic?.split(',').map(t => t.trim()).includes(selectedTopic);
      return activeVillageMatch && locationMatch && topicMatch;
    })
  );

  let selectedScout = $derived(
    selectedScoutId
      ? $scouts.scouts.find((s: Scout) => s.id === selectedScoutId) ?? null
      : null
  );

  let visibleScouts = $derived(
    selectedScout ? [selectedScout] : matchingScouts
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
      .filter(u => !!selectedLocation || villageIsActive(u.location?.city))
      .filter(u => !u.used_in_article)
  );

  function resetDraftState() {
    selectedUnitIds = new Set();
    draft = null;
    draftVillageName = undefined;
    draftVillageId = undefined;
  }

  function resetSearchState() {
    searchInput = '';
    units.clearSearch();
  }

  function handleLocationChange(city: string | null) {
    selectedLocation = city;
    selectedScoutId = null;
    units.setScout(null);
    units.setLocation(city);
    resetSearchState();
    units.load(city ?? undefined, true, selectedTopic ?? undefined, dateFrom || undefined, dateTo || undefined);
    resetDraftState();
  }

  function handleTopicChange(topic: string | null) {
    selectedTopic = topic;
    selectedScoutId = null;
    units.setScout(null);
    units.setTopic(topic);
    resetSearchState();
    units.load(selectedLocation ?? undefined, true, topic ?? undefined, dateFrom || undefined, dateTo || undefined);
    resetDraftState();
  }

  function handleDateChange(from: string, to: string) {
    dateFrom = from;
    dateTo = to;
    units.setDateRange(from || null, to || null);
    resetSearchState();
    units.load(
      selectedLocation ?? undefined,
      true,
      selectedTopic ?? undefined,
      from || undefined,
      to || undefined,
      selectedScoutId ?? undefined
    );
    resetDraftState();
  }

  function handleScoutChange(id: string | null) {
    selectedScoutId = id;
    units.setScout(id);
    resetSearchState();
    units.load(
      selectedLocation ?? undefined,
      true,
      selectedTopic ?? undefined,
      dateFrom || undefined,
      dateTo || undefined,
      id ?? undefined
    );
    resetDraftState();
  }

  function handleScoutClick(id: string) {
    handleScoutChange(selectedScoutId === id ? null : id);
  }

  function handleScoutDeleted(id: string) {
    if (selectedScoutId === id) {
      handleScoutChange(null);
    }
  }

  function refreshRunLog() {
    runLogRefreshKey += 1;
  }

  async function handleSearch(query: string) {
    if (query) {
      isSearching = true;
      try {
        await units.search(
          query,
          selectedLocation ?? undefined,
          selectedTopic ?? undefined,
          selectedScoutId ?? undefined
        );
      } finally {
        isSearching = false;
      }
    } else {
      units.load(
        selectedLocation ?? undefined,
        true,
        selectedTopic ?? undefined,
        dateFrom || undefined,
        dateTo || undefined,
        selectedScoutId ?? undefined
      );
    }
  }

  function handleSearchInput(event: Event) {
    const query = (event.currentTarget as HTMLInputElement).value;
    searchInput = query;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      handleSearch(query);
    }, 300);
  }

  function clearSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchInput = '';
    handleSearch('');
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
        ...(village && { village_id: village.id, village_name: village.name }),
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

  async function handleAISelectRun(villageName: string, recencyDays: number | null, selectionPrompt: string) {
    showAISelectDropdown = false;
    retryHandler = () => handleAISelectRun(villageName, recencyDays, selectionPrompt);

    const village = getVillageByName(villageName);
    if (!village) {
      error = 'Ort nicht gefunden.';
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
        ...(recencyDays !== null && { recency_days: recencyDays }),
        selection_hint: selectionPrompt.trim() || undefined,
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
        village_id: village.id,
        village_name: village.name,
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
    customPrompt = regenPrompt;
    try {
      const result = await composeApi.generate({
        unit_ids: unitsUsedForDraft,
        style: 'news',
        max_words: 500,
        include_sources: true,
        ...(draftVillageId && draftVillageName && {
          village_id: draftVillageId,
          village_name: draftVillageName,
        }),
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
      onScoutChange={handleScoutChange}
      loading={$scouts.loading && $scouts.scouts.length === 0}
    />
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
      <section class="scouts-section" aria-labelledby="scouts-heading">
        {#if selectedScout}
          <div class="focused-scout-return">
            <button class="back-to-scouts-btn" onclick={() => handleScoutChange(null)} type="button">
              ← Alle Scouts
            </button>
          </div>
        {:else}
          <div class="section-heading">
            <div>
              <h2 id="scouts-heading">Scouts</h2>
              <p>
                Wählen Sie einen Scout, um die Inbox zu filtern.
              </p>
            </div>
            <span class="section-count">{matchingScouts.length} Scouts</span>
          </div>
        {/if}

        {#if $scouts.loading && $scouts.scouts.length === 0}
          <Loading label="Scouts laden..." />
        {:else if $scouts.error}
          <div class="error-message" aria-live="polite">{$scouts.error}</div>
        {:else if visibleScouts.length === 0}
          <div class="empty-inline">Keine Scouts passen zu den aktuellen Filtern.</div>
        {:else}
          {#if selectedScout}
            <div class="focused-scout-layout">
              <div class="scouts-grid scouts-grid-focused">
                <ScoutCard
                  scout={selectedScout}
                  expanded={true}
                  ontoggle={() => handleScoutClick(selectedScout.id)}
                  ondelete={handleScoutDeleted}
                  onruncomplete={refreshRunLog}
                />
              </div>
              <ScoutRunLog scoutId={selectedScout.id} refreshKey={runLogRefreshKey} />
            </div>
          {:else}
            <div class="scouts-grid">
              {#each visibleScouts as scout (scout.id)}
                <ScoutCard
                  {scout}
                  expanded={false}
                  ontoggle={() => handleScoutClick(scout.id)}
                  ondelete={handleScoutDeleted}
                />
              {/each}
            </div>
          {/if}
        {/if}
      </section>

      <section class="inbox-section" aria-labelledby="inbox-heading">
        <div class="section-heading">
          <div>
            <h2 id="inbox-heading">Inbox</h2>
            <p>
              {#if selectedScout}
                Informationseinheiten aus diesem Scout.
              {:else}
                Informationseinheiten aus allen Scouts und Uploads.
              {/if}
            </p>
          </div>
          <span class="section-count">{filteredUnits.length}</span>
        </div>

        <div class="inbox-toolbar">
          <div class="inbox-search">
            <Search size={14} />
            <input
              type="text"
              value={searchInput}
              oninput={handleSearchInput}
              placeholder={selectedScout ? `Informationen in ${selectedScout.name} suchen...` : 'Informationen suchen...'}
            />
            {#if isSearching}
              <Loader2 size={14} class="spin" />
            {:else if searchInput}
              <button class="search-clear" onclick={clearSearch} type="button" aria-label="Suche löschen">
                <X size={14} />
              </button>
            {/if}
          </div>

          <div class="date-filter-compact">
            <input
              type="date"
              value={dateFrom}
              oninput={(e) => handleDateChange(e.currentTarget.value, dateTo)}
              aria-label="Von Datum"
            />
            <span>–</span>
            <input
              type="date"
              value={dateTo}
              oninput={(e) => handleDateChange(dateFrom, e.currentTarget.value)}
              aria-label="Bis Datum"
            />
          </div>
        </div>

        <div class="inbox-action-row">
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
            {#if selectedScout}
              <span class="scope-pill">{selectedScout.name}</span>
              <button class="text-link" onclick={() => handleScoutChange(null)} type="button">Alle Scouts anzeigen</button>
            {/if}
            {#if filteredUnits.length > 0}
              <button class="text-link" onclick={selectAll} type="button">Alle auswählen</button>
            {/if}
          {/if}
        </div>

        <UnitList
          units={filteredUnits}
          selected={selectedUnitIds}
          ontoggle={toggleUnit}
          dimmed={($units.loading && initialLoadDone) || generating}
        />
      </section>
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
          villages={activeVillages}
          prefilledLocation={selectedLocation}
          onrun={handleAISelectRun}
          onclose={() => { showAISelectDropdown = false; }}
        />
      {/if}
    </div>
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
  initialSavedDraft={adminLinkedDraft}
  onClose={() => { showDraftSlideOver = false; adminLinkedDraft = null; }}
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

  .scope-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.0625rem 0.5rem;
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
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

  .scouts-section,
  .inbox-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .section-heading h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 650;
    color: var(--color-text);
  }

  .section-heading p {
    margin: 0.125rem 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .section-count {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .focused-scout-return {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .back-to-scouts-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4375rem 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--text-base-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .back-to-scouts-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.06);
  }

  .scouts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.625rem;
    align-items: start;
  }

  .focused-scout-layout {
    display: grid;
    grid-template-columns: minmax(420px, 760px) minmax(280px, 1fr);
    gap: 0.75rem;
    align-items: start;
  }

  .scouts-grid-focused {
    grid-template-columns: 1fr;
  }

  .inbox-toolbar {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) auto;
    gap: 0.625rem;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .inbox-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text-muted);
  }

  .inbox-search:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.12);
  }

  .inbox-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-base-sm);
  }

  .inbox-search input::placeholder {
    color: var(--color-text-light);
  }

  .search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
  }

  .search-clear:hover {
    color: var(--color-text);
    background: var(--color-surface-muted);
  }

  .date-filter-compact {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-light);
  }

  .date-filter-compact input {
    min-width: 8.75rem;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    font-size: var(--text-base-sm);
    font-family: var(--font-body);
  }

  .date-filter-compact input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.12);
  }

  .inbox-action-row {
    display: flex;
    align-items: center;
    min-height: 1.875rem;
    gap: 0.625rem;
    padding: 0 0.125rem;
    font-size: var(--text-sm);
  }

  @media (max-width: 860px) {
    .focused-scout-layout {
      grid-template-columns: 1fr;
    }

    .inbox-toolbar {
      grid-template-columns: 1fr;
    }

    .date-filter-compact {
      flex-wrap: wrap;
    }
  }

  .empty-inline {
    padding: var(--spacing-lg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: var(--text-base-sm);
    text-align: center;
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
