<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, Sparkles, MapPin, ArrowRight } from 'lucide-svelte';
  import type { Village } from '../../bajour/types';
  import { pilotVillages, isVillageActive } from '../../lib/villages';

  interface Props {
    loading: boolean;
    villages: Village[];
    prefilledLocation: string | null;
    onrun: (villageName: string, selectionPrompt: string) => void;
    onclose: () => void;
  }

  let { loading, villages, prefilledLocation, onrun, onclose }: Props = $props();

  // Steps: 'location' | 'options'
  let step = $state<'location' | 'options'>('location');
  let selectedVillage = $state<string | null>(null);
  let lastPrefilledLocation = $state<string | null>(null);

  let selectionPrompt = $state('');
  let dropdownEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (prefilledLocation === lastPrefilledLocation) return;

    lastPrefilledLocation = prefilledLocation;
    if (prefilledLocation) {
      selectedVillage = prefilledLocation;
      step = 'options';
    } else {
      selectedVillage = null;
      step = 'location';
    }
  });

  function handleSelectVillage(name: string) {
    selectedVillage = name;
    step = 'options';
  }

  function handleBack() {
    step = 'location';
  }

  function handleRun() {
    if (!selectedVillage) return;
    onrun(
      selectedVillage,
      selectionPrompt
    );
  }

  function handleReset() {
    selectionPrompt = '';
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
      onclose();
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });
</script>

<div class="ai-select-dropdown" bind:this={dropdownEl}>
  {#if step === 'location'}
    <!-- Step 1: Choose location -->
    <div class="step-header">
      <MapPin size={14} />
      <span>Ort auswählen</span>
    </div>
    <div class="village-grid">
      {#each villages as village}
        {@const active = isVillageActive(village.id, $pilotVillages)}
        <button
          class="village-btn"
          class:selected={selectedVillage === village.name}
          disabled={!active}
          title={active ? village.name : 'Nicht im Pilotprogramm'}
          onclick={() => active && handleSelectVillage(village.name)}
          type="button"
        >
          {village.name}
        </button>
      {/each}
    </div>
  {:else}
    <!-- Step 2: Time range + prompt -->
    <div class="step-header">
      <button class="back-link" onclick={handleBack} type="button">
        <MapPin size={12} />
        <span class="back-village">{selectedVillage}</span>
      </button>
      <ArrowRight size={12} />
      <span>Optionen</span>
    </div>

    <div class="recency-section-fixed">
      <span>Zeitraum</span>
      <strong>48h vor Erscheinung</strong>
    </div>

    <!-- Selection prompt -->
    <div class="prompt-section">
      <textarea
        class="prompt-textarea"
        bind:value={selectionPrompt}
        placeholder="z.B. Bevorzuge kulturelle Veranstaltungen..."
        rows="3"
      ></textarea>
    </div>

    <!-- Footer -->
    <div class="dropdown-footer">
      <button class="reset-link" onclick={handleReset} type="button">
        Zurücksetzen
      </button>
      <button
        class="run-btn"
        onclick={handleRun}
        disabled={loading}
      >
        {#if loading}
          <Loader2 size={14} class="spin" />
          <span>Läuft...</span>
        {:else}
          <Sparkles size={14} />
          <span>Generieren</span>
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .ai-select-dropdown {
    position: absolute;
    bottom: calc(100% + 0.625rem);
    right: 0;
    width: 380px;
    padding: var(--spacing-md) 1.25rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
    z-index: calc(var(--z-dropdown) + 1);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Step header */
  .step-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-base-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--text-base-sm);
    font-weight: 600;
    color: var(--color-primary);
    cursor: pointer;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .back-village {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Village grid */
  .village-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .village-btn {
    padding: 0.3125rem 0.75rem;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .village-btn:hover {
    border-color: rgba(234, 114, 110, 0.4);
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.04);
  }

  .village-btn.selected {
    border-color: var(--color-primary);
    color: white;
    background: var(--color-primary);
  }

  .village-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .village-btn:disabled:hover {
    border-color: var(--color-border);
    color: var(--color-text-muted);
    background: var(--color-background);
  }

  .recency-section-fixed {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .recency-section-fixed strong {
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .prompt-section {
    display: flex;
    flex-direction: column;
  }

  .prompt-textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: var(--text-sm);
    font-family: inherit;
    line-height: 1.5;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    resize: vertical;
    min-height: 60px;
    box-sizing: border-box;
  }

  .prompt-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.1);
  }

  .prompt-textarea::placeholder {
    color: var(--color-text-light);
  }

  .dropdown-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .reset-link {
    background: none;
    border: none;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .reset-link:hover {
    color: var(--color-text);
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--text-base-sm);
    font-weight: 600;
    color: white;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(234, 114, 110, 0.3);
    transition: all 0.2s ease;
  }

  .run-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(234, 114, 110, 0.35);
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

</style>
