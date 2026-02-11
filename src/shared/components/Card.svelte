<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    padding?: 'none' | 'sm' | 'md' | 'lg';
    shadow?: 'none' | 'sm' | 'md' | 'lg';
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }

  let { padding = 'md', shadow = 'sm', children, header, footer }: Props = $props();
</script>

<div class="card shadow-{shadow}">
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
    border-radius: 0.5rem;
    border: 1px solid var(--color-border, #e5e7eb);
    overflow: hidden;
  }

  /* Shadows */
  .shadow-none {
    box-shadow: none;
  }

  .shadow-sm {
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }

  .shadow-md {
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
  }

  .shadow-lg {
    box-shadow:
      0 10px 15px -3px rgb(0 0 0 / 0.1),
      0 4px 6px -4px rgb(0 0 0 / 0.1);
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
