<script lang="ts">
  // Step 1: village picker with optional advanced settings (selection/generation prompts, recency).
  import { ChevronDown, ChevronUp } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import { CUSTOM_PROMPT_TTL_MS } from '../../lib/constants';
  import VillageSelect from './VillageSelect.svelte';
  import type { Village } from '../types';

  interface Props {
    initialVillageId?: string | null;
    initialSelectionPrompt?: string;
    initialGenerationPrompt?: string;
    initialRecencyDays?: number;
    onsubmit: (village: Village, selectionPrompt: string, generationPrompt: string, recencyDays: number) => void;
  }

  let {
    initialVillageId = null,
    initialSelectionPrompt = '',
    initialGenerationPrompt = '',
    initialRecencyDays = 3,
    onsubmit,
  }: Props = $props();

  // localStorage helpers for prompts (7-day TTL)
  const SELECTION_PROMPT_KEY = 'dk_bajour_selection_prompt';
  const GENERATION_PROMPT_KEY = 'dk_bajour_generation_prompt';
  const PROMPT_TTL = CUSTOM_PROMPT_TTL_MS;

  function loadSavedPrompt(key: string): string {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return '';
      const { value, timestamp } = JSON.parse(saved);
      if (Date.now() - timestamp > PROMPT_TTL) {
        localStorage.removeItem(key);
        return '';
      }
      return value || '';
    } catch {
      return '';
    }
  }

  function getInitialSelectionPrompt(): string {
    return initialSelectionPrompt || loadSavedPrompt(SELECTION_PROMPT_KEY);
  }

  function getInitialGenerationPrompt(): string {
    return initialGenerationPrompt || loadSavedPrompt(GENERATION_PROMPT_KEY);
  }

  function getInitialRecencyDays(): number {
    return initialRecencyDays;
  }

  const resolvedSelectionPrompt = getInitialSelectionPrompt();
  const resolvedGenerationPrompt = getInitialGenerationPrompt();
  const resolvedRecencyDays = getInitialRecencyDays();

  let selectedVillage = $state<Village | null>(null);
  let selectionPrompt = $state(resolvedSelectionPrompt);
  let generationPrompt = $state(resolvedGenerationPrompt);
  let recencyDays = $state(resolvedRecencyDays);
  let showSelectionPrompt = $state(resolvedSelectionPrompt.length > 0);
  let showGenerationPrompt = $state(resolvedGenerationPrompt.length > 0);

  let recencyLabel = $derived(
    recencyDays === 1 ? '1 Tag' : `${recencyDays} Tage`
  );

  function handleSubmit() {
    if (!selectedVillage) return;
    onsubmit(selectedVillage, selectionPrompt, generationPrompt, recencyDays);
  }
</script>

<div class="step-village-select">
  <VillageSelect
    selectedVillageId={selectedVillage?.id ?? initialVillageId}
    onselect={(village) => { selectedVillage = village; }}
  />

  <!-- Recency slider -->
  <div class="recency-section">
    <label class="recency-label" for="recency-slider">
      Zeitraum
      <span class="recency-value">{recencyLabel}</span>
    </label>
    <div class="recency-slider-row">
      <span class="recency-bound">1T</span>
      <input
        id="recency-slider"
        type="range"
        min="1"
        max="7"
        step="1"
        bind:value={recencyDays}
        class="recency-slider"
      />
      <span class="recency-bound">7T</span>
    </div>
    <p class="recency-hint">Nachrichten der letzten {recencyLabel} berücksichtigen</p>
  </div>

  <!-- Selection criteria prompt -->
  <div class="prompt-section">
    <button class="prompt-toggle" onclick={() => { showSelectionPrompt = !showSelectionPrompt; }}>
      {#if showSelectionPrompt}
        <ChevronUp size={14} />
      {:else}
        <ChevronDown size={14} />
      {/if}
      <span>Auswahlkriterien (optional)</span>
    </button>

    {#if showSelectionPrompt}
      <div class="prompt-editor">
        <textarea
          bind:value={selectionPrompt}
          placeholder="z.B. Bevorzuge kulturelle Veranstaltungen und Gemeindepolitik. Ignoriere Sportresultate."
          rows="2"
        ></textarea>
        <p class="prompt-hint">Beeinflusst, welche Nachrichten die KI auswählt</p>
      </div>
    {/if}
  </div>

  <!-- Generation style prompt -->
  <div class="prompt-section">
    <button class="prompt-toggle" onclick={() => { showGenerationPrompt = !showGenerationPrompt; }}>
      {#if showGenerationPrompt}
        <ChevronUp size={14} />
      {:else}
        <ChevronDown size={14} />
      {/if}
      <span>Schreibstil-Anweisungen (optional)</span>
    </button>

    {#if showGenerationPrompt}
      <div class="prompt-editor">
        <textarea
          bind:value={generationPrompt}
          placeholder="z.B. Schreibe in einem lockeren, humorvollen Ton. Verwende kurze Sätze."
          rows="2"
        ></textarea>
        <p class="prompt-hint">Beeinflusst, wie der Entwurf geschrieben wird</p>
      </div>
    {/if}
  </div>

  <div class="step-actions">
    <Button onclick={handleSubmit} disabled={!selectedVillage}>
      Generieren
    </Button>
  </div>
</div>

<style>
  .step-village-select {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Recency slider */
  .recency-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .recency-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .recency-value {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-primary);
  }

  .recency-slider-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .recency-bound {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-light);
    flex-shrink: 0;
    width: 1.25rem;
    text-align: center;
  }

  .recency-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      90deg,
      var(--color-primary) 0%,
      var(--color-primary) var(--fill, 33%),
      rgba(234, 114, 110, 0.12) var(--fill, 33%),
      rgba(234, 114, 110, 0.12) 100%
    );
    outline: none;
    cursor: pointer;
  }

  .recency-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--color-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    cursor: grab;
    transition: box-shadow var(--transition-base), transform var(--transition-base);
  }

  .recency-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 4px rgba(234, 114, 110, 0.1), 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .recency-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.1);
    box-shadow: 0 0 0 6px rgba(234, 114, 110, 0.12), 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .recency-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--color-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    cursor: grab;
  }

  .recency-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    font-style: italic;
  }

  /* Prompt sections */
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
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color var(--transition-base);
  }

  .prompt-toggle:hover {
    color: var(--color-text);
  }

  .prompt-editor {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .prompt-editor textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: var(--text-base);
    font-family: inherit;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    resize: vertical;
  }

  .prompt-editor textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .prompt-hint {
    font-size: var(--text-xs);
    color: var(--color-text-light);
    margin: 0;
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
