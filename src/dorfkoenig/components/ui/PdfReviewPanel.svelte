<script lang="ts">
  import type { NewspaperExtractedUnit, VillageConfidence } from '../../lib/types';
  import { villages } from '../../lib/villages';

  interface Props {
    units: NewspaperExtractedUnit[];
    selected: Set<string>;
    ontoggle: (uid: string) => void;
    onselectall: () => void;
    onselectnone: () => void;
  }

  let { units, selected, ontoggle, onselectall, onselectnone }: Props = $props();

  const VILLAGE_NAME_BY_ID = Object.fromEntries(villages.map((v) => [v.id, v.name]));

  function villageDisplay(unit: NewspaperExtractedUnit): string {
    if (!unit.location?.city) return 'Überregional';
    return VILLAGE_NAME_BY_ID[unit.location.city] ?? unit.location.city;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    } catch {
      return iso;
    }
  }

  function confidenceLabel(c: VillageConfidence | null): string {
    if (!c) return 'Keine KI-Zuordnung';
    return c === 'high' ? 'KI-Zuordnung: hohes Vertrauen'
      : c === 'medium' ? 'KI-Zuordnung: mittleres Vertrauen'
      : 'KI-Zuordnung: niedriges Vertrauen';
  }

  let selectedCount = $derived(selected.size);
  let allSelected = $derived(selectedCount === units.length && units.length > 0);
</script>

<div class="review-panel">
  <div class="review-header">
    <span class="review-count">
      {selectedCount} von {units.length} ausgewählt
    </span>
    <div class="review-bulk">
      <button type="button" class="bulk-link" onclick={onselectall} disabled={allSelected}>
        Alle auswählen
      </button>
      <span class="bulk-sep">·</span>
      <button type="button" class="bulk-link" onclick={onselectnone} disabled={selectedCount === 0}>
        Alle abwählen
      </button>
    </div>
  </div>

  <ul class="review-list">
    {#each units as unit (unit.uid)}
      {@const isChecked = selected.has(unit.uid)}
      <li class="review-row" class:unchecked={!isChecked}>
        <label class="review-label">
          <input
            type="checkbox"
            checked={isChecked}
            onchange={() => ontoggle(unit.uid)}
          />
          <div class="review-content">
            <p class="review-statement">{unit.statement}</p>
            <div class="review-meta">
              <span class="meta-village">{villageDisplay(unit)}</span>
              <span class="meta-sep">·</span>
              <span class="meta-date">{formatDate(unit.event_date)}</span>
              {#if unit.village_confidence}
                <span
                  class="confidence-dot confidence-{unit.village_confidence}"
                  title={confidenceLabel(unit.village_confidence)}
                  aria-label={confidenceLabel(unit.village_confidence)}
                ></span>
              {/if}
              {#if unit.review_required}
                <span class="review-pill" title="Gemeinde-Zuordnung unsicher">prüfen</span>
              {/if}
              {#if unit.date_confidence === 'unanchored'}
                <span class="review-pill date-pill" title="Datum nicht in der Quelle gefunden">📅 prüfen</span>
              {/if}
            </div>
          </div>
        </label>
      </li>
    {/each}
  </ul>
</div>

<style>
  .review-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    /* Inherit height from parent .modal-body flex chain — list scrolls inside,
       header and bulk-toggle row stay pinned. Works for 5 units or 50. */
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0 0.125rem;
  }

  .review-count {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .review-bulk {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .bulk-link {
    border: none;
    background: transparent;
    color: var(--color-primary, #ea726e);
    padding: 0;
    cursor: pointer;
    font: inherit;
    transition: color 0.15s;
  }

  .bulk-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .bulk-link:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }

  .bulk-sep {
    color: var(--color-text-muted);
  }

  .review-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
    padding-right: 0.25rem;
  }

  .review-row {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--color-surface);
    transition: background 0.15s, opacity 0.15s;
  }

  .review-row.unchecked {
    opacity: 0.55;
  }

  .review-row:hover {
    background: var(--color-surface-muted, #f9fafb);
  }

  .review-label {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    cursor: pointer;
  }

  .review-label input[type="checkbox"] {
    margin-top: 0.25rem;
    flex-shrink: 0;
    accent-color: var(--color-primary, #ea726e);
    cursor: pointer;
  }

  .review-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .review-statement {
    font-size: 0.875rem;
    line-height: 1.4;
    margin: 0;
    color: var(--color-text);
  }

  .review-meta {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    flex-wrap: wrap;
  }

  .meta-village {
    font-weight: 500;
    color: var(--color-text);
  }

  .meta-sep {
    color: var(--color-text-light, #9ca3af);
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
    border-radius: var(--radius-full, 9999px);
    text-transform: lowercase;
  }
</style>
