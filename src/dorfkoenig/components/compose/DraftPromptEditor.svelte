<script lang="ts">
  import { RefreshCw, RotateCcw } from 'lucide-svelte';
  import { DEFAULT_PROMPT } from '../../lib/constants';

  interface Props {
    regenPrompt: string;
    onpromptchange: (prompt: string) => void;
    onreset: () => void;
    onregenerate?: () => void;
    submitLabel?: string;
    placeholder?: string;
    compact?: boolean;
  }

  let {
    regenPrompt,
    onpromptchange,
    onreset,
    onregenerate,
    submitLabel = 'Neu generieren',
    placeholder = DEFAULT_PROMPT,
    compact = false,
  }: Props = $props();
</script>

<div class="regen-drawer" class:compact>
  <textarea
    class="prompt-textarea"
    value={regenPrompt}
    oninput={(e) => onpromptchange(e.currentTarget.value)}
    placeholder={placeholder}
    rows={compact ? 3 : 5}
  ></textarea>
  <div class="regen-actions">
    <button class="reset-button" onclick={onreset} type="button">
      <RotateCcw size={12} />
      Zurücksetzen
    </button>
    {#if onregenerate}
      <button class="regen-btn" onclick={onregenerate}>
        <RefreshCw size={14} />
        {submitLabel}
      </button>
    {/if}
  </div>
</div>

<style>
  .regen-drawer {
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-background);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .prompt-textarea {
    width: 100%;
    padding: 0.625rem;
    font-size: var(--text-sm);
    line-height: 1.5;
    font-family: 'Monaco', 'Menlo', monospace;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    resize: vertical;
    min-height: 80px;
    margin-bottom: var(--spacing-md);
    box-sizing: border-box;
  }

  .prompt-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
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
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .reset-button:hover {
    background: var(--color-status-error-bg);
    border-color: var(--color-danger-light);
    color: var(--color-danger-dark);
  }

  .regen-btn {
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
  }

  .regen-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(234, 114, 110, 0.35);
  }

  .regen-drawer.compact {
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .compact .prompt-textarea {
    min-height: 60px;
    margin-bottom: var(--spacing-sm);
  }
</style>
