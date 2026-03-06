<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    error?: string;
    required?: boolean;
    id?: string;
    children: Snippet;
  }

  let { label, error, required = false, id, children }: Props = $props();

  let errorId = $derived(id ? `${id}-error` : undefined);
</script>

<div class="form-group" class:has-error={!!error}>
  <label for={id}>
    {label}
    {#if required}<span class="required" aria-hidden="true">*</span>{/if}
  </label>
  <div aria-describedby={error ? errorId : undefined}>
    {@render children()}
  </div>
  {#if error}
    <p class="error-text" id={errorId} role="alert">{error}</p>
  {/if}
</div>

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  label {
    font-weight: 500;
    font-size: var(--text-base);
  }

  .required { color: var(--color-danger); }

  .error-text {
    font-size: var(--text-sm);
    color: var(--color-danger);
    margin: 0;
  }
</style>
