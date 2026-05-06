<script lang="ts">
  import { Check, Inbox } from 'lucide-svelte';
  import { EmptyState } from '../ui/primitives';
  import { UNIT_TYPE_LABELS, formatRelativeTime } from '../../lib/constants';
  import type { InformationUnit } from '../../lib/types';

  interface Props {
    units: InformationUnit[];
    selected: Set<string>;
    ontoggle: (id: string) => void;
    dimmed?: boolean;
    readonly?: boolean;
  }

  let { units, selected, ontoggle, dimmed = false, readonly = false }: Props = $props();

  let truncatedIds = $state(new Set<string>());
  let statementRefs = new Map<string, HTMLElement>();

  function bindStatement(node: HTMLElement, id: string) {
    statementRefs.set(id, node);
    checkTruncation(id, node);

    return {
      destroy() {
        statementRefs.delete(id);
      },
    };
  }

  function checkTruncation(id: string, node: HTMLElement) {
    requestAnimationFrame(() => {
      const next = new Set(truncatedIds);
      if (node.scrollHeight > node.clientHeight) {
        next.add(id);
      } else {
        next.delete(id);
      }
      truncatedIds = next;
    });
  }

  function formatDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  // Strip color by unit_type
  function getStripColor(type: string): string {
    switch (type) {
      case 'fact': return '#3b82f6';
      case 'event': return '#22c55e';
      case 'entity_update': return '#f59e0b';
      default: return '#d1d5db';
    }
  }

  // Text color matching strip
  function getTypeColor(type: string): string {
    switch (type) {
      case 'fact': return '#2563eb';
      case 'event': return '#16a34a';
      case 'entity_update': return '#d97706';
      default: return 'var(--color-text-muted)';
    }
  }

  function confidenceLabel(c: 'high' | 'medium' | 'low'): string {
    return c === 'high' ? 'KI-Zuordnung: hohes Vertrauen'
      : c === 'medium' ? 'KI-Zuordnung: mittleres Vertrauen'
      : 'KI-Zuordnung: niedriges Vertrauen';
  }
</script>

{#if units.length === 0}
  <EmptyState
    icon={Inbox}
    title="Keine Einheiten"
    description="Es wurden keine Informationseinheiten gefunden."
  />
{:else}
  <div class="units-list" class:dimmed>
    {#each units as unit (unit.id)}
      {@const isSelected = selected.has(unit.id)}
      <button
        type="button"
        class="unit-card"
        class:selected={isSelected}
        class:readonly
        onclick={() => {
          if (!readonly) ontoggle(unit.id);
        }}
        style="--strip-color: {getStripColor(unit.unit_type)}"
      >
        {#if isSelected && !readonly}
          <span class="check-mark"><Check size={10} strokeWidth={3} /></span>
        {/if}

        <!-- Type label as colored text -->
        <div class="unit-header">
          <span class="unit-type" style="color: {getTypeColor(unit.unit_type)}">
            {UNIT_TYPE_LABELS[unit.unit_type] || unit.unit_type}
          </span>
          {#if unit.village_confidence}
            <span
              class="confidence-dot confidence-{unit.village_confidence}"
              title={confidenceLabel(unit.village_confidence)}
              aria-label={confidenceLabel(unit.village_confidence)}
            ></span>
          {/if}
          {#if unit.review_required}
            <span class="review-pill" title="Gemeinde-Zuordnung unsicher — bitte prüfen">
              prüfen
            </span>
          {/if}
        </div>

        <!-- Statement: hero text -->
        <p
          class="unit-statement"
          class:truncated={truncatedIds.has(unit.id)}
          use:bindStatement={unit.id}
        >
          {unit.statement}
        </p>

        {#if unit.entities && unit.entities.length > 0}
          <div class="unit-entities">
            {#each unit.entities.slice(0, 3) as entity}
              <span class="entity-pill">{entity}</span>
            {/each}
            {#if unit.entities.length > 3}
              <span class="entity-overflow">+{unit.entities.length - 3}</span>
            {/if}
          </div>
        {/if}

        <div class="card-footer">
          {#if unit.source_url}
            <a
              class="source-link"
              href={unit.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onclick={(e) => e.stopPropagation()}
            >{formatDomain(unit.source_url)}</a>
          {:else}
            <span class="source-link">{unit.source_domain}</span>
          {/if}

          {#if unit.created_at}
            <span class="footer-sep">&middot;</span>
            <span>{formatRelativeTime(unit.created_at)}</span>
          {/if}

          {#if unit.similarity !== undefined}
            <span class="score-pill">{Math.round(unit.similarity * 100)}%</span>
          {/if}
        </div>
      </button>
    {/each}
  </div>
{/if}

<style>
  .units-list.dimmed {
    opacity: 0.5;
    pointer-events: none;
  }

  .units-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.625rem;
  }

  .unit-card {
    display: flex;
    flex-direction: column;
    padding: 0.75rem 0.875rem;
    padding-left: calc(0.875rem + 3px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    gap: 0.375rem;
    background: var(--color-surface);
    text-align: left;
    position: relative;
    transition: border-color var(--transition-base), background var(--transition-base), box-shadow var(--transition-base);
  }

  /* 3px left-edge strip */
  .unit-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: var(--strip-color);
  }

  .unit-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(234, 114, 110, 0.06);
  }

  .unit-card.readonly {
    cursor: default;
  }

  .unit-card.readonly:hover {
    border-color: var(--color-border);
    box-shadow: none;
  }

  .unit-card:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .unit-card.selected {
    border-color: var(--color-primary);
    background: rgba(234, 114, 110, 0.04);
  }

  .check-mark {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .unit-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Type label: colored text, no badge box */
  .unit-type {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .confidence-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .confidence-high {
    background: #16a34a;
  }

  .confidence-medium {
    background: #d97706;
  }

  .confidence-low {
    background: #9ca3af;
  }

  .review-pill {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #b45309;
    background: #fef3c7;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--radius-full);
    text-transform: lowercase;
  }

  .unit-statement {
    font-size: var(--text-md);
    line-height: 1.5;
    margin: 0;
    line-clamp: 4;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    position: relative;
  }

  .unit-statement.truncated::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.5em;
    background: linear-gradient(transparent, var(--color-surface));
    pointer-events: none;
  }

  .unit-card.selected .unit-statement.truncated::after {
    background: linear-gradient(transparent, rgba(254, 249, 249, 1));
  }

  /* Neutral micro entity pills */
  .unit-entities {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .entity-pill {
    font-size: var(--text-2xs);
    font-weight: 500;
    color: var(--color-text-muted);
    background: var(--color-surface-muted);
    padding: 0.0625rem 0.375rem;
    border-radius: var(--radius-full);
  }

  .entity-overflow {
    font-size: var(--text-2xs);
    color: var(--color-text-light);
    padding-left: 0.125rem;
  }

  .card-footer {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    margin-top: auto;
    padding-top: 0.25rem;
    font-size: var(--text-xs);
    color: var(--color-text-light);
  }

  .footer-sep {
    opacity: 0.4;
  }

  .source-link {
    color: var(--color-text-muted);
    text-decoration: none;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }

  .score-pill {
    margin-left: auto;
    padding: 0 0.375rem;
    background: var(--color-surface-muted);
    border-radius: var(--radius-full);
    font-weight: 500;
    font-size: var(--text-2xs);
  }
</style>
