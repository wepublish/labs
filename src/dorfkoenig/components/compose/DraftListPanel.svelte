<script lang="ts">
  import { FileText } from 'lucide-svelte';
  import DraftList from './DraftList.svelte';
  import type { BajourDraft } from '../../bajour/types';

  interface Props {
    drafts: BajourDraft[];
    activeDraftId?: string | null;
    show: boolean;
    ontoggle: () => void;
    onselect: (draft: BajourDraft) => void;
  }

  let { drafts, activeDraftId = null, show, ontoggle, onselect }: Props = $props();
</script>

<div class="draft-nav">
  <div class="draft-nav-header">
    <button
      class="draft-nav-toggle"
      class:active={show}
      onclick={ontoggle}
      type="button"
    >
      <FileText size={14} />
      <span class="toggle-label">Entwürfe</span>
      {#if drafts.length > 0}
        <span class="toggle-count">{drafts.length}</span>
      {/if}
    </button>
  </div>

  {#if show}
    <div class="draft-list-overlay">
      <DraftList
        {drafts}
        {activeDraftId}
        {onselect}
      />
    </div>
  {/if}
</div>

<style>
  .draft-nav {
    position: relative;
    flex-shrink: 0;
    z-index: 2;
  }

  .draft-nav-header {
    display: flex;
    align-items: center;
    padding: 0.625rem var(--spacing-lg);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .draft-nav-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: var(--text-base-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .draft-nav-toggle:hover {
    color: var(--color-text);
    background: var(--color-surface-muted);
  }

  .draft-nav-toggle.active {
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.06);
    border-color: rgba(234, 114, 110, 0.3);
  }

  .toggle-label {
    flex-shrink: 0;
  }

  .toggle-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    font-size: 0.6875rem;
    font-weight: 700;
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
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }
</style>
