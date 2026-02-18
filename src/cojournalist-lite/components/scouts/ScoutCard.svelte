<script lang="ts">
  import { Card, Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { formatDate, FREQUENCY_OPTIONS } from '../../lib/constants';
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
    return FREQUENCY_OPTIONS.find((f) => f.value === value)?.label || value;
  }

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
    // criteria_matched === false
    if (changeStatus === 'same') {
      return { text: 'Keine Änderung', variant: 'neutral' };
    }
    return { text: 'Kein Treffer', variant: 'error' };
  }

  function getExecutionDisplay(): { text: string; variant: 'success' | 'error' | 'pending' } {
    const status = scout.last_execution_status;
    if (!status) return { text: 'Ausstehend', variant: 'pending' };
    if (status === 'completed') return { text: 'OK', variant: 'success' };
    if (status === 'failed') return { text: 'Fehlgeschlagen', variant: 'error' };
    return { text: 'Läuft...', variant: 'pending' };
  }

  let criteriaDisplay = $derived(getCriteriaDisplay());
  let executionDisplay = $derived(getExecutionDisplay());
</script>

<div
  class="scout-card"
  class:expanded
  class:deleting
  onclick={ontoggle}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && ontoggle?.()}
  role="button"
  tabindex="0"
  aria-expanded={expanded}
>
  <div class="scout-card-header">
    <div class="scout-header-info">
      <h3 class="scout-name">{scout.name}</h3>
      <span class="status-badge" class:active={scout.is_active} class:inactive={!scout.is_active}>
        {scout.is_active ? 'Aktiv' : 'Inaktiv'}
      </span>
    </div>
    <div class="card-actions">
      {#if running}
        <div class="run-spinner">
          <span class="spinner-small"></span>
        </div>
      {:else}
        <button class="card-icon-btn run-btn" onclick={handleRun} title="Jetzt ausführen">
          &#9654;
        </button>
      {/if}
      {#if confirmingDelete}
        <div class="confirm-strip" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="toolbar" tabindex="-1">
          {#if deleting}
            <span class="spinner-small"></span>
          {:else}
            <button class="action-btn cancel-btn" onclick={cancelDelete}>&times;</button>
            <span class="confirm-label">Löschen?</span>
            <button class="action-btn confirm-btn" onclick={confirmDeleteAction}>&#10003;</button>
          {/if}
        </div>
      {:else}
        <button class="card-icon-btn trash-btn" onclick={initiateDelete} title="Scout löschen">
          &#128465;
        </button>
      {/if}
    </div>
  </div>

  <div class="scout-card-body">
    <p class="scout-url">{scout.url}</p>
    <div class="scout-meta">
      {#if scout.location?.city}
        <span class="meta-item">📍 {scout.location.city}</span>
      {/if}
      <span class="meta-item">🔄 {getFrequencyLabel(scout.frequency)}</span>
      {#if scout.consecutive_failures > 0}
        <span class="meta-item failures">⚠ {scout.consecutive_failures} Fehler</span>
      {/if}
    </div>
    {#if scout.criteria}
      <p class="scout-criteria">{scout.criteria}</p>
    {:else}
      <p class="scout-criteria muted">Alle Änderungen</p>
    {/if}
  </div>

  {#if expanded && scout.last_summary_text}
    <div class="scout-expanded">
      <p class="expanded-summary">{scout.last_summary_text}</p>
    </div>
  {/if}

  <div class="scout-card-footer">
    <div class="status-badges">
      <span class="status-pill status-pill-{executionDisplay.variant}">
        <span class="status-dot"></span>
        {executionDisplay.text}
      </span>
      <span class="status-pill status-pill-{criteriaDisplay.variant}">
        <span class="status-dot"></span>
        {criteriaDisplay.text}
      </span>
    </div>
    <span class="last-run-text">
      {formatDate(scout.last_run_at)}
    </span>
  </div>
</div>

<style>
  .scout-card {
    background: var(--color-surface, white);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-md, 0.5rem);
    padding: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .scout-card:hover {
    border-color: var(--color-primary, #6366f1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .scout-card.expanded {
    border-color: var(--color-primary, #6366f1);
  }

  .scout-card.deleting {
    opacity: 0.5;
  }

  .scout-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }

  .scout-header-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .scout-name {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .status-badge.active {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  .status-badge.inactive {
    background: rgba(156, 163, 175, 0.15);
    color: #6b7280;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .card-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    background: transparent;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
  }

  .run-btn:hover {
    background: #f0fdf4;
    color: #16a34a;
  }

  .trash-btn:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .run-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid #e5e7eb;
    border-top-color: var(--color-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .confirm-strip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .confirm-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #b91c1c;
    text-transform: uppercase;
    padding: 0 0.25rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .cancel-btn {
    background: white;
    color: #6b7280;
  }

  .cancel-btn:hover {
    background: #f9fafb;
    color: #374151;
  }

  .confirm-btn {
    background: #dc2626;
    color: white;
  }

  .confirm-btn:hover {
    background: #b91c1c;
  }

  .scout-card-body {
    margin-bottom: 0.5rem;
  }

  .scout-url {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0 0 0.375rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scout-meta {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.375rem;
  }

  .meta-item {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
  }

  .meta-item.failures {
    color: var(--color-danger, #dc2626);
  }

  .scout-criteria {
    font-size: 0.8125rem;
    color: var(--color-text, #374151);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .scout-criteria.muted {
    color: var(--color-text-muted, #9ca3af);
    font-style: italic;
  }

  .scout-expanded {
    padding: 0.75rem 0;
    border-top: 1px solid var(--color-border, #f3f4f6);
    margin-bottom: 0.5rem;
  }

  .expanded-summary {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #4b5563;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .scout-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #f3f4f6);
  }

  .status-badges {
    display: flex;
    gap: 0.375rem;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 500;
    background: #f3f4f6;
    color: #6b7280;
    border-radius: 9999px;
  }

  .status-pill-success {
    background: #dcfce7;
    color: #15803d;
  }

  .status-pill-error {
    background: #fee2e2;
    color: #b91c1c;
  }

  .status-pill-neutral {
    background: #f3f4f6;
    color: #6b7280;
  }

  .status-pill-pending {
    background: #f3f4f6;
    color: #6b7280;
  }

  .status-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 9999px;
    background: currentColor;
  }

  .last-run-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }
</style>
