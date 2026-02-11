<script lang="ts">
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
        <span class="execution-badge failed">Fehlgeschlagen</span>
      {:else if execution.change_status === 'same'}
        <span class="execution-badge not-matched">Unverändert</span>
      {:else if execution.criteria_matched}
        <span class="execution-badge matched">Kriterien erfüllt</span>
      {:else}
        <span class="execution-badge not-matched">Keine Treffer</span>
      {/if}

      {#if execution.is_duplicate}
        <span class="execution-badge duplicate">Duplikat</span>
      {/if}

      {#if execution.notification_sent}
        <span class="execution-badge notified">Benachrichtigt</span>
      {/if}

      {#if execution.units_extracted > 0}
        <span class="execution-badge">{execution.units_extracted} Einheiten</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .execution-card.compact {
    padding: var(--spacing-sm);
  }

  .execution-card.compact .execution-summary {
    display: none;
  }

  .failed {
    background: rgba(239, 68, 68, 0.1) !important;
    color: var(--color-danger) !important;
  }
</style>
