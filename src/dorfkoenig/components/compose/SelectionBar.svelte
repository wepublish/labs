<script lang="ts">
  import { slide } from 'svelte/transition';
  import {
    CheckSquare,
    Sparkles,
    Loader2,
    Settings2,
    ChevronUp,
    ChevronDown,
    PenTool,
    RotateCcw,
    Eye,
    Trash2,
  } from 'lucide-svelte';

  interface Props {
    selectedCount: number;
    isGenerating: boolean;
    customPrompt: string | null;
    hasDraft: boolean;
    showDraftSlideOver: boolean;
    onGenerate: () => void;
    onViewDraft: () => void;
    onPromptChange: (prompt: string | null) => void;
    onDelete?: () => void;
  }

  let {
    selectedCount,
    isGenerating,
    customPrompt,
    hasDraft,
    showDraftSlideOver,
    onGenerate,
    onViewDraft,
    onPromptChange,
    onDelete,
  }: Props = $props();

  const DEFAULT_PROMPT = `SCHREIBRICHTLINIEN:
- Beginne JEDEN Abschnitt mit der wichtigsten Tatsache
- Fette **wichtige Zahlen, Namen, Daten**
- Sätze: KURZ und PRÄGNANT. Max 15-20 Wörter.
- Zitiere Quellen inline [quelle.ch]
- Füge eine "gaps"-Liste hinzu: was fehlt, wen interviewen`;

  let showPromptEditor = $state(false);
  let editedPrompt = $state(customPrompt || '');

  function savePrompt() {
    onPromptChange(editedPrompt.trim() || null);
  }

  function resetPrompt() {
    editedPrompt = '';
    onPromptChange(null);
  }
</script>

<div class="selection-bar-wrapper">
  <!-- Prompt editor (collapsible above bar) -->
  {#if showPromptEditor}
    <div class="prompt-panel" transition:slide={{ duration: 200 }}>
      <label class="prompt-label">
        <PenTool size={12} />
        Schreibrichtlinien
      </label>
      <textarea
        class="prompt-textarea"
        bind:value={editedPrompt}
        onblur={savePrompt}
        placeholder={DEFAULT_PROMPT}
        rows="6"
      ></textarea>
      <button class="reset-button" onclick={resetPrompt} type="button">
        <RotateCcw size={12} />
        Zurücksetzen
      </button>
    </div>
  {/if}

  <div class="bar">
    {#if selectedCount > 0}
      <span class="selection-count">
        <CheckSquare size={14} />
        {selectedCount} ausgewählt
      </span>
      <button class="delete-btn" onclick={onDelete} type="button">
        <Trash2 size={14} />
      </button>
    {/if}

    <button
      class="settings-btn"
      class:active={showPromptEditor}
      onclick={() => showPromptEditor = !showPromptEditor}
      type="button"
    >
      <Settings2 size={14} />
      {#if showPromptEditor}
        <ChevronDown size={12} />
      {:else}
        <ChevronUp size={12} />
      {/if}
    </button>

    {#if hasDraft && !showDraftSlideOver}
      <button class="view-draft-btn" onclick={onViewDraft}>
        <Eye size={14} />
        <span>Entwurf ansehen</span>
      </button>
    {/if}

    <button
      class="generate-btn"
      onclick={onGenerate}
      disabled={isGenerating || selectedCount === 0}
    >
      {#if isGenerating}
        <Loader2 size={16} class="spin" />
        <span>Wird erstellt...</span>
      {:else}
        <Sparkles size={16} />
        <span>Entwurf erstellen</span>
      {/if}
    </button>
  </div>
</div>

<style>
  .selection-bar-wrapper {
    position: fixed;
    bottom: 1.25rem;
    right: 2rem;
    z-index: var(--z-sticky);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .prompt-panel {
    width: 360px;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.10);
    margin-bottom: 0.5rem;
  }

  .prompt-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted, #6b7280);
    margin-bottom: 0.5rem;
  }

  .prompt-textarea {
    width: 100%;
    padding: 0.625rem;
    font-size: 0.75rem;
    line-height: 1.5;
    font-family: 'Monaco', 'Menlo', monospace;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    background: var(--color-background, #f9fafb);
    resize: vertical;
    min-height: 100px;
    margin-bottom: 0.5rem;
    box-sizing: border-box;
  }

  .prompt-textarea:focus {
    outline: none;
    border-color: var(--color-primary, #ea726e);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.1);
  }

  .prompt-textarea::placeholder {
    color: #9ca3af;
    font-size: 0.6875rem;
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
    transition: all 0.15s ease;
  }

  .reset-button:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.10);
  }

  .selection-count {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.625rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary, #ea726e);
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .delete-btn:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
  }

  .settings-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .settings-btn:hover {
    background: var(--color-background, #f3f4f6);
    color: var(--color-text, #374151);
  }

  .settings-btn.active {
    background: rgba(234, 114, 110, 0.1);
    border-color: rgba(234, 114, 110, 0.3);
    color: var(--color-primary, #ea726e);
  }

  .view-draft-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-primary, #ea726e);
    background: rgba(234, 114, 110, 0.1);
    border: 1px solid rgba(234, 114, 110, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .view-draft-btn:hover {
    background: rgba(234, 114, 110, 0.15);
    border-color: rgba(234, 114, 110, 0.4);
  }

  .generate-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, var(--color-primary, #ea726e) 0%, var(--color-primary-dark, #d45a56) 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
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

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
