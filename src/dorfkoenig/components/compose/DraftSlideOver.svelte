<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { X, AlertCircle, RefreshCw, PenTool, ChevronDown, ChevronUp, Download } from 'lucide-svelte';
  import ProgressIndicator from '../ui/ProgressIndicator.svelte';
  import DraftContent from './DraftContent.svelte';
  import DraftPromptEditor from './DraftPromptEditor.svelte';
  import type { Draft } from '../../lib/types';

  interface Props {
    open: boolean;
    draft: Draft | null;
    isGenerating: boolean;
    generationError: string | null;
    selectedCount: number;
    customPrompt: string | null;
    onClose: () => void;
    onRetry: () => void;
    onRegenerate: (customPrompt: string | null) => void;
  }

  let {
    open,
    draft,
    isGenerating,
    generationError,
    selectedCount,
    customPrompt: _customPrompt,
    onClose,
    onRetry,
    onRegenerate,
  }: Props = $props();

  let showRegenPrompt = $state(false);
  let regenPrompt = $state('');
  let generateProgress = $state(0);
  let generateProgressState = $state<'loading' | 'success' | 'error'>('loading');

  let progressInterval: ReturnType<typeof setInterval> | null = null;

  function startProgressSimulation(): void {
    stopProgressInterval();
    generateProgress = 0;
    generateProgressState = 'loading';
    progressInterval = setInterval(() => {
      if (generateProgress < 30) {
        generateProgress += Math.random() * 8 + 2;
      } else if (generateProgress < 60) {
        generateProgress += Math.random() * 4 + 1;
      } else if (generateProgress < 85) {
        generateProgress += Math.random() * 2 + 0.5;
      } else if (generateProgress < 90) {
        generateProgress += Math.random() * 0.5;
      }
      generateProgress = Math.min(generateProgress, 90);
    }, 500);
  }

  function stopProgressSimulation(success: boolean): void {
    stopProgressInterval();
    if (success) {
      generateProgress = 100;
      generateProgressState = 'success';
    } else {
      generateProgressState = 'error';
    }
  }

  function stopProgressInterval(): void {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  let wasGenerating = false;

  $effect(() => {
    if (isGenerating && !wasGenerating) {
      startProgressSimulation();
    } else if (!isGenerating && wasGenerating) {
      stopProgressSimulation(!generationError);
    }
    wasGenerating = isGenerating;
  });

  onDestroy(() => {
    stopProgressInterval();
  });

  function saveAndRegenerate(): void {
    const prompt = regenPrompt.trim() || null;
    onRegenerate(prompt);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div class="backdrop" transition:fade={{ duration: 200 }} onclick={onClose} role="presentation"></div>

  <!-- Panel -->
  <div class="slide-over" transition:fly={{ x: 400, duration: 300 }}>
    <!-- Header -->
    <div class="panel-header">
      <h2>Entwurf</h2>
      <div class="header-actions">
        {#if draft && !isGenerating && !generationError}
          <div class="action-group">
            <button
              class="header-action-btn regen-toggle-btn"
              class:active={showRegenPrompt}
              onclick={() => showRegenPrompt = !showRegenPrompt}
              type="button"
            >
              <PenTool size={12} />
              {#if showRegenPrompt}
                <ChevronUp size={12} />
              {:else}
                <ChevronDown size={12} />
              {/if}
            </button>
            <button class="header-action-btn export-btn" disabled>
              <Download size={12} />
              Export
            </button>
          </div>
        {/if}
        <button class="close-btn" onclick={onClose} aria-label="Panel schließen">
          <X size={20} />
        </button>
      </div>
    </div>

    <!-- Regen drawer (collapsible below header) -->
    {#if showRegenPrompt && draft}
      <DraftPromptEditor
        {regenPrompt}
        onpromptchange={(v) => { regenPrompt = v; }}
        onreset={() => { regenPrompt = ''; }}
        onregenerate={saveAndRegenerate}
      />
    {/if}

    <!-- Body -->
    <div class="panel-body">
      {#if isGenerating}
        <div class="progress-container">
          <ProgressIndicator
            progress={Math.round(generateProgress)}
            message="Entwurf wird erstellt..."
            state={generateProgressState}
            hintText={selectedCount !== 1
              ? `${selectedCount} Quellen werden analysiert...`
              : '1 Quelle wird analysiert...'}
          />
        </div>
      {:else if generationError}
        <div class="state-centered error">
          <AlertCircle size={24} />
          <h3>Erstellung fehlgeschlagen</h3>
          <p>{generationError}</p>
          <button class="retry-btn" onclick={onRetry}>
            <RefreshCw size={14} />
            Erneut versuchen
          </button>
        </div>
      {:else if draft}
        <DraftContent {draft} />
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: var(--z-modal);
  }

  .slide-over {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 65%;
    min-width: 500px;
    max-width: 900px;
    background: white;
    z-index: calc(var(--z-modal) + 1);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: white;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    flex-shrink: 0;
  }

  .panel-header h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text, #374151);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .action-group {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .header-action-btn {
    display: flex;
    align-items: center;
    height: 1.625rem;
    padding: 0 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .export-btn {
    gap: 0.375rem;
    color: var(--color-primary, #ea726e);
    border-color: rgba(234, 114, 110, 0.3);
  }

  .export-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .regen-toggle-btn {
    gap: 0.25rem;
    color: var(--color-text-muted, #6b7280);
  }

  .regen-toggle-btn:hover {
    background: var(--color-background, #f3f4f6);
    color: var(--color-text, #374151);
  }

  .regen-toggle-btn.active {
    background: rgba(234, 114, 110, 0.1);
    border-color: rgba(234, 114, 110, 0.3);
    color: var(--color-primary, #ea726e);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--color-background, #f3f4f6);
    color: var(--color-text, #374151);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
  }

  .state-centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    text-align: center;
    padding: 1.5rem;
  }

  .progress-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 300px;
    padding: 2rem 2.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .state-centered.error { color: #dc2626; }
  .state-centered.error h3 { color: #dc2626; margin-top: 0.75rem; font-size: 1rem; font-weight: 600; }
  .state-centered.error p { margin: 0.25rem 0 1rem 0; font-size: 0.875rem; color: var(--color-text-muted, #6b7280); }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    cursor: pointer;
  }

  .retry-btn:hover { background: #fee2e2; }

  @media (max-width: 768px) {
    .slide-over {
      width: 100%;
      min-width: unset;
    }
  }
</style>
