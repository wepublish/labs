<script lang="ts">
  import { RefreshCw, RotateCcw } from 'lucide-svelte';
  import { DEFAULT_PROMPT } from '../../lib/constants';

  interface Props {
    regenPrompt: string;
    onpromptchange: (prompt: string) => void;
    onreset: () => void;
    onregenerate: () => void;
  }

  let {
    regenPrompt,
    onpromptchange,
    onreset,
    onregenerate,
  }: Props = $props();
</script>

<div class="regen-drawer">
  <textarea
    class="prompt-textarea"
    value={regenPrompt}
    oninput={(e) => onpromptchange(e.currentTarget.value)}
    placeholder={DEFAULT_PROMPT}
    rows="5"
  ></textarea>
  <div class="regen-actions">
    <button class="reset-button" onclick={onreset} type="button">
      <RotateCcw size={12} />
      Zurücksetzen
    </button>
    <button class="regen-btn" onclick={onregenerate}>
      <RefreshCw size={14} />
      Neu generieren
    </button>
  </div>
</div>

<style>
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
</style>
