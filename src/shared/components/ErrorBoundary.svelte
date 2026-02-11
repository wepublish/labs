<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    fallback?: Snippet<[{ error: Error; reset: () => void }]>;
  }

  let { children, fallback }: Props = $props();

  let error = $state<Error | null>(null);

  function handleError(e: Error) {
    console.error('[ErrorBoundary] Caught error:', e);
    error = e;
  }

  function reset() {
    error = null;
  }

  // Note: Svelte 5 doesn't have built-in error boundary support yet,
  // so this component provides a pattern for manual error handling.
  // Components should call `handleError` when they catch errors.

  // Export handleError for child components to use
  export { handleError };
</script>

{#if error}
  {#if fallback}
    {@render fallback({ error, reset })}
  {:else}
    <div class="error-boundary" role="alert">
      <div class="error-icon">!</div>
      <h2>Something went wrong</h2>
      <p class="error-message">{error.message}</p>
      <button class="reset-button" onclick={reset}>Try again</button>
      {#if import.meta.env.DEV}
        <details class="error-details">
          <summary>Error details (dev only)</summary>
          <pre>{error.stack}</pre>
        </details>
      {/if}
    </div>
  {/if}
{:else}
  {@render children()}
{/if}

<style>
  .error-boundary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    min-height: 200px;
    background-color: var(--color-surface, #ffffff);
    border: 1px solid var(--color-danger, #ef4444);
    border-radius: 0.5rem;
  }

  .error-icon {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-danger, #ef4444);
    color: white;
    font-weight: bold;
    font-size: 1.5rem;
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: var(--color-text, #1f2937);
  }

  .error-message {
    color: var(--color-text-muted, #6b7280);
    margin: 0 0 1rem;
  }

  .reset-button {
    padding: 0.5rem 1rem;
    background-color: var(--color-primary, #6366f1);
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
  }

  .reset-button:hover {
    background-color: var(--color-primary-dark, #4f46e5);
  }

  .error-details {
    margin-top: 1rem;
    text-align: left;
    width: 100%;
    max-width: 600px;
  }

  .error-details summary {
    cursor: pointer;
    color: var(--color-text-muted, #6b7280);
    font-size: 0.875rem;
  }

  .error-details pre {
    margin-top: 0.5rem;
    padding: 1rem;
    background-color: var(--color-surface-muted, #f9fafb);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
