<script lang="ts">
  import { Trash2, Play, Pause, RefreshCw, ChevronDown, ChevronUp } from 'lucide-svelte';
  import { Loading } from '@shared/components';
  import { ConfirmStrip } from '../ui/primitives';
  import { scouts } from '../../stores/scouts';
  import { executionsApi } from '../../lib/api';
  import { formatRelativeTime, FREQUENCY_OPTIONS_EXTENDED } from '../../lib/constants';
  import type { Scout } from '../../lib/types';

  interface Props {
    scout: Scout;
    expanded?: boolean;
    ontoggle?: () => void;
    ondelete?: (id: string) => void;
    onruncomplete?: () => void;
  }

  let { scout, expanded = false, ontoggle, ondelete, onruncomplete }: Props = $props();

  type ActionType = 'run' | 'toggle' | 'delete';
  let busy = $state<ActionType | null>(null);
  let confirmingDelete = $state(false);

  async function executeAction(e: Event, type: ActionType, fn: () => Promise<void>) {
    e.stopPropagation();
    busy = type;
    try {
      await fn();
    } catch (error) {
      console.error(`Action '${type}' failed:`, error);
    } finally {
      busy = null;
      if (type === 'delete') confirmingDelete = false;
    }
  }

  function handleRun(e: Event) {
    executeAction(e, 'run', async () => {
      const result = await scouts.run(scout.id);
      const executionId = result.execution_id;
      let resolved = false;
      while (!resolved) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const exec = await executionsApi.get(executionId);
          if (exec.status !== 'running') resolved = true;
        } catch {
          resolved = true;
        }
      }
      await scouts.load();
      onruncomplete?.();
    });
  }

  function handleToggleActive(e: Event) {
    executeAction(e, 'toggle', async () => {
      await scouts.update(scout.id, { is_active: !scout.is_active });
      await scouts.load();
    });
  }

  function initiateDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = true;
  }

  function cancelDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = false;
  }

  function confirmDeleteAction(e: Event) {
    e.stopPropagation();
    confirmingDelete = false;
    ondelete?.(scout.id);
    scouts.delete(scout.id).catch((error) => {
      console.error("Action 'delete' failed:", error);
    });
  }

  function getFrequencyLabel(value: string): string {
    return FREQUENCY_OPTIONS_EXTENDED.find((f) => f.value === value)?.label || value;
  }

  let topicChips = $derived(
    scout.topic
      ? scout.topic.split(',').map(t => t.trim()).filter(Boolean)
      : []
  );

  // Strip color: green=matched, red=error/failed, gray=no change/pending
  type StripColor = 'green' | 'red' | 'gray';

  function getStripColor(): StripColor {
    if (scout.last_execution_status === 'failed' || scout.consecutive_failures > 0) return 'red';
    if (scout.last_criteria_matched === true) return 'green';
    return 'gray';
  }

  function getStatusLabel(): string {
    const exec = scout.last_execution_status;
    if (!exec) return 'Ausstehend';
    if (exec === 'failed') return 'Fehlgeschlagen';
    if (scout.last_criteria_matched === true) return 'Treffer';
    if (scout.last_change_status === 'same') return 'Keine Änderung';
    return 'Kein Treffer';
  }

  let stripColor = $derived(getStripColor());
  let statusLabel = $derived(getStatusLabel());
</script>

<div
  class="scout-card strip-{stripColor}"
  class:expanded
  class:deleting={busy === 'delete'}
  class:inactive={!scout.is_active}
  onclick={ontoggle}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ontoggle?.(); } }}
  role="button"
  tabindex="0"
  aria-expanded={expanded}
>
  <!-- Collapsed: Line 1 — name + location -->
  <div class="card-line1">
    <div class="line1-left">
      <h3 class="scout-name">{scout.name}</h3>
      {#if scout.location?.city}
        <span class="scout-location">{scout.location.city}</span>
      {/if}
    </div>
    <div class="line1-right">
      <span class="status-pill" class:active={scout.is_active}>
        {scout.is_active ? 'Aktiv' : 'Pausiert'}
      </span>
      <div class="card-actions">
        {#if confirmingDelete}
          <ConfirmStrip loading={busy === 'delete'} onconfirm={confirmDeleteAction} oncancel={cancelDelete} />
        {:else}
          {#if busy}
            <div class="action-slot"><Loading size="sm" label="" /></div>
          {:else}
            <button class="action-btn action-run" onclick={handleRun} title="Jetzt ausführen" type="button">
              <RefreshCw size={13} />
            </button>
            <button
              class="action-btn action-toggle"
              onclick={handleToggleActive}
              title={scout.is_active ? 'Scout pausieren' : 'Scout aktivieren'}
              type="button"
            >
              {#if scout.is_active}
                <Pause size={13} />
              {:else}
                <Play size={13} />
              {/if}
            </button>
          {/if}
          <button class="action-btn action-delete" onclick={initiateDelete} title="Scout löschen" type="button">
            <Trash2 size={13} />
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Collapsed: Line 2 — status + time -->
  <div class="card-line2">
    <span class="status-dot status-{stripColor}"></span>
    <span class="status-label">{statusLabel}</span>
    {#if scout.consecutive_failures > 0}
      <span class="failure-count">{scout.consecutive_failures}x Fehler</span>
    {/if}
    {#if scout.last_run_at}
      <span class="sep">&middot;</span>
      <span class="last-run">{formatRelativeTime(scout.last_run_at)}</span>
    {/if}
    <span class="chevron">
      {#if expanded}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
    </span>
  </div>

  <!-- Expanded: definition-list detail -->
  {#if expanded}
    <div class="card-detail">
      <dl class="detail-list">
        <div class="detail-row">
          <dt>{scout.scout_type === 'civic' ? 'Domain' : 'URL'}</dt>
          <dd class="detail-url">{scout.scout_type === 'civic' ? scout.root_domain : scout.url}</dd>
        </div>

        <div class="detail-row">
          <dt>Kriterien</dt>
          <dd>
            {#if scout.criteria}
              {scout.criteria}
            {:else}
              <span class="detail-muted">Jede Änderung</span>
            {/if}
          </dd>
        </div>

        <div class="detail-row">
          <dt>Frequenz</dt>
          <dd>{getFrequencyLabel(scout.frequency)}</dd>
        </div>

        {#if topicChips.length > 0}
          <div class="detail-row">
            <dt>Themen</dt>
            <dd class="detail-topics">
              {#each topicChips as chip}
                <span class="topic-chip">{chip}</span>
              {/each}
            </dd>
          </div>
        {/if}

        {#if scout.last_summary_text}
          <div class="detail-row">
            <dt>Zusammenfassung</dt>
            <dd class="detail-summary">{scout.last_summary_text}</dd>
          </div>
        {/if}

      </dl>
    </div>
  {/if}
</div>

<style>
  .scout-card {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 0.75rem 0.875rem;
    padding-left: calc(0.875rem + 3px);
    cursor: pointer;
    position: relative;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
  }

  /* 3px left-edge strip */
  .scout-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
  }

  .scout-card.strip-green::before { background: #22c55e; }
  .scout-card.strip-red::before { background: #ef4444; }
  .scout-card.strip-gray::before { background: #d1d5db; }

  .scout-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(234, 114, 110, 0.06);
  }

  .scout-card:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .scout-card.expanded { border-color: var(--color-primary); }
  .scout-card.deleting { opacity: 0.5; }

  /* Inactive scout: muted appearance */
  .scout-card.inactive {
    opacity: 0.7;
  }

  .scout-card.inactive::before {
    opacity: 0.4;
  }

  /* Line 1: name + location + actions */
  .card-line1 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .line1-left {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }

  .line1-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: 1.625rem;
  }

  .scout-name {
    font-size: var(--text-md);
    font-weight: 600;
    font-family: var(--font-display);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scout-location {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Status pill — visible at rest, fades on hover when actions appear */
  .status-pill {
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    transition: opacity var(--transition-base);
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  .status-pill:not(.active) {
    background: rgba(161, 145, 126, 0.12);
    color: var(--color-text-light);
  }

  .scout-card:hover .status-pill,
  .scout-card:focus-within .status-pill,
  .scout-card.expanded .status-pill {
    display: none;
  }

  /* Hover-only action buttons */
  .card-actions {
    display: none;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .scout-card:hover .card-actions,
  .scout-card:focus-within .card-actions,
  .scout-card.expanded .card-actions {
    display: flex;
  }

  .action-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.625rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.625rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-light);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .action-run:hover {
    border-color: #22c55e;
    color: #16a34a;
    background: rgba(34, 197, 94, 0.06);
  }

  .action-toggle:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.06);
  }

  .action-delete:hover {
    border-color: #ef4444;
    color: #dc2626;
    background: rgba(239, 68, 68, 0.06);
  }

  /* Line 2: status + time */
  .card-line2 {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-xs);
    color: var(--color-text-light);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.status-green { background: #22c55e; }
  .status-dot.status-red { background: #ef4444; }
  .status-dot.status-gray { background: #d1d5db; }

  .status-label {
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .failure-count {
    font-weight: 500;
    color: #dc2626;
  }

  .sep {
    opacity: 0.4;
  }

  .last-run {
    color: var(--color-text-light);
  }

  .chevron {
    margin-left: auto;
    display: flex;
    color: var(--color-text-light);
  }

  /* Expanded detail */
  .card-detail {
    padding-top: 0.625rem;
    margin-top: 0.25rem;
    border-top: 1px solid var(--color-border);
  }

  .detail-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-row {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .detail-row dt {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
  }

  .detail-row dd {
    margin: 0;
    font-size: var(--text-base-sm);
    line-height: 1.5;
    color: var(--color-text);
  }

  .detail-url {
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-muted {
    color: var(--color-text-light);
    font-style: italic;
  }

  .detail-topics {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .topic-chip {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.08);
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-full);
  }

  .detail-summary {
    color: var(--color-text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
