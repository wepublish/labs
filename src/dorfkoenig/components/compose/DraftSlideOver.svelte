<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { X, AlertCircle, RefreshCw, PenTool, RotateCcw, ChevronDown, ChevronUp, Download } from 'lucide-svelte';
  import ProgressIndicator from '../ui/ProgressIndicator.svelte';
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

  function startProgressSimulation() {
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

  function stopProgressSimulation(success: boolean) {
    stopProgressInterval();
    if (success) {
      generateProgress = 100;
      generateProgressState = 'success';
    } else {
      generateProgressState = 'error';
    }
  }

  function stopProgressInterval() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  // Track previous isGenerating value for edge detection
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

  const DEFAULT_PROMPT = `SCHREIBRICHTLINIEN:
- Beginne JEDEN Abschnitt mit der wichtigsten Tatsache
- Fette **wichtige Zahlen, Namen, Daten**
- Sätze: KURZ und PRÄGNANT. Max 15-20 Wörter.
- Zitiere Quellen inline [quelle.ch]
- Füge eine "gaps"-Liste hinzu: was fehlt, wen interviewen`;

  function saveAndRegenerate() {
    const prompt = regenPrompt.trim() || null;
    onRegenerate(prompt);
  }

  function resetRegenPrompt() {
    regenPrompt = '';
  }

  function handleKeydown(e: KeyboardEvent) {
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
      <div class="regen-drawer">
        <textarea
          class="prompt-textarea"
          bind:value={regenPrompt}
          placeholder={DEFAULT_PROMPT}
          rows="5"
        ></textarea>
        <div class="regen-actions">
          <button class="reset-button" onclick={resetRegenPrompt} type="button">
            <RotateCcw size={12} />
            Zurücksetzen
          </button>
          <button class="regen-btn" onclick={saveAndRegenerate}>
            <RefreshCw size={14} />
            Neu generieren
          </button>
        </div>
      </div>
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
        <article class="document-content">
          <h1>{draft.title}</h1>
          <p class="lede">{draft.headline}</p>

          {#if draft.sections && draft.sections.length > 0}
            {#each draft.sections as section}
              <section class="draft-section">
                <h2>{section.heading}</h2>
                <p>{section.content}</p>
              </section>
            {/each}
          {/if}

          {#if draft.gaps && draft.gaps.length > 0}
            <section class="gaps-section">
              <h2>Informationslücken</h2>
              <ul>
                {#each draft.gaps as gap}
                  <li>{gap}</li>
                {/each}
              </ul>
            </section>
          {/if}

          {#if draft.sources && draft.sources.length > 0}
            <section class="sources-section">
              <h2>Quellen</h2>
              <ul class="source-list">
                {#each draft.sources as source, i}
                  <li>
                    <span class="source-num">{i + 1}</span>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title || source.domain}
                    </a>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </article>
      {/if}
    </div>
  </div>
{/if}

<style>
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=DM+Sans:wght@400;500;600&display=swap');

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

  .regen-drawer {
    padding: 1rem 1.5rem;
    background: var(--color-background, #f9fafb);
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    flex-shrink: 0;
  }

  .prompt-textarea {
    width: 100%;
    padding: 0.625rem;
    font-size: 0.75rem;
    line-height: 1.5;
    font-family: 'Monaco', 'Menlo', monospace;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    background: white;
    resize: vertical;
    min-height: 80px;
    margin-bottom: 0.75rem;
    box-sizing: border-box;
  }

  .prompt-textarea:focus {
    outline: none;
    border-color: var(--color-primary, #ea726e);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.1);
  }

  .regen-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .reset-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-text-muted, #6b7280);
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    cursor: pointer;
  }

  .reset-button:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
  }

  .regen-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: white;
    background: linear-gradient(135deg, var(--color-primary, #ea726e) 0%, var(--color-primary-dark, #d45a56) 100%);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(234, 114, 110, 0.3);
  }

  .regen-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(234, 114, 110, 0.35);
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

  /* Article content */
  .document-content {
    padding: 2rem 2.5rem;
    font-family: 'Source Serif 4', Georgia, serif;
  }

  .document-content h1 {
    font-size: 1.625rem;
    font-weight: 700;
    line-height: 1.25;
    color: #111827;
    margin: 0 0 1rem 0;
  }

  .document-content .lede {
    font-size: 1.125rem;
    font-style: italic;
    color: #4b5563;
    line-height: 1.6;
    margin: 0 0 2rem 0;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .document-content h2 {
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted, #6b7280);
    margin: 0 0 0.75rem 0;
  }

  .draft-section {
    margin-bottom: 1.5rem;
  }

  .draft-section h2 {
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
    color: var(--color-text, #374151);
    margin: 0 0 0.5rem 0;
  }

  .draft-section p {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--color-text, #374151);
    margin: 0;
  }

  .gaps-section {
    margin-bottom: 2rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-left: 3px solid #d1d5db;
    border-radius: 6px;
  }

  .gaps-section ul { margin: 0; padding: 0; list-style: none; }

  .gaps-section li {
    padding-left: 0.75rem;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: #4b5563;
    margin-bottom: 0.5rem;
  }

  .sources-section {
    padding-top: 1.5rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .source-list { margin: 0; padding: 0; list-style: none; }

  .source-list li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.6;
    margin-bottom: 0.375rem;
  }

  .source-num {
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .source-list a {
    color: var(--color-primary, #ea726e);
    text-decoration: none;
  }

  .source-list a:hover { text-decoration: underline; }

  @media (max-width: 768px) {
    .slide-over {
      width: 100%;
      min-width: unset;
    }
  }
</style>
