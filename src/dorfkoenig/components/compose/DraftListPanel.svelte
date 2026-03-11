<script lang="ts">
  import { FileText, ChevronUp, ChevronDown } from 'lucide-svelte';
  import DraftList from '../../bajour/components/DraftList.svelte';
  import type { BajourDraft } from '../../bajour/types';

  interface Props {
    drafts: BajourDraft[];
    show: boolean;
    ontoggle: () => void;
    onselect: (draft: BajourDraft) => void;
  }

  let { drafts, show, ontoggle, onselect }: Props = $props();
</script>

<div class="draft-list-wrapper">
  <div class="draft-list-header">
    <button
      class="draft-list-toggle"
      class:active={show}
      onclick={ontoggle}
      type="button"
    >
      <FileText size={16} />
      Entwürfe
      {#if drafts.length > 0}
        <span class="draft-count-badge">{drafts.length}</span>
      {/if}
      {#if show}
        <ChevronUp size={14} />
      {:else}
        <ChevronDown size={14} />
      {/if}
    </button>
  </div>

  {#if show}
    <!-- Overlay: floats on top of content below -->
    <div class="draft-list-overlay">
      <DraftList
        {drafts}
        {onselect}
      />
    </div>
  {/if}
</div>

<style>
  .draft-list-wrapper {
    position: relative;
    flex-shrink: 0;
    z-index: 2;
  }

  .draft-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .draft-list-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    background: none;
    border: none;
    cursor: pointer;
    transition: color var(--transition-base);
  }

  .draft-list-toggle:hover,
  .draft-list-toggle.active {
    color: var(--color-primary);
  }

  .draft-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1;
    color: white;
    background: var(--color-primary);
    border-radius: 999px;
  }

  .draft-list-overlay {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 340px;
    overflow-y: auto;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }
</style>
