<script lang="ts">
  import { UNIT_TYPE_LABELS, formatRelativeTime } from '../../lib/constants';
  import type { InformationUnit } from '../../lib/types';

  interface Props {
    units: InformationUnit[];
    selected: Set<string>;
    ontoggle: (id: string) => void;
  }

  let { units, selected, ontoggle }: Props = $props();

  // Track which statements are truncated
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
    // Use requestAnimationFrame so layout has settled
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
  <div class="empty-state">
    <p>Keine Informationseinheiten gefunden.</p>
  </div>
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
        <div class="unit-badges">
          <span class="unit-type {unit.unit_type}">
            {UNIT_TYPE_LABELS[unit.unit_type] || unit.unit_type}
          </span>
          {#if unit.source_type?.startsWith('manual_')}
            <span class="source-badge manual">Manuell</span>
          {/if}
        </div>

        <!-- Statement with 4-line clamp -->
        <p
          class="unit-statement"
          class:truncated={truncatedIds.has(unit.id)}
          use:bindStatement={unit.id}
        >
          {unit.statement}
        </p>

        <!-- Entity chips -->
        {#if unit.entities && unit.entities.length > 0}
          <div class="unit-entities">
            {#each unit.entities.slice(0, 3) as entity}
              <span class="entity-chip">{entity}</span>
            {/each}
            {#if unit.entities.length > 3}
              <span class="entity-chip overflow">+{unit.entities.length - 3} mehr</span>
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
