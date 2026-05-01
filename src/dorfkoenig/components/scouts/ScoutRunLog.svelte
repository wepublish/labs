<script lang="ts">
  import { History } from 'lucide-svelte';
  import { executionsApi } from '../../lib/api';
  import { formatRelativeTime } from '../../lib/constants';
  import type { Execution } from '../../lib/types';

  interface Props {
    scoutId: string;
    refreshKey?: number;
  }

  let { scoutId, refreshKey = 0 }: Props = $props();

  let latestExecutions = $state<Execution[]>([]);
  let loading = $state(false);
  let error = $state('');

  async function loadLatestExecutions(id: string): Promise<void> {
    loading = true;
    error = '';
    try {
      latestExecutions = await executionsApi.list({ scout_id: id, limit: 3 });
    } catch (err) {
      latestExecutions = [];
      error = (err as Error).message || 'Läufe konnten nicht geladen werden';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void refreshKey;
    void loadLatestExecutions(scoutId);
  });

  function statusLabel(execution: Execution): string {
    if (execution.status === 'running') return 'Läuft';
    if (execution.status === 'failed') return 'Fehlgeschlagen';
    if (execution.change_status === 'same') return 'Keine Änderung';
    if (execution.criteria_matched) return 'Treffer';
    return 'Kein Treffer';
  }

  function countLabel(execution: Execution): string {
    const created = execution.units_extracted ?? 0;
    const merged = execution.merged_existing_count ?? 0;
    if (created === 0 && merged === 0) return 'Keine Einheiten';
    if (merged === 0) return `${created} neu`;
    return `${created} neu, ${merged} Duplikate`;
  }
</script>

<aside class="run-log-panel" aria-labelledby="run-log-heading">
  <div class="run-log-header">
    <div>
      <h3 id="run-log-heading">Letzte Läufe</h3>
      <p>Aktuelle Ausführungen dieses Scouts.</p>
    </div>
    <History size={16} />
  </div>

  {#if loading}
    <p class="run-log-muted">Läufe werden geladen…</p>
  {:else if error}
    <p class="run-log-error">{error}</p>
  {:else if latestExecutions.length === 0}
    <p class="run-log-muted">Noch keine Läufe</p>
  {:else}
    <ul class="run-log-list">
      {#each latestExecutions as execution (execution.id)}
        <li class="run-log-item status-{execution.status}">
          <div class="run-log-line">
            <span class="run-log-status">{statusLabel(execution)}</span>
            <span class="run-log-time">{formatRelativeTime(execution.started_at)}</span>
          </div>
          <span class="run-log-count">{countLabel(execution)}</span>
          {#if execution.error_message}
            <p class="run-log-message error">{execution.error_message}</p>
          {:else if execution.summary_text}
            <p class="run-log-message">{execution.summary_text}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .run-log-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .run-log-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    color: var(--color-text-muted);
  }

  .run-log-header h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 650;
    color: var(--color-text);
  }

  .run-log-header p {
    margin: 0.125rem 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .run-log-muted,
  .run-log-error {
    margin: 0;
    font-size: var(--text-sm);
  }

  .run-log-muted {
    color: var(--color-text-light);
    font-style: italic;
  }

  .run-log-error {
    color: #dc2626;
  }

  .run-log-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .run-log-item {
    padding-left: 0.75rem;
    border-left: 2px solid #d1d5db;
  }

  .run-log-item.status-completed {
    border-left-color: #22c55e;
  }

  .run-log-item.status-running {
    border-left-color: #f59e0b;
  }

  .run-log-item.status-failed {
    border-left-color: #ef4444;
  }

  .run-log-line {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: var(--text-xs);
  }

  .run-log-status {
    font-weight: 700;
    color: var(--color-text);
  }

  .run-log-time,
  .run-log-count {
    font-size: var(--text-xs);
    color: var(--color-text-light);
  }

  .run-log-count {
    display: block;
    margin-top: 0.125rem;
  }

  .run-log-message {
    margin: 0.25rem 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .run-log-message.error {
    color: #dc2626;
  }
</style>
