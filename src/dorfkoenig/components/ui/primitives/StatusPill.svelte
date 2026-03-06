<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'success' | 'error' | 'neutral' | 'pending';
    children: Snippet;
  }

  let { variant = 'neutral', children }: Props = $props();
</script>

<span class="pill pill-{variant}">
  <span class="pill-dot"></span>
  {@render children()}
</span>

<style>
  .pill {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem 0.5rem;
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-full);
  }

  .pill-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: var(--radius-full);
    background: currentColor;
  }

  .pill-success { background: var(--color-status-success-bg); color: var(--color-status-success-text); }
  .pill-error { background: var(--color-status-error-bg); color: var(--color-status-error-text); }
  .pill-neutral { background: var(--color-status-neutral-bg); color: var(--color-status-neutral-text); }
  .pill-pending { background: var(--color-status-neutral-bg); color: var(--color-status-neutral-text); }
</style>
