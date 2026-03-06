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
  import { DEFAULT_PROMPT } from '../../lib/constants';

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

  let showPromptEditor = $state(false);
  let editedPrompt = $state('');

  // Keep editedPrompt in sync when parent updates customPrompt
  $effect(() => {
    editedPrompt = customPrompt || '';
  });

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
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md) 1.25rem;
    box-shadow: var(--shadow-lg);
    margin-bottom: var(--spacing-sm);
  }

  .prompt-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .prompt-textarea {
    width: 100%;
    padding: 0.625rem;
    font-size: var(--text-sm);
    line-height: 1.5;
    font-family: 'Monaco', 'Menlo', monospace;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    resize: vertical;
    min-height: 100px;
    margin-bottom: var(--spacing-sm);
    box-sizing: border-box;
  }

  .prompt-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.1);
  }

  .prompt-textarea::placeholder {
    color: var(--color-text-light);
    font-size: var(--text-xs);
  }

  .reset-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .reset-button:hover {
    background: var(--color-status-error-bg);
    border-color: var(--color-danger-light);
    color: var(--color-danger-dark);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem var(--spacing-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .selection-count {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.625rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .delete-btn:hover {
    background: var(--color-status-error-bg);
    border-color: var(--color-danger-light);
    color: var(--color-danger-dark);
  }

  .settings-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .settings-btn:hover {
    background: var(--color-background);
    color: var(--color-text);
  }

  .settings-btn.active {
    background: rgba(234, 114, 110, 0.1);
    border-color: rgba(234, 114, 110, 0.3);
    color: var(--color-primary);
  }

  .view-draft-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.1);
    border: 1px solid rgba(234, 114, 110, 0.3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .view-draft-btn:hover {
    background: rgba(234, 114, 110, 0.15);
    border-color: rgba(234, 114, 110, 0.4);
  }

  .generate-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-base-sm);
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

</style>
