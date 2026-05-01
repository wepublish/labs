<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PanelFilterBar from '../components/ui/PanelFilterBar.svelte';
  import DraftList from '../components/compose/DraftList.svelte';
  import DraftSlideOver from '../components/compose/DraftSlideOver.svelte';
  import { bajourDrafts } from '../bajour/store';
  import { bajourApi } from '../bajour/api';
  import { getActiveVillages, loadPilotVillages, pilotVillages } from '../lib/villages';
  import { Loading } from '@shared/components';
  import { EmptyState } from '../components/ui/primitives';
  import { FileText } from 'lucide-svelte';
  import { displayStatus } from '../bajour/utils';
  import type { BajourDraft, VerificationStatus } from '../bajour/types';

  let selectedLocation = $state<string | null>(null);
  let selectedStatus = $state<string | null>(null);
  let searchQuery = $state('');
  let dateFrom = $state('');
  let dateTo = $state('');
  let activeDraft = $state<BajourDraft | null>(null);
  let slideOverOpen = $state(false);
  let adminError = $state('');

  onMount(() => {
    loadPilotVillages();
    bajourDrafts.load().then(() => {
      bajourDrafts.startPolling();
    });

    const params = new URLSearchParams(window.location.search);
    const adminDraftId = params.get('draft');
    const adminSig = params.get('sig');
    const adminExp = params.get('exp');
    if (adminDraftId && adminSig && adminExp) {
      bajourApi
        .getDraftAdmin(adminDraftId, adminSig, adminExp)
        .then((draft) => {
          activeDraft = draft;
          slideOverOpen = true;
        })
        .catch((err) => {
          adminError = `Entwurf konnte nicht geladen werden: ${(err as Error).message}`;
        });
    }
  });

  onDestroy(() => {
    bajourDrafts.stopPolling();
  });

  let activeVillages = $derived(getActiveVillages($pilotVillages));

  function villageIsActive(name: string): boolean {
    return activeVillages.some((village) => village.name === name || village.id === name);
  }

  function villageMatchesSelection(name: string, selected: string | null): boolean {
    if (!selected) return true;
    const selectedVillage = activeVillages.find((village) => village.name === selected || village.id === selected);
    if (!selectedVillage) return name === selected;
    return name === selectedVillage.name || name === selectedVillage.id;
  }

  $effect(() => {
    if (selectedLocation && !villageIsActive(selectedLocation)) {
      selectedLocation = null;
    }
  });

  let locationOptions = $derived((() => {
    const draftVillageNames = new Set($bajourDrafts.drafts.map((draft) => draft.village_name));
    const activeDraftVillages = activeVillages
      .filter((village) => draftVillageNames.has(village.name) || draftVillageNames.has(village.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (activeDraftVillages.length === 0) return [{ value: '', label: 'Keine Orte' }];
    return [
      { value: '', label: 'Alle Orte' },
      ...activeDraftVillages.map((village) => ({ value: village.name, label: village.name })),
    ];
  })());

  let statusOptions = $derived((() => {
    const statuses: Array<{ value: VerificationStatus; label: string }> = [
      { value: 'ausstehend', label: 'Ausstehend' },
      { value: 'bestätigt', label: 'Bestätigt' },
      { value: 'abgelehnt', label: 'Abgelehnt' },
    ];
    return [
      { value: '', label: 'Alle Status' },
      ...statuses,
    ];
  })());

  let filteredDrafts = $derived(
    $bajourDrafts.drafts
      .filter((draft) => villageIsActive(draft.village_name))
      .filter((draft) => villageMatchesSelection(draft.village_name, selectedLocation))
      .filter((draft) => !selectedStatus || displayStatus(draft) === selectedStatus)
      .filter((draft) => !dateFrom || draft.publication_date >= dateFrom)
      .filter((draft) => !dateTo || draft.publication_date <= dateTo)
      .filter((draft) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return [
          draft.village_name,
          draft.title ?? '',
          draft.body,
          draft.publication_date,
        ].some((value) => value.toLowerCase().includes(query));
      })
  );

  function handleSelectDraft(draft: BajourDraft) {
    activeDraft = draft;
    slideOverOpen = true;
  }

  function handleCloseSlideOver() {
    slideOverOpen = false;
    activeDraft = null;
  }

  function handleRegenerateSavedDraft(_customPrompt: string | null) {
    // Saved drafts are viewed from this panel; regeneration starts from a unit selection in Scouts.
  }
</script>

<h1 class="visually-hidden">Entwürfe</h1>

<div class="drafts-panel">
  <PanelFilterBar
    {locationOptions}
    topicOptions={statusOptions}
    selectedLocation={selectedLocation}
    selectedTopic={selectedStatus}
    onLocationChange={(v) => { selectedLocation = v; }}
    onTopicChange={(v) => { selectedStatus = v; }}
    showSearch={true}
    {searchQuery}
    searchPlaceholder="Entwürfe suchen..."
    onSearch={(query) => { searchQuery = query; }}
    {dateFrom}
    {dateTo}
    onDateChange={(from, to) => { dateFrom = from; dateTo = to; }}
    loading={$bajourDrafts.loading}
  />

  <div class="drafts-content">
    <div class="drafts-heading">
      <div>
        <h2>Entwürfe</h2>
        <p>Alle gespeicherten Dorfkönig-Entwürfe.</p>
      </div>
      <span>{filteredDrafts.length} Entwürfe</span>
    </div>

    {#if adminError}
      <div class="error-message" aria-live="polite">{adminError}</div>
    {/if}

    {#if $bajourDrafts.loading && $bajourDrafts.drafts.length === 0}
      <Loading label="Entwürfe laden..." />
    {:else if $bajourDrafts.error}
      <div class="error-message" aria-live="polite">{$bajourDrafts.error}</div>
    {:else if filteredDrafts.length === 0}
      <EmptyState
        icon={FileText}
        title="Keine Entwürfe"
        description="Es wurden keine Entwürfe für die aktuellen Filter gefunden."
      />
    {:else}
      <div class="draft-list-shell">
        <DraftList
          drafts={filteredDrafts}
          activeDraftId={activeDraft?.id ?? null}
          onselect={handleSelectDraft}
        />
      </div>
    {/if}
  </div>
</div>

<DraftSlideOver
  open={slideOverOpen}
  draft={null}
  isGenerating={false}
  generationError={null}
  selectedCount={activeDraft?.selected_unit_ids.length ?? 0}
  customPrompt={activeDraft?.custom_system_prompt ?? null}
  initialSavedDraft={activeDraft}
  onClose={handleCloseSlideOver}
  onRetry={() => {}}
  onRegenerate={handleRegenerateSavedDraft}
/>

<style>
  .drafts-panel {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    background: var(--color-background);
  }

  .drafts-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .drafts-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .drafts-heading h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 650;
    color: var(--color-text);
  }

  .drafts-heading p {
    margin: 0.125rem 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .drafts-heading span {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .draft-list-shell {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface);
  }
</style>
