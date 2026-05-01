<script lang="ts">
  import { GitMerge, CopyCheck } from 'lucide-svelte';
  import type { UploadDedupDetail } from '../../lib/types';

  interface Props {
    details: UploadDedupDetail[];
  }

  let { details }: Props = $props();

  function reasonLabel(reason: UploadDedupDetail['reason']): string {
    return reason === 'in_batch_duplicate'
      ? 'Duplikat im Upload'
      : 'Mit bestehender Einheit zusammengeführt';
  }
</script>

{#if details.length > 0}
  <div class="dedup-panel">
    <div class="dedup-header">
      <CopyCheck size={16} />
      <span>{details.length} deduplizierte {details.length === 1 ? 'Einheit' : 'Einheiten'}</span>
    </div>

    <ul class="dedup-list">
      {#each details as item (item.uid)}
        <li class="dedup-item">
          <div class="dedup-reason">
            <GitMerge size={13} />
            <span>{reasonLabel(item.reason)}</span>
          </div>
          <p class="dedup-statement">{item.statement}</p>
          {#if item.matched_statement}
            <p class="dedup-match">
              Bereits vorhanden: {item.matched_statement}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .dedup-panel {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--color-surface-muted, #f9fafb);
  }

  .dedup-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .dedup-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 16rem;
    overflow-y: auto;
  }

  .dedup-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.625rem 0;
    border-top: 1px solid var(--color-border);
  }

  .dedup-reason {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .dedup-statement,
  .dedup-match {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .dedup-statement {
    color: var(--color-text);
  }

  .dedup-match {
    color: var(--color-text-muted);
  }
</style>
