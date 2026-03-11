<script lang="ts">
  import { Loader2 } from 'lucide-svelte';
  import type { VerificationStatus } from '../../bajour/types';

  interface Props {
    status: VerificationStatus | null;
    loading: boolean;
    disabled?: boolean;
    onchange: (status: VerificationStatus) => void;
  }

  let { status, loading, disabled = false, onchange }: Props = $props();
</script>

<div class="status-toggle">
  <button
    class="toggle-btn toggle-confirm"
    class:active={status === 'bestätigt'}
    disabled={loading || disabled}
    onclick={() => onchange('bestätigt')}
    type="button"
  >
    {#if loading && status !== 'bestätigt'}
      <Loader2 size={12} class="spin" />
    {/if}
    Bestätigt
  </button>
  <button
    class="toggle-btn toggle-reject"
    class:active={status === 'abgelehnt'}
    disabled={loading || disabled}
    onclick={() => onchange('abgelehnt')}
    type="button"
  >
    {#if loading && status !== 'abgelehnt'}
      <Loader2 size={12} class="spin" />
    {/if}
    Abgelehnt
  </button>
</div>

<style>
  .status-toggle {
    display: flex;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--color-border);
    width: fit-content;
  }

  .toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    font-size: var(--text-base-sm);
    font-weight: 500;
    border: none;
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .toggle-btn:not(:last-child) {
    border-right: 1px solid var(--color-border);
  }

  .toggle-btn:hover:not(.active):not(:disabled) {
    background: var(--color-surface-muted);
  }

  .toggle-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-confirm.active {
    background: var(--color-badge-entity-bg);
    color: var(--color-badge-entity-text);
  }

  .toggle-reject.active {
    background: var(--color-status-error-bg);
    color: var(--color-status-error-text);
  }
</style>
