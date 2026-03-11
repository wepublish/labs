<script lang="ts">
  import { AlertCircle, RefreshCw } from 'lucide-svelte';

  interface Props {
    error: string;
    onretry: () => void;
  }

  let { error, onretry }: Props = $props();
</script>

<div class="state-centered error">
  <AlertCircle size={24} />
  <h3>Erstellung fehlgeschlagen</h3>
  <p>{error}</p>
  <button class="retry-btn" onclick={onretry} type="button">
    <RefreshCw size={14} />
    Erneut versuchen
  </button>
</div>

<style>
  .state-centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    text-align: center;
    padding: 1.5rem;
  }

  .state-centered.error {
    color: var(--color-danger-dark);
  }

  .state-centered.error h3 {
    color: var(--color-danger-dark);
    margin-top: 0.75rem;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .state-centered.error p {
    margin: 0.25rem 0 1rem 0;
    font-size: var(--text-base);
    color: var(--color-text-muted);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-danger-dark);
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .retry-btn:hover {
    background: var(--color-status-error-bg);
  }
</style>
