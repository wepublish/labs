<script lang="ts">
  import { Badge } from '../ui/primitives';
  import { formatRelativeTime } from '../../lib/constants';
  import type { Execution } from '../../lib/types';

  interface Props {
    execution: Execution;
    compact?: boolean;
  }

  let { execution, compact = false }: Props = $props();
</script>

<div class="execution-card" class:compact>
  <div class="execution-status {execution.status}"></div>
  <div class="execution-content">
    <div class="execution-header">
      <span class="execution-scout-name">{execution.scout_name || 'Scout'}</span>
      <span class="execution-time">{formatRelativeTime(execution.started_at)}</span>
    </div>

    {#if execution.summary_text && !compact}
      <p class="execution-summary">{execution.summary_text}</p>
    {/if}

    <div class="execution-badges">
      {#if execution.status === 'failed'}
        <Badge variant="error">Fehlgeschlagen</Badge>
      {:else if execution.change_status === 'same'}
        <Badge variant="neutral">Unverandert</Badge>
      {:else if execution.criteria_matched}
        <Badge variant="matched">Kriterien erfullt</Badge>
      {:else}
        <Badge variant="neutral">Keine Treffer</Badge>
      {/if}

      {#if execution.is_duplicate}
        <Badge variant="duplicate">Duplikat</Badge>
      {/if}

      {#if execution.notification_sent}
        <Badge variant="notified">Benachrichtigt</Badge>
      {/if}

      {#if execution.units_extracted > 0}
        <Badge variant="neutral">{execution.units_extracted} Einheiten</Badge>
      {/if}
    </div>
  </div>
</div>

<style>
  .execution-card {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .execution-card.compact {
    padding: var(--spacing-sm);
  }

  .execution-card.compact .execution-summary {
    display: none;
  }

  .execution-status {
    width: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .execution-status.completed { background: var(--color-success); }
  .execution-status.running { background: var(--color-warning); }
  .execution-status.failed { background: var(--color-danger); }

  .execution-content {
    flex: 1;
    min-width: 0;
  }

  .execution-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-xs);
  }

  .execution-scout-name { font-weight: 500; }

  .execution-time {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .execution-summary {
    font-size: var(--text-base);
    color: var(--color-text);
    margin-bottom: var(--spacing-sm);
  }

  .execution-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }
</style>
