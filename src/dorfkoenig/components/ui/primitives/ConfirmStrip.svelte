<script lang="ts">
  import { X, Check } from 'lucide-svelte';

  interface Props {
    label?: string;
    loading?: boolean;
    onconfirm: (e: MouseEvent) => void;
    oncancel: (e: MouseEvent) => void;
  }

  let { label = 'Loschen?', loading = false, onconfirm, oncancel }: Props = $props();
</script>

<div
  class="strip"
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => e.stopPropagation()}
  role="toolbar"
  tabindex="-1"
>
  {#if loading}
    <span class="strip-spinner"></span>
  {:else}
    <button class="strip-btn strip-cancel" onclick={oncancel} type="button" title="Abbrechen">
      <X size={12} />
    </button>
    <span class="strip-label">{label}</span>
    <button class="strip-btn strip-confirm" onclick={onconfirm} type="button" title="Bestatigen">
      <Check size={12} />
    </button>
  {/if}
</div>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem;
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
    border-radius: var(--radius-sm);
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .strip-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-status-error-text);
    text-transform: uppercase;
    padding: 0 0.25rem;
  }

  .strip-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .strip-cancel { background: var(--color-surface); color: var(--color-status-neutral-text); }
  .strip-cancel:hover { background: var(--color-surface-muted); color: var(--color-text); }
  .strip-confirm { background: var(--color-danger-dark); color: white; }
  .strip-confirm:hover { background: var(--color-status-error-text); }

  .strip-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-danger-border);
    border-top-color: var(--color-danger-dark);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
