<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'ghost' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
    title?: string;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let { variant = 'ghost', size = 'md', title, disabled = false, onclick, children }: Props = $props();
</script>

<button
  class="icon-btn icon-btn-{variant} icon-btn-{size}"
  {title}
  {disabled}
  {onclick}
  type="button"
>
  {@render children()}
</button>

<style>
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition-base);
    color: var(--color-text-light);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Sizes */
  .icon-btn-sm { width: 1.5rem; height: 1.5rem; font-size: var(--text-sm); }
  .icon-btn-md { width: 1.75rem; height: 1.75rem; font-size: var(--text-base-sm); }
  .icon-btn-lg { width: 2rem; height: 2rem; font-size: var(--text-base); }

  /* Variants */
  .icon-btn-ghost:hover:not(:disabled) { background: var(--color-surface-muted); color: var(--color-text); }
  .icon-btn-danger:hover:not(:disabled) { background: var(--color-danger-surface); color: var(--color-danger-dark); }
  .icon-btn-success:hover:not(:disabled) { background: var(--color-status-success-bg); color: var(--color-success-dark); }
</style>
