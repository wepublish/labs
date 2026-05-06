<script lang="ts">
  import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-svelte';
  import { executionsApi } from '../../lib/api';
  import { executionOutcome } from '../../lib/execution-labels';
  import type { Execution, InformationUnit } from '../../lib/types';

  interface Props {
    scoutId: string;
    criteria?: string | null;
    refreshKey?: number;
  }

  let { scoutId, criteria = null, refreshKey = 0 }: Props = $props();

  let executions = $state<Execution[]>([]);
  let loading = $state(false);
  let error = $state('');
  let expandedId = $state<string | null>(null);
  let detailLoading = $state<Set<string>>(new Set());
  let detailById = $state<Map<string, Execution>>(new Map());
  let detailErrorById = $state<Map<string, string>>(new Map());

  const DATE_TIME = new Intl.DateTimeFormat('de-CH', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  async function loadExecutions(id: string): Promise<void> {
    loading = true;
    error = '';
    try {
      executions = await executionsApi.list({ scout_id: id, limit: 10 });
    } catch (err) {
      executions = [];
      error = (err as Error).message || 'Läufe konnten nicht geladen werden';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void refreshKey;
    expandedId = null;
    detailById = new Map();
    detailErrorById = new Map();
    void loadExecutions(scoutId);
  });

  function formatTime(value: string | null): string {
    if (!value) return '—';
    try {
      return DATE_TIME.format(new Date(value));
    } catch {
      return value;
    }
  }

  function durationLabel(execution: Execution): string {
    if (execution.scrape_duration_ms) return `${Math.round(execution.scrape_duration_ms / 1000)}s scrape`;
    if (!execution.completed_at) return 'offen';
    const durationMs = new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime();
    if (!Number.isFinite(durationMs) || durationMs < 0) return '—';
    if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
    return `${Math.round(durationMs / 60_000)}m`;
  }

  function countLabel(execution: Execution): string {
    const created = execution.units_extracted ?? 0;
    const merged = execution.merged_existing_count ?? 0;
    return `${created} neu / ${merged} dup`;
  }

  function summaryLine(execution: Execution): string {
    return execution.error_message || execution.summary_text || 'Keine Zusammenfassung';
  }

  async function toggleExecution(execution: Execution): Promise<void> {
    if (expandedId === execution.id) {
      expandedId = null;
      return;
    }

    expandedId = execution.id;
    if (detailById.has(execution.id) || detailLoading.has(execution.id)) return;

    detailLoading = new Set(detailLoading).add(execution.id);
    const nextErrors = new Map(detailErrorById);
    nextErrors.delete(execution.id);
    detailErrorById = nextErrors;

    try {
      const detail = await executionsApi.get(execution.id);
      const next = new Map(detailById);
      next.set(execution.id, detail);
      detailById = next;
    } catch (err) {
      const next = new Map(detailErrorById);
      next.set(execution.id, (err as Error).message || 'Details konnten nicht geladen werden');
      detailErrorById = next;
    } finally {
      const nextLoading = new Set(detailLoading);
      nextLoading.delete(execution.id);
      detailLoading = nextLoading;
    }
  }

  function unitLabel(unit: InformationUnit): string {
    const type = unit.unit_type === 'event' ? 'event' : unit.unit_type === 'entity_update' ? 'update' : 'fact';
    return `${type}${unit.event_date ? ` · ${unit.event_date}` : ''}`;
  }
</script>

<aside class="execution-log" aria-labelledby="execution-log-heading">
  <div class="log-heading">
    <div>
      <h3 id="execution-log-heading">Ausführungslog</h3>
      <p>Letzte 10 Runs, Metadaten und gespeicherte Einheiten.</p>
    </div>
    <button class="refresh-btn" type="button" onclick={() => loadExecutions(scoutId)} title="Neu laden">
      <RefreshCw size={14} />
    </button>
  </div>

  {#if loading}
    <div class="log-state">
      <Loader2 size={14} class="spin" />
      Läufe werden geladen…
    </div>
  {:else if error}
    <p class="log-error">{error}</p>
  {:else if executions.length === 0}
    <p class="log-muted">Noch keine Läufe</p>
  {:else}
    <ol class="log-list">
      {#each executions as execution (execution.id)}
        {@const detail = detailById.get(execution.id)}
        {@const detailError = detailErrorById.get(execution.id)}
        {@const isExpanded = expandedId === execution.id}
        {@const outcome = executionOutcome(execution, criteria)}
        {@const tone = outcome.tone}
        <li class="log-row tone-{tone}">
          <button class="log-summary" type="button" onclick={() => toggleExecution(execution)}>
            <div class="summary-top">
              <span class="expand-icon">
                {#if isExpanded}
                  <ChevronDown size={15} />
                {:else}
                  <ChevronRight size={15} />
                {/if}
              </span>
              <span class="log-status status-chip-{tone}">{outcome.label}</span>
              <span class="log-result">{outcome.detail}</span>
            </div>
            <div class="summary-meta">
              <span>{formatTime(execution.started_at)}</span>
              <span>{countLabel(execution)}</span>
              <span>{durationLabel(execution)}</span>
            </div>
            <p class:error={!!execution.error_message} class="log-message">
              {summaryLine(execution)}
            </p>
          </button>

          {#if isExpanded}
            <div class="log-detail">
              {#if detailLoading.has(execution.id)}
                <div class="log-state compact">
                  <Loader2 size={13} class="spin" />
                  Details laden…
                </div>
              {:else if detailError}
                <p class="log-error compact">{detailError}</p>
              {:else if detail}
                <dl class="meta-grid">
                  <div>
                    <dt>ID</dt>
                    <dd>{detail.id}</dd>
                  </div>
                  <div>
                    <dt>Start</dt>
                    <dd>{formatTime(detail.started_at)}</dd>
                  </div>
                  <div>
                    <dt>Ende</dt>
                    <dd>{formatTime(detail.completed_at)}</dd>
                  </div>
                  <div>
                    <dt>Change</dt>
                    <dd>{detail.change_status ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Criteria</dt>
                    <dd>{detail.criteria_matched === null ? '—' : detail.criteria_matched ? 'true' : 'false'}</dd>
                  </div>
                  <div>
                    <dt>Execution dedup</dt>
                    <dd>{detail.is_duplicate ? `true (${detail.duplicate_similarity ?? 'n/a'})` : 'false'}</dd>
                  </div>
                </dl>

                {#if detail.units && detail.units.length > 0}
                  <div class="unit-block">
                    <h4>Einheiten ({detail.units.length})</h4>
                    <ul>
                      {#each detail.units as unit (unit.id)}
                        <li>
                          <span>{unitLabel(unit)}</span>
                          <p>{unit.statement}</p>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {:else}
                  <p class="log-muted compact">Keine Einheiten an diesem Lauf.</p>
                {/if}
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</aside>

<style>
  .execution-log {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .log-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0 0 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .log-heading h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 650;
    color: var(--color-text);
  }

  .log-heading p {
    margin: 0.125rem 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-light);
    cursor: pointer;
  }

  .refresh-btn:hover {
    color: var(--color-text);
    background: var(--color-background);
  }

  .log-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .log-row {
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--log-tone, var(--color-border));
    border-radius: var(--radius-sm);
    background: var(--color-background);
  }

  .log-row.tone-matched {
    --log-tone: #16a34a;
    background: rgba(22, 163, 74, 0.035);
  }

  .log-row.tone-same {
    --log-tone: #9ca3af;
  }

  .log-row.tone-known {
    --log-tone: #d97706;
    background: rgba(217, 119, 6, 0.035);
  }

  .log-row.tone-changed,
  .log-row.tone-running {
    --log-tone: #d97706;
  }

  .log-row.tone-failed {
    --log-tone: #dc2626;
    background: rgba(220, 38, 38, 0.035);
  }

  .log-summary {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .summary-top,
  .summary-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .summary-top {
    min-height: 1.25rem;
  }

  .summary-meta {
    padding-left: 1.5rem;
    color: var(--color-text-light);
    font-size: 0.75rem;
  }

  .summary-meta span {
    display: inline-flex;
    align-items: center;
  }

  .summary-meta span + span::before {
    content: '·';
    margin-right: 0.5rem;
    color: var(--color-text-light);
  }

  .expand-icon {
    display: flex;
    color: var(--color-text-light);
  }

  .log-status,
  .log-result {
    min-width: 0;
    font-size: 0.8125rem;
  }

  .log-status {
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    min-height: 1.35rem;
    padding: 0.0625rem 0.5rem;
    border: 1px solid transparent;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
  }

  .status-chip-matched {
    border-color: rgba(22, 163, 74, 0.22);
    background: rgba(22, 163, 74, 0.1);
    color: #15803d;
  }

  .status-chip-same {
    border-color: var(--color-border);
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
  }

  .status-chip-known {
    border-color: rgba(217, 119, 6, 0.22);
    background: rgba(217, 119, 6, 0.1);
    color: #92400e;
  }

  .status-chip-changed,
  .status-chip-running {
    border-color: rgba(217, 119, 6, 0.22);
    background: rgba(217, 119, 6, 0.1);
    color: #b45309;
  }

  .status-chip-failed {
    border-color: rgba(220, 38, 38, 0.22);
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626;
  }

  .log-result {
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .log-message {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .log-message.error,
  .log-error {
    color: #dc2626;
  }

  .log-detail {
    margin: 0.875rem 0 0 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.375rem 0.75rem;
    margin: 0;
  }

  .meta-grid div {
    min-width: 0;
  }

  .meta-grid dt {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
  }

  .meta-grid dd {
    margin: 0.125rem 0 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .unit-block {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .unit-block h4 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .unit-block ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .unit-block li {
    padding-left: 0.625rem;
    border-left: 2px solid var(--color-border);
  }

  .unit-block span {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-text-light);
    text-transform: uppercase;
  }

  .unit-block p {
    margin: 0.125rem 0 0;
    font-size: var(--text-sm);
    line-height: 1.35;
    color: var(--color-text-muted);
  }

  .log-state,
  .log-muted,
  .log-error {
    margin: 0;
    font-size: var(--text-sm);
  }

  .log-state {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-muted);
  }

  .log-state.compact,
  .log-muted.compact,
  .log-error.compact {
    font-size: 0.75rem;
  }

  .log-muted {
    color: var(--color-text-light);
    font-style: italic;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 1120px) {
    .execution-log {
      padding: 0.875rem;
    }

    .summary-meta,
    .log-message,
    .log-detail {
      padding-left: 0;
      margin-left: 0;
    }
  }
</style>
