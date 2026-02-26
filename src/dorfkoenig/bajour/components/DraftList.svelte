<script lang="ts">
  import { Plus } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import VerificationBadge from './VerificationBadge.svelte';
  import type { BajourDraft } from '../types';
  import { displayStatus } from '../utils';

  interface Props {
    drafts: BajourDraft[];
    onselect: (draft: BajourDraft) => void;
    oncreate?: () => void;
  }

  let { drafts, onselect, oncreate }: Props = $props();

  /**
   * Format a date string relative to now in German.
   */
  function formatRelativeDate(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'gerade eben';
    if (diffMinutes < 60) {
      return diffMinutes === 1 ? 'vor 1 Minute' : `vor ${diffMinutes} Minuten`;
    }
    if (diffHours < 24) {
      return diffHours === 1 ? 'vor 1 Stunde' : `vor ${diffHours} Stunden`;
    }
    if (diffDays < 30) {
      return diffDays === 1 ? 'vor 1 Tag' : `vor ${diffDays} Tagen`;
    }
    return new Date(dateStr).toLocaleDateString('de-CH');
  }
</script>

<div class="draft-list">
  {#if oncreate}
    <div class="draft-list-header">
      <Button onclick={oncreate}>
        <Plus size={16} />
        Neuer Entwurf
      </Button>
    </div>
  {/if}

  {#if drafts.length === 0}
    <div class="empty-state">
      <p>Noch keine Entwürfe erstellt.</p>
    </div>
  {:else}
    <div class="draft-rows">
      {#each drafts as draft}
        <button class="draft-row" onclick={() => onselect(draft)}>
          <div class="draft-row-main">
            <span class="draft-village">{draft.village_name}</span>
            <span class="draft-date">{formatRelativeDate(draft.created_at)}</span>
          </div>
          <div class="draft-row-meta">
            <VerificationBadge status={displayStatus(draft)} />
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .draft-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .draft-list-header {
    display: flex;
    justify-content: flex-end;
  }

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--color-text-muted, #6b7280);
    font-size: 0.875rem;
  }

  .empty-state p {
    margin: 0;
  }

  .draft-rows {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .draft-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm, 0.5rem);
    background: var(--color-background, #f9fafb);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
  }

  .draft-row:hover {
    background: rgba(234, 114, 110, 0.04);
    border-color: rgba(234, 114, 110, 0.3);
  }

  .draft-row-main {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .draft-village {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text, #111827);
  }

  .draft-date {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
  }

  .draft-row-meta {
    flex-shrink: 0;
  }
</style>
