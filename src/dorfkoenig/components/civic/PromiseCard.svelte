<script lang="ts">
  import type { Promise } from '../../lib/types';
  import { civicApi } from '../../lib/api';

  interface Props {
    promise: Promise;
  }

  let { promise }: Props = $props();

  let updating = $state(false);

  const STATUS_OPTIONS = [
    { value: 'new', label: 'Neu' },
    { value: 'in_progress', label: 'In Bearbeitung' },
    { value: 'fulfilled', label: 'Erfüllt' },
    { value: 'broken', label: 'Gebrochen' },
  ] as const;

  function getDueDateColor(dueDate: string | null): string {
    if (!dueDate) return 'gray';
    const today = new Date();
    const due = new Date(dueDate);
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return 'red';
    if (daysUntil <= 30) return 'amber';
    return 'green';
  }

  async function handleStatusChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const newStatus = select.value;
    updating = true;
    try {
      await civicApi.promises.updateStatus(promise.id, newStatus);
    } catch (error) {
      console.error('Status update failed:', error);
      select.value = promise.status;
    } finally {
      updating = false;
    }
  }

  let dueDateColor = $derived(getDueDateColor(promise.due_date));
</script>

<div class="promise-card">
  <div class="promise-header">
    <p class="promise-text">{promise.promise_text}</p>
    <select
      class="status-select"
      value={promise.status}
      onchange={handleStatusChange}
      disabled={updating}
    >
      {#each STATUS_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

  {#if promise.context}
    <p class="promise-context">{promise.context}</p>
  {/if}

  <div class="promise-meta">
    {#if promise.due_date}
      <span class="due-pill due-{dueDateColor}">
        Frist: {promise.due_date}
      </span>
    {/if}
    {#if promise.meeting_date}
      <span class="meta-item">Sitzung: {promise.meeting_date}</span>
    {/if}
    {#if promise.source_url}
      <a href={promise.source_url} target="_blank" rel="noopener" class="meta-link">
        Quelle
      </a>
    {/if}
    {#if promise.date_confidence !== 'low'}
      <span class="confidence-badge confidence-{promise.date_confidence}">
        {promise.date_confidence === 'high' ? 'Sicher' : 'Ungefähr'}
      </span>
    {/if}
  </div>
</div>

<style>
  .promise-card {
    padding: 0.875rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .promise-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .promise-text {
    margin: 0;
    font-size: var(--text-base-sm);
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.5;
    flex: 1;
  }

  .status-select {
    font-size: var(--text-xs);
    padding: 0.1875rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .status-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .promise-context {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .promise-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .due-pill {
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-full);
  }

  .due-green { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
  .due-amber { background: rgba(245, 158, 11, 0.1); color: #d97706; }
  .due-red   { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
  .due-gray  { background: var(--color-surface-muted); color: var(--color-text-light); }

  .meta-item {
    font-size: var(--text-xs);
    color: var(--color-text-light);
  }

  .meta-link {
    font-size: var(--text-xs);
    color: var(--color-primary);
    text-decoration: none;
  }

  .meta-link:hover { text-decoration: underline; }

  .confidence-badge {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--radius-full);
  }

  .confidence-high { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
  .confidence-medium { background: rgba(245, 158, 11, 0.1); color: #d97706; }
</style>
