<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'fact' | 'event' | 'entity_update' | 'matched' | 'duplicate' | 'notified' | 'manual' | 'neutral' | 'success' | 'error' | 'warning';
    size?: 'sm' | 'md';
    dot?: boolean;
    children: Snippet;
  }

  let { variant = 'neutral', size = 'md', dot = false, children }: Props = $props();
</script>

<span class="badge badge-{variant} badge-{size}">
  {#if dot}<span class="badge-dot"></span>{/if}
  {@render children()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 500;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .badge-sm {
    padding: 1px 0.375rem;
    font-size: var(--text-2xs);
  }

  .badge-md {
    padding: 0.125rem 0.5rem;
    font-size: var(--text-xs);
  }

  .badge-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: var(--radius-full);
    background: currentColor;
  }

  /* Variants */
  .badge-fact { background: var(--color-badge-fact-bg); color: var(--color-badge-fact-text); }
  .badge-event { background: var(--color-badge-event-bg); color: var(--color-badge-event-text); }
  .badge-entity_update { background: var(--color-badge-entity-bg); color: var(--color-badge-entity-text); }
  .badge-matched { background: var(--color-badge-matched-bg); color: var(--color-badge-matched-text); }
  .badge-duplicate { background: var(--color-badge-duplicate-bg); color: var(--color-badge-duplicate-text); }
  .badge-notified { background: var(--color-badge-notified-bg); color: var(--color-badge-notified-text); }
  .badge-manual { background: var(--color-badge-manual-bg); color: var(--color-badge-manual-text); }
  .badge-neutral { background: var(--color-status-neutral-bg); color: var(--color-status-neutral-text); }
  .badge-success { background: var(--color-status-success-bg); color: var(--color-status-success-text); }
  .badge-error { background: var(--color-status-error-bg); color: var(--color-status-error-text); }
  .badge-warning { background: var(--color-warning-surface); color: var(--color-warning-on-surface); }
</style>
