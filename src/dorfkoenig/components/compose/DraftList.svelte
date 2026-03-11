<script lang="ts">
  import { Plus, Clock, CheckCircle, XCircle } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import type { BajourDraft } from '../../bajour/types';
  import { displayStatus } from '../../bajour/utils';
  import type { VerificationStatus } from '../../bajour/types';

  interface Props {
    drafts: BajourDraft[];
    activeDraftId?: string | null;
    onselect: (draft: BajourDraft) => void;
    oncreate?: () => void;
  }

  let { drafts, activeDraftId = null, onselect, oncreate }: Props = $props();

  function statusLabel(status: VerificationStatus): string {
    const map: Record<VerificationStatus, string> = {
      ausstehend: 'Ausstehend',
      'bestätigt': 'Bestätigt',
      abgelehnt: 'Abgelehnt',
    };
    return map[status];
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
        {@const status = displayStatus(draft)}
        <button
          class="draft-row"
          class:active={draft.id === activeDraftId}
          onclick={() => onselect(draft)}
        >
          <span class="row-village-slot">
            <span class="row-village-pill">{draft.village_name}</span>
          </span>
          <span class="row-title">{draft.title || draft.village_name}</span>
          <span class="row-status-slot">
            {#if status}
              <span
                class="row-status-badge"
                class:status-pending={status === 'ausstehend'}
                class:status-confirmed={status === 'bestätigt'}
                class:status-rejected={status === 'abgelehnt'}
              >
                {#if status === 'ausstehend'}
                  <Clock size={9} strokeWidth={3} />
                {:else if status === 'bestätigt'}
                  <CheckCircle size={9} strokeWidth={3} />
                {:else}
                  <XCircle size={9} strokeWidth={3} />
                {/if}
                {statusLabel(status)}
              </span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .draft-list {
    display: flex;
    flex-direction: column;
  }

  .draft-list-header {
    display: flex;
    justify-content: flex-end;
    padding: 0.75rem 1rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--color-text-muted);
    font-size: var(--text-base);
  }

  .empty-state p {
    margin: 0;
  }

  .draft-rows {
    display: flex;
    flex-direction: column;
  }

  .draft-row {
    display: flex;
    align-items: center;
    padding: 0.625rem 1rem;
    border: none;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--color-border-light, #f0efed);
    background: var(--color-surface);
    cursor: pointer;
    transition: background var(--transition-base);
    width: 100%;
    text-align: left;
    font-family: inherit;
    gap: 0;
  }

  .draft-row:last-child {
    border-bottom: none;
  }

  .draft-row:hover {
    background: rgba(234, 114, 110, 0.04);
  }

  .draft-row.active {
    background: rgba(234, 114, 110, 0.04);
    border-left-color: var(--color-primary);
  }

  /* Fixed-width village slot for vertical alignment */
  .row-village-slot {
    width: 5.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .row-village-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.1875rem 0.625rem;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: 0.625rem;
    white-space: nowrap;
  }

  /* Flex title column */
  .row-title {
    flex: 1;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* Fixed-width status slot for vertical alignment */
  .row-status-slot {
    width: 7rem;
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
  }

  .row-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem 0.625rem;
    font-size: var(--text-sm);
    font-weight: 600;
    border-radius: 0.625rem;
    white-space: nowrap;
  }

  .status-pending {
    background: var(--color-badge-event-bg);
    color: var(--color-badge-event-text);
  }

  .status-confirmed {
    background: var(--color-badge-entity-bg);
    color: var(--color-badge-entity-text);
  }

  .status-rejected {
    background: var(--color-status-error-bg);
    color: var(--color-status-error-text);
  }
</style>
