<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { FileText } from 'lucide-svelte';
  import { bajourDrafts } from '../store';
  import type { Village, BajourDraft, BajourDraftGenerated } from '../types';
  import StepIndicator from './StepIndicator.svelte';
  import DraftsSidebar from './DraftsSidebar.svelte';
  import StepVillageSelect from './StepVillageSelect.svelte';
  import StepGenerate from './StepGenerate.svelte';
  import StepPreviewSend from './StepPreviewSend.svelte';

  const STEPS = [
    { label: 'Dorf wählen', subtitle: 'Gemeinde & Optionen' },
    { label: 'Generieren', subtitle: 'KI-Entwurf erstellen' },
    { label: 'Vorschau & Senden', subtitle: 'Prüfen & versenden' },
  ];

  const SELECTION_PROMPT_KEY = 'dk_bajour_selection_prompt';
  const GENERATION_PROMPT_KEY = 'dk_bajour_generation_prompt';

  function savePrompt(key: string, value: string) {
    if (value.trim()) {
      localStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
    } else {
      localStorage.removeItem(key);
    }
  }

  let currentStep = $state<0 | 1 | 2>(0);
  let sidebarOpen = $state(false);
  let selectedVillage = $state<Village | null>(null);
  let selectedUnitIds = $state<string[]>([]);
  let generatedDraft = $state<BajourDraftGenerated | null>(null);
  let selectionPrompt = $state('');
  let generationPrompt = $state('');
  let recencyDays = $state(3);
  let existingDraft = $state<BajourDraft | null>(null);

  // Track direction for slide transitions
  let direction = $state<'forward' | 'back'>('forward');

  let draftCount = $derived($bajourDrafts.drafts.length);

  // Load drafts and start polling on mount
  bajourDrafts.load();
  bajourDrafts.startPolling();

  onDestroy(() => {
    bajourDrafts.stopPolling();
  });

  // Step 0 → Step 1: Village selected, start generation
  function handleVillageSubmit(village: Village, selPrompt: string, genPrompt: string, days: number) {
    selectedVillage = village;
    selectionPrompt = selPrompt;
    generationPrompt = genPrompt;
    recencyDays = days;
    savePrompt(SELECTION_PROMPT_KEY, selPrompt);
    savePrompt(GENERATION_PROMPT_KEY, genPrompt);
    existingDraft = null;
    generatedDraft = null;
    selectedUnitIds = [];
    direction = 'forward';
    currentStep = 1;
  }

  // Step 1 → Step 2: Generation complete
  function handleGenerateComplete(draft: BajourDraftGenerated, unitIds: string[]) {
    generatedDraft = draft;
    selectedUnitIds = unitIds;
    existingDraft = null;
    direction = 'forward';
    currentStep = 2;
  }

  // Step 1: Back to village select
  function handleGenerateBack() {
    direction = 'back';
    currentStep = 0;
  }

  // Step 2: Regenerate (back to step 0)
  function handleRegenerate() {
    generatedDraft = null;
    existingDraft = null;
    direction = 'back';
    currentStep = 0;
  }

  // Sidebar: select existing draft → jump to step 2
  function handleSelectExisting(draft: BajourDraft) {
    existingDraft = draft;
    generatedDraft = null;
    sidebarOpen = false;
    direction = 'forward';
    currentStep = 2;
  }

</script>

<div class="draft-panel">
  <!-- Toggle button: top-right corner -->
  <button
    class="drafts-toggle"
    class:active={sidebarOpen}
    onclick={() => { sidebarOpen = !sidebarOpen; }}
    aria-label={sidebarOpen ? 'Entwürfe schliessen' : 'Entwürfe anzeigen'}
  >
    <FileText size={15} />
    <span>Entwürfe</span>
    {#if draftCount > 0}
      <span class="draft-count">{draftCount}</span>
    {/if}
  </button>

  <StepIndicator currentStep={currentStep} steps={STEPS} />

  <div class="step-content">
    {#key currentStep}
      <div
        class="step-content-inner"
        in:fly={{ x: direction === 'forward' ? 60 : -60, duration: 250, delay: 100 }}
        out:fly={{ x: direction === 'forward' ? -60 : 60, duration: 150 }}
      >
        {#if currentStep === 0}
          <StepVillageSelect
            initialVillageId={selectedVillage?.id}
            initialSelectionPrompt={selectionPrompt}
            initialGenerationPrompt={generationPrompt}
            initialRecencyDays={recencyDays}
            onsubmit={handleVillageSubmit}
          />
        {:else if currentStep === 1}
          {#if selectedVillage}
            <StepGenerate
              village={selectedVillage}
              {selectionPrompt}
              {generationPrompt}
              {recencyDays}
              oncomplete={handleGenerateComplete}
              onback={handleGenerateBack}
            />
          {/if}
        {:else if currentStep === 2}
          <StepPreviewSend
            {generatedDraft}
            {existingDraft}
            village={selectedVillage}
            {selectedUnitIds}
            generationPrompt={generationPrompt}
            onregenerate={handleRegenerate}
          />
        {/if}
      </div>
    {/key}
  </div>

  <!-- Right sidebar -->
  <DraftsSidebar
    open={sidebarOpen}
    drafts={$bajourDrafts.drafts}
    onselect={handleSelectExisting}
  />
</div>

<style>
  .draft-panel {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    height: 100%;
    overflow: hidden;
    background: var(--color-background, #f9fafb);
  }

  /* Top-right toggle button */
  .drafts-toggle {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm, 0.375rem);
    background: var(--color-surface, white);
    color: var(--color-text-muted, #6b7280);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .drafts-toggle:hover {
    color: var(--color-text, #111827);
    border-color: rgba(234, 114, 110, 0.4);
    background: rgba(234, 114, 110, 0.04);
  }

  .drafts-toggle.active {
    color: var(--color-primary-dark, #d45a56);
    border-color: var(--color-primary, #ea726e);
    background: rgba(234, 114, 110, 0.08);
  }

  .draft-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.3rem;
    border-radius: 9999px;
    background: var(--color-primary, #ea726e);
    color: white;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1;
  }

  .step-content {
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.5rem 2rem;
  }

  .step-content-inner {
    max-width: 640px;
  }

  @media (max-width: 768px) {
    .draft-panel {
      grid-template-columns: auto 1fr;
      grid-template-rows: auto 1fr;
    }

    .step-content {
      grid-column: 1 / -1;
      padding: 1rem;
    }
  }
</style>
