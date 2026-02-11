<script lang="ts">
  import { UNIT_TYPE_LABELS } from '../../lib/constants';
  import type { InformationUnit } from '../../lib/types';

  interface Props {
    units: InformationUnit[];
    selected: Set<string>;
    ontoggle: (id: string) => void;
  }

  let { units, selected, ontoggle }: Props = $props();

  function formatDomain(domain: string): string {
    return domain.replace(/^www\./, '');
  }
</script>

{#if units.length === 0}
  <div class="empty-state">
    <p>Keine Informationseinheiten gefunden.</p>
  </div>
{:else}
  <div class="units-list">
    {#each units as unit (unit.id)}
      <button
        type="button"
        class="unit-card"
        class:selected={selected.has(unit.id)}
        onclick={() => ontoggle(unit.id)}
      >
        <p class="unit-statement">{unit.statement}</p>
        <div class="unit-meta">
          <span class="unit-type {unit.unit_type}">
            {UNIT_TYPE_LABELS[unit.unit_type] || unit.unit_type}
          </span>
          <span>{formatDomain(unit.source_domain)}</span>
          {#if unit.similarity !== undefined}
            <span>{Math.round(unit.similarity * 100)}% Relevanz</span>
          {/if}
        </div>
      </button>
    {/each}
  </div>
{/if}
