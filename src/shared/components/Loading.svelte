<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    label?: string;
  }

  let { size = 'md', label = 'Loading...' }: Props = $props();
</script>

<div class="loading size-{size}" role="status" aria-label={label}>
  <span class="spinner"></span>
  {#if label}
    <span class="label">{label}</span>
  {/if}
</div>

<style>
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
  }

  .spinner {
    border-radius: 50%;
    border-style: solid;
    border-color: var(--color-primary, #ea726e);
    border-right-color: transparent;
    animation: spin 0.75s linear infinite;
  }

  /* Sizes */
  .size-sm .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border-width: 2px;
  }

  .size-md .spinner {
    width: 2rem;
    height: 2rem;
    border-width: 3px;
  }

  .size-lg .spinner {
    width: 3rem;
    height: 3rem;
    border-width: 4px;
  }

  .label {
    color: var(--color-text-muted, #6b7280);
    font-size: 0.875rem;
  }

  .size-sm .label {
    font-size: 0.75rem;
  }

  .size-lg .label {
    font-size: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
