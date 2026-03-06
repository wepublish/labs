<script lang="ts">
  import { Trash2, Play, ChevronDown, ChevronUp } from 'lucide-svelte';
  import { Loading } from '@shared/components';
  import { StatusPill, IconButton, ConfirmStrip, Badge } from '../ui/primitives';
  import { scouts } from '../../stores/scouts';
  import { formatDate, FREQUENCY_OPTIONS_EXTENDED } from '../../lib/constants';
  import type { Scout } from '../../lib/types';

  interface Props {
    scout: Scout;
    expanded?: boolean;
    ontoggle?: () => void;
  }

  let { scout, expanded = false, ontoggle }: Props = $props();

  let running = $state(false);
  let deleting = $state(false);
  let confirmingDelete = $state(false);

  async function handleRun(e: Event) {
    e.stopPropagation();
    running = true;
    try {
      await scouts.run(scout.id);
      await scouts.load();
    } catch (error) {
      console.error('Run failed:', error);
    } finally {
      running = false;
    }
  }

  function initiateDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = true;
  }

  function cancelDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = false;
  }

  async function confirmDeleteAction(e: Event) {
    e.stopPropagation();
    deleting = true;
    try {
      await scouts.delete(scout.id);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      deleting = false;
      confirmingDelete = false;
    }
  }

  function getFrequencyLabel(value: string): string {
    return FREQUENCY_OPTIONS_EXTENDED.find((f) => f.value === value)?.label || value;
  }

  let topicChips = $derived(
    scout.topic
      ? scout.topic.split(',').map(t => t.trim()).filter(Boolean)
      : []
  );

  interface CriteriaDisplay {
    text: string;
    variant: 'success' | 'error' | 'neutral' | 'pending';
  }

  function getCriteriaDisplay(): CriteriaDisplay {
    const status = scout.last_criteria_matched;
    const changeStatus = scout.last_change_status;

    if (status === undefined || status === null) {
      return { text: 'Ausstehend', variant: 'pending' };
    }
    if (status === true) {
      return { text: 'Treffer', variant: 'success' };
    }
    if (changeStatus === 'same') {
      return { text: 'Keine Anderung', variant: 'neutral' };
    }
    return { text: 'Kein Treffer', variant: 'error' };
  }

  function getExecutionDisplay(): { text: string; variant: 'success' | 'error' | 'pending' } {
    const status = scout.last_execution_status;
    if (!status) return { text: 'Ausstehend', variant: 'pending' };
    if (status === 'completed') return { text: 'OK', variant: 'success' };
    if (status === 'failed') return { text: 'Fehlgeschlagen', variant: 'error' };
    return { text: 'Lauft...', variant: 'pending' };
  }

  let criteriaDisplay = $derived(getCriteriaDisplay());
  let executionDisplay = $derived(getExecutionDisplay());
</script>

<div
  class="scout-card"
  class:expanded
  class:deleting
  onclick={ontoggle}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ontoggle?.(); } }}
  role="button"
  tabindex="0"
  aria-expanded={expanded}
>
  <!-- Header -->
  <div class="card-header">
    <div class="header-left">
      <h3 class="scout-name">{scout.name}</h3>
      <span class="chevron">
        {#if expanded}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
      </span>
    </div>
    <div class="card-actions">
      {#if running}
        <div class="action-slot"><Loading size="sm" label="" /></div>
      {:else}
        <IconButton variant="success" onclick={handleRun} title="Jetzt ausfuhren"><Play size={13} /></IconButton>
      {/if}
      {#if confirmingDelete}
        <ConfirmStrip loading={deleting} onconfirm={confirmDeleteAction} oncancel={cancelDelete} />
      {:else}
        <IconButton variant="danger" onclick={initiateDelete} title="Scout loschen"><Trash2 size={14} /></IconButton>
      {/if}
    </div>
  </div>

  <!-- URL -->
  <p class="scout-url">{scout.url}</p>

  <!-- Meta -->
  <div class="card-meta">
    {#if scout.location?.city}
      <Badge variant="neutral">📍 {scout.location.city}</Badge>
    {/if}
    {#each topicChips as chip}
      <Badge variant="neutral"><span class="topic-tint">{chip}</span></Badge>
    {/each}
    <Badge variant="neutral">🔄 {getFrequencyLabel(scout.frequency)}</Badge>
    {#if scout.consecutive_failures > 0}
      <Badge variant="error">⚠ {scout.consecutive_failures} Fehler</Badge>
    {/if}
  </div>

  <!-- Criteria -->
  <div class="card-criteria">
    <span class="section-label">Kriterien</span>
    {#if scout.criteria}
      <p class="criteria-text">{scout.criteria}</p>
    {:else}
      <p class="criteria-text muted">Jede Anderung</p>
    {/if}
  </div>

  <!-- Expanded: last summary -->
  {#if expanded && scout.last_summary_text}
    <div class="card-expanded">
      <span class="section-label">Letzte Zusammenfassung</span>
      <p class="expanded-summary">{scout.last_summary_text}</p>
    </div>
  {/if}

  <!-- Footer -->
  <div class="card-footer">
    <div class="status-badges">
      <StatusPill variant={executionDisplay.variant}>{executionDisplay.text}</StatusPill>
      <StatusPill variant={criteriaDisplay.variant}>{criteriaDisplay.text}</StatusPill>
    </div>
    <span class="last-run-text">{formatDate(scout.last_run_at)}</span>
  </div>
</div>

<style>
  .scout-card {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    cursor: pointer;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
  }

  .scout-card:hover {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-sm);
  }

  .scout-card.expanded { border-color: var(--color-primary); }
  .scout-card.deleting { opacity: 0.5; }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 0;
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

  .chevron { color: var(--color-text-light); display: flex; }

  .card-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  .action-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
  }

  .scout-url {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .topic-tint {
    color: var(--color-primary);
    font-weight: 500;
  }

  .section-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-light);
  }

  .card-criteria {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
  }

  .criteria-text {
    font-size: var(--text-base-sm);
    line-height: 1.5;
    color: var(--color-text);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .criteria-text.muted {
    color: var(--color-text-light);
    font-style: italic;
  }

  .card-expanded {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--color-border);
  }

  .expanded-summary {
    font-size: var(--text-base-sm);
    line-height: 1.5;
    color: var(--color-text-muted);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.625rem;
    border-top: 1px solid var(--color-border);
  }

  .status-badges {
    display: flex;
    gap: 0.375rem;
  }

  .last-run-text {
    font-size: var(--text-xs);
    color: var(--color-text-light);
  }
</style>
