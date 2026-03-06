<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    padding?: 'none' | 'sm' | 'md' | 'lg';
    shadow?: 'none' | 'sm' | 'md' | 'lg';
    interactive?: boolean;
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }

  let { padding = 'md', shadow = 'sm', interactive = false, children, header, footer }: Props = $props();
</script>

<div class="card shadow-{shadow}" class:interactive>
  {#if header}
    <div class="card-header padding-{padding}">
      {@render header()}
    </div>
  {/if}

  <div class="card-body padding-{padding}">
    {@render children()}
  </div>

  {#if footer}
    <div class="card-footer padding-{padding}">
      {@render footer()}
    </div>
  {/if}
</div>

<style>
  .card {
    background-color: var(--color-surface, #ffffff);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border, #e5e7eb);
    overflow: hidden;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
  }

  .interactive {
    cursor: pointer;
  }

  .interactive:hover {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-md);
  }

  /* Shadows */
  .shadow-none {
    box-shadow: none;
  }

  .shadow-sm {
    box-shadow: var(--shadow-sm);
  }

  .shadow-md {
    box-shadow: var(--shadow-md);
  }

  .shadow-lg {
    box-shadow: var(--shadow-lg);
  }

  /* Padding */
  .padding-none {
    padding: 0;
  }

  .padding-sm {
    padding: 0.75rem;
  }

  .padding-md {
    padding: 1rem;
  }

  .padding-lg {
    padding: 1.5rem;
  }

  /* Card sections */
  .card-header {
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    font-weight: 600;
  }

  .card-footer {
    border-top: 1px solid var(--color-border, #e5e7eb);
    background-color: var(--color-surface-muted, #f9fafb);
  }
</style>
