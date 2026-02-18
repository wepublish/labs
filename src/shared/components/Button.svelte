<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    type = 'button',
    onclick,
    children
  }: Props = $props();

  const isDisabled = $derived(disabled || loading);
</script>

<button
  class="btn btn-{variant} btn-{size}"
  class:loading
  disabled={isDisabled}
  {type}
  {onclick}
>
  {#if loading}
    <span class="spinner"></span>
  {/if}
  <span class="content" class:hidden={loading}>
    {@render children()}
  </span>
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-weight: 500;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background-color 0.15s,
      border-color 0.15s,
      opacity 0.15s;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Sizes */
  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }

  .btn-md {
    padding: 0.5rem 1rem;
    font-size: 1rem;
  }

  .btn-lg {
    padding: 0.75rem 1.5rem;
    font-size: 1.125rem;
  }

  /* Variants */
  .btn-primary {
    background-color: var(--color-primary, #ea726e);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-dark, #d45a56);
  }

  .btn-secondary {
    background-color: var(--color-secondary, #e5e7eb);
    color: var(--color-text, #1f2937);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--color-secondary-dark, #d1d5db);
  }

  .btn-danger {
    background-color: var(--color-danger, #ef4444);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background-color: var(--color-danger-dark, #dc2626);
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--color-text, #1f2937);
  }

  .btn-ghost:hover:not(:disabled) {
    background-color: var(--color-secondary, #e5e7eb);
  }

  /* Loading state */
  .spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .hidden {
    visibility: hidden;
    position: absolute;
  }

  .loading {
    position: relative;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
