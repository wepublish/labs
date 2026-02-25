<script lang="ts">
  import { X, FileEdit, ChevronDown, ChevronUp, Send, RefreshCw, CheckCircle } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import { bajourApi } from '../api';
  import { bajourDrafts } from '../store';
  import type { Village, BajourDraft, BajourDraftGenerated } from '../types';
  import ProgressIndicator from '../../components/ui/ProgressIndicator.svelte';
  import VillageSelect from './VillageSelect.svelte';
  import DraftList from './DraftList.svelte';
  import DraftPreview from './DraftPreview.svelte';
  import VerificationBadge from './VerificationBadge.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  // Village → Scout ID mapping
  const VILLAGE_SCOUT_IDS: Record<string, string> = {
    riehen: 'ba000000-0001-4000-a000-000000000001',
    bettingen: 'ba000000-0002-4000-a000-000000000002',
    allschwil: 'ba000000-0003-4000-a000-000000000003',
    binningen: 'ba000000-0004-4000-a000-000000000004',
    arlesheim: 'ba000000-0005-4000-a000-000000000005',
    muttenz: 'ba000000-0006-4000-a000-000000000006',
    muenchenstein: 'ba000000-0007-4000-a000-000000000007',
    reinach: 'ba000000-0008-4000-a000-000000000008',
    oberwil: 'ba000000-0009-4000-a000-000000000009',
    birsfelden: 'ba000000-000a-4000-a000-00000000000a',
  };

  // localStorage helpers for custom prompt (7-day TTL)
  const PROMPT_KEY = 'dk_bajour_draft_prompt';
  const PROMPT_TTL = 7 * 24 * 60 * 60 * 1000;

  function loadSavedPrompt(): string {
    try {
      const saved = localStorage.getItem(PROMPT_KEY);
      if (!saved) return '';
      const { value, timestamp } = JSON.parse(saved);
      if (Date.now() - timestamp > PROMPT_TTL) {
        localStorage.removeItem(PROMPT_KEY);
        return '';
      }
      return value || '';
    } catch {
      return '';
    }
  }

  function savePrompt(value: string) {
    if (value.trim()) {
      localStorage.setItem(PROMPT_KEY, JSON.stringify({ value, timestamp: Date.now() }));
    } else {
      localStorage.removeItem(PROMPT_KEY);
    }
  }

  // State machine: 6 steps
  let step = $state<0 | 1 | 2 | 3 | 4 | 5>(0);

  // State variables
  let selectedVillage = $state<Village | null>(null);
  let selectedUnitIds = $state<string[]>([]);
  let generatedDraft = $state<BajourDraftGenerated | null>(null);
  let customPrompt = $state('');
  let showPromptEditor = $state(false);
  let loading = $state(false);
  let error = $state('');
  let progress = $state(0);
  let existingDraft = $state<BajourDraft | null>(null);

  // Derive the subtitle based on step
  let subtitle = $derived(
    step === 0 ? 'Übersicht' :
    step === 1 ? 'Gemeinde wählen' :
    step === 2 ? 'Informationen auswählen' :
    step === 3 ? 'Entwurf generieren' :
    step === 4 ? 'Vorschau' :
    'Gesendet'
  );

  // Load drafts and start polling when modal opens
  $effect(() => {
    if (open) {
      bajourDrafts.load();
      bajourDrafts.startPolling();
      customPrompt = loadSavedPrompt();
    }

    return () => {
      bajourDrafts.stopPolling();
    };
  });

  // Progress simulation
  function simulateProgress(): () => void {
    progress = 0;
    const steps = [
      { target: 30, delay: 300 },
      { target: 60, delay: 1500 },
      { target: 85, delay: 3000 },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const s of steps) {
      timers.push(setTimeout(() => { if (loading) progress = s.target; }, s.delay));
    }
    return () => timers.forEach(clearTimeout);
  }

  // Close and reset
  function handleClose() {
    bajourDrafts.stopPolling();
    step = 0;
    selectedVillage = null;
    selectedUnitIds = [];
    generatedDraft = null;
    customPrompt = loadSavedPrompt();
    showPromptEditor = false;
    loading = false;
    error = '';
    progress = 0;
    existingDraft = null;
    onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  // Step 0 handlers
  function handleCreateNew() {
    existingDraft = null;
    step = 1;
  }

  function handleSelectExisting(draft: BajourDraft) {
    existingDraft = draft;
    step = 4;
  }

  // Step 1 → Step 2: Select units
  async function handleSelectUnits() {
    if (!selectedVillage) return;

    const scoutId = VILLAGE_SCOUT_IDS[selectedVillage.id];
    if (!scoutId) {
      error = `Kein Scout für ${selectedVillage.name} konfiguriert.`;
      return;
    }

    loading = true;
    error = '';
    step = 2;
    const stopProgress = simulateProgress();

    try {
      const result = await bajourApi.selectUnits({
        village_id: selectedVillage.id,
        scout_id: scoutId,
      });
      progress = 100;
      selectedUnitIds = result.selected_unit_ids;
      step = 3;
    } catch (err) {
      error = (err as Error).message;
      progress = 100;
    } finally {
      loading = false;
      stopProgress();
    }
  }

  // Step 3: Generate draft
  async function handleGenerateDraft() {
    if (!selectedVillage || selectedUnitIds.length === 0) return;

    loading = true;
    error = '';
    progress = 0;
    const stopProgress = simulateProgress();

    try {
      const result = await bajourApi.generateDraft({
        village_id: selectedVillage.id,
        village_name: selectedVillage.name,
        unit_ids: selectedUnitIds,
        custom_system_prompt: customPrompt.trim() || undefined,
      });
      progress = 100;
      generatedDraft = result;
      existingDraft = null;
      savePrompt(customPrompt);
      step = 4;
    } catch (err) {
      error = (err as Error).message;
      progress = 100;
    } finally {
      loading = false;
      stopProgress();
    }
  }

  // Step 4: Send verification
  async function handleSend() {
    if (!selectedVillage || !generatedDraft) return;

    loading = true;
    error = '';

    try {
      // Serialize the generated draft into a body string
      const bodyParts: string[] = [];
      if (generatedDraft.greeting) bodyParts.push(generatedDraft.greeting);
      for (const section of generatedDraft.sections) {
        bodyParts.push(`## ${section.heading}\n${section.body}`);
      }
      if (generatedDraft.outlook) bodyParts.push(generatedDraft.outlook);
      if (generatedDraft.sign_off) bodyParts.push(generatedDraft.sign_off);

      const draft = await bajourDrafts.create({
        village_id: selectedVillage.id,
        village_name: selectedVillage.name,
        title: generatedDraft.title,
        body: bodyParts.join('\n\n'),
        selected_unit_ids: selectedUnitIds,
        custom_system_prompt: customPrompt.trim() || null,
      });

      await bajourDrafts.sendVerification(draft.id);
      step = 5;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  // Step 4: Regenerate
  function handleRegenerate() {
    generatedDraft = null;
    error = '';
    step = 3;
  }

  // Step 2: Retry after error
  function handleRetrySelectUnits() {
    error = '';
    handleSelectUnits();
  }

  // Step 3: Retry after error
  function handleRetryGenerate() {
    error = '';
    handleGenerateDraft();
  }

  // Navigation: back to list
  function handleBackToList() {
    existingDraft = null;
    error = '';
    step = 0;
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Entwürfe"
    tabindex="-1"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div class="modal-card">

      <!-- Header -->
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-icon">
            <FileEdit size={20} />
          </div>
          <div>
            <h2 class="modal-title">Entwürfe</h2>
            <p class="modal-subtitle">{subtitle}</p>
          </div>
        </div>
        <button class="modal-close" onclick={handleClose} aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>

      <!-- Step 0: Draft List -->
      {#if step === 0}
        <div class="modal-body">
          <DraftList
            drafts={$bajourDrafts.drafts}
            onselect={handleSelectExisting}
            oncreate={handleCreateNew}
          />
        </div>

      <!-- Step 1: Village Select -->
      {:else if step === 1}
        <div class="modal-body">
          <VillageSelect
            selectedVillageId={selectedVillage?.id ?? null}
            onselect={(village) => { selectedVillage = village; }}
          />
        </div>

        <div class="modal-footer">
          <Button variant="ghost" onclick={handleBackToList}>Zurück</Button>
          <Button onclick={handleSelectUnits} disabled={!selectedVillage}>Weiter</Button>
        </div>

      <!-- Step 2: Selecting Units (Progress) -->
      {:else if step === 2}
        <div class="modal-body">
          {#if error}
            <ProgressIndicator
              state="error"
              progress={100}
              errorTitle="Fehler bei der Auswahl"
              errorMessage={error}
            />
          {:else}
            <ProgressIndicator
              state="loading"
              progress={progress}
              message="KI wählt relevante Informationen..."
              hintText="Informationseinheiten werden analysiert"
            />
          {/if}
        </div>

        {#if error}
          <div class="modal-footer">
            <Button variant="ghost" onclick={handleBackToList}>Zurück</Button>
            <Button onclick={handleRetrySelectUnits}>Erneut versuchen</Button>
          </div>
        {/if}

      <!-- Step 3: Generating Draft (Progress + optional prompt editor) -->
      {:else if step === 3}
        <div class="modal-body">
          {#if loading}
            <ProgressIndicator
              state="loading"
              progress={progress}
              message="Entwurf wird erstellt..."
              hintText="Der Text wird generiert"
            />
          {:else if error}
            <ProgressIndicator
              state="error"
              progress={100}
              errorTitle="Fehler bei der Generierung"
              errorMessage={error}
            />
          {/if}

          <!-- Collapsible prompt editor -->
          <div class="prompt-section">
            <button class="prompt-toggle" onclick={() => { showPromptEditor = !showPromptEditor; }}>
              {#if showPromptEditor}
                <ChevronUp size={14} />
              {:else}
                <ChevronDown size={14} />
              {/if}
              <span>Eigene Anweisungen (optional)</span>
            </button>

            {#if showPromptEditor}
              <div class="prompt-editor">
                <textarea
                  bind:value={customPrompt}
                  placeholder="z.B. Schreibe in einem formellen Ton und erwähne besonders kulturelle Veranstaltungen."
                  rows="3"
                  disabled={loading}
                ></textarea>
              </div>
            {/if}
          </div>
        </div>

        <div class="modal-footer">
          <Button variant="ghost" onclick={handleBackToList}>Zurück</Button>
          {#if error}
            <Button onclick={handleRetryGenerate}>Erneut versuchen</Button>
          {:else if !loading}
            <Button onclick={handleGenerateDraft}>Generieren</Button>
          {/if}
        </div>

      <!-- Step 4: Preview (generated draft or existing draft) -->
      {:else if step === 4}
        <div class="modal-body">
          {#if error}
            <div class="error-message">{error}</div>
          {/if}

          {#if existingDraft}
            <!-- Existing draft: show flat body + verification status -->
            <div class="existing-draft-header">
              <VerificationBadge status={existingDraft.verification_status} />
              {#if existingDraft.title}
                <h3 class="existing-draft-title">{existingDraft.title}</h3>
              {/if}
              <span class="existing-draft-village">{existingDraft.village_name}</span>
            </div>
            <div class="existing-draft-body">
              {#each existingDraft.body.split('\n') as line}
                {#if line.trim()}
                  <p>{line}</p>
                {:else}
                  <br />
                {/if}
              {/each}
            </div>
          {:else if generatedDraft}
            <DraftPreview draft={generatedDraft} />
          {/if}
        </div>

        <div class="modal-footer">
          {#if existingDraft}
            <Button variant="ghost" onclick={handleBackToList}>Zurück</Button>
          {:else}
            <Button variant="ghost" onclick={handleRegenerate} disabled={loading}>
              <RefreshCw size={14} />
              Neu generieren
            </Button>
            <Button onclick={handleSend} loading={loading} disabled={!generatedDraft}>
              <Send size={14} />
              An Dorfkönige senden
            </Button>
          {/if}
        </div>

      <!-- Step 5: Confirmation -->
      {:else if step === 5}
        <div class="modal-body">
          <div class="confirmation">
            <div class="confirmation-icon">
              <CheckCircle size={40} />
            </div>
            <h3 class="confirmation-title">Entwurf gesendet</h3>
            <p class="confirmation-message">
              Entwurf wurde an die Dorfkönige gesendet. Die Verifizierung läuft.
            </p>
          </div>
        </div>

        <div class="modal-footer">
          <Button onclick={handleClose}>Schliessen</Button>
        </div>
      {/if}

    </div>
  </div>
{/if}

<style>
  /* Modal base — same as ScoutModal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    position: relative;
    width: 100%;
    max-width: 32rem;
    margin: 1rem;
    background: var(--color-surface, white);
    border-radius: var(--radius-lg, 1rem);
    border: 1px solid var(--color-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-surface, white);
    z-index: 1;
    border-radius: var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0;
  }

  .modal-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .modal-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.625rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
  }

  .modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .modal-subtitle {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .modal-close:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
  }

  /* Error message */
  .error-message {
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
  }

  /* Prompt editor */
  .prompt-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .prompt-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: color 0.15s;
  }

  .prompt-toggle:hover {
    color: var(--color-text);
  }

  .prompt-editor textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
    resize: vertical;
  }

  .prompt-editor textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .prompt-editor textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Existing draft view */
  .existing-draft-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    align-items: flex-start;
  }

  .existing-draft-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text, #111827);
    margin: 0;
  }

  .existing-draft-village {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
  }

  .existing-draft-body {
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    line-height: 1.6;
  }

  .existing-draft-body p {
    margin: 0 0 0.375rem 0;
  }

  .existing-draft-body br {
    display: block;
    content: '';
    margin-top: 0.25rem;
  }

  /* Confirmation */
  .confirmation {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    text-align: center;
  }

  .confirmation-icon {
    color: #059669;
  }

  .confirmation-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text, #111827);
    margin: 0;
  }

  .confirmation-message {
    font-size: 0.875rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0;
    line-height: 1.5;
  }
</style>
