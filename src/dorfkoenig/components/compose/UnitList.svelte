<script lang="ts">
  import { Check, Inbox } from 'lucide-svelte';
  import { Badge, EmptyState } from '../ui/primitives';
  import { UNIT_TYPE_LABELS, formatRelativeTime } from '../../lib/constants';
  import type { InformationUnit } from '../../lib/types';

  interface Props {
    units: InformationUnit[];
    selected: Set<string>;
    ontoggle: (id: string) => void;
  }

  let { units, selected, ontoggle }: Props = $props();

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
</script>

{#if units.length === 0}
  <EmptyState
    icon={Inbox}
    title="Keine Einheiten"
    description="Es wurden keine Informationseinheiten gefunden."
  />
{:else}
  <div class="units-list">
    {#each units as unit (unit.id)}
      {@const isSelected = selected.has(unit.id)}
      <button
        type="button"
        class="unit-card"
        class:selected={isSelected}
        onclick={() => ontoggle(unit.id)}
      >
        {#if isSelected}
          <span class="check-mark"><Check size={10} strokeWidth={3} /></span>
        {/if}

        <div class="unit-badges">
          <Badge variant={unit.unit_type}>
            {UNIT_TYPE_LABELS[unit.unit_type] || unit.unit_type}
          </Badge>
          {#if unit.source_type?.startsWith('manual_')}
            <Badge variant="manual">Manuell</Badge>
          {/if}
        </div>

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
              <Badge variant="neutral" size="sm">{entity}</Badge>
            {/each}
            {#if unit.entities.length > 3}
              <span class="entity-overflow">+{unit.entities.length - 3} mehr</span>
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
  .units-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.625rem;
  }

  .unit-card {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    gap: var(--spacing-sm);
    background: var(--color-surface);
    text-align: left;
    position: relative;
    transition: border-color var(--transition-base), background var(--transition-base), box-shadow var(--transition-base);
  }

  .unit-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(234, 114, 110, 0.08);
  }

  .unit-card:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .unit-card.selected {
    border-color: var(--color-primary);
    background: rgba(234, 114, 110, 0.06);
  }

  .check-mark {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    width: 18px;
    height: 18px;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .unit-badges {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .unit-statement {
    font-size: var(--text-md);
    line-height: 1.5;
    margin: 0;
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

  .unit-entities {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .entity-overflow {
    font-size: var(--text-2xs);
    color: var(--color-text-light);
    padding-left: 0.25rem;
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
    color: var(--color-text-light);
    opacity: 0.5;
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
