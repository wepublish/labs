<script lang="ts">
  import { processInlineMarkdown } from '../../bajour/utils';
  import { formatZurichGeneratedAt } from '../../supabase/functions/_shared/publication-calendar';
  import { unitsApi } from '../../lib/api';
  import type { Draft, InformationUnit } from '../../lib/types';
  import type { DraftBullet, QualityWarning, SelectionDiagnosticUnit, SelectionDiagnostics } from '../../bajour/types';

  interface Props {
    draft: Draft & {
      bullets?: DraftBullet[];
      notes_for_editor?: string[];
      quality_warnings?: QualityWarning[];
      selection_diagnostics?: SelectionDiagnostics | null;
      legacy_selected_unit_ids?: string[];
    };
    generatedAt?: string | null;
  }

  let { draft, generatedAt = null }: Props = $props();

  const reasonLabels: Record<string, string> = {
    fresh_sensitive: 'aktuell + sensibel',
    stale_sensitive: 'sensibel, aber alt',
    future_publication: 'Publikation in Zukunft',
    static_directory_fact: 'statische Info',
    supporting_fragment: 'Nebenfragment',
    cross_village_drift: 'andere Gemeinde',
    public_safety: 'Sicherheit',
    civic_utility: 'Gemeindenutzen',
    soft_filler: 'weiches Thema',
    today_event: 'Event heute',
    past_event: 'Event vorbei',
    far_future_event: 'weit voraus',
    too_early_event: 'noch zu früh',
    fresh: 'frisch',
    stale: 'alt',
    article_url: 'Artikel-Link',
    weak_url: 'schwache URL',
    low_village_confidence: 'Ort unsicher',
    high_village_confidence: 'Ort sicher',
    below_quality_threshold: 'Qualität tief',
    near_duplicate: 'Duplikat',
  };

  let selectedDiagnostics = $derived(getSelectedDiagnostics(draft.selection_diagnostics));
  let rejectedDiagnostics = $derived(getRejectedDiagnostics(draft.selection_diagnostics));
  let legacySelectedUnitIds = $derived(draft.legacy_selected_unit_ids ?? []);
  let legacySelectedUnitKey = $derived(legacySelectedUnitIds.join('|'));
  let showSelectionAudit = $derived(!!draft.selection_diagnostics || legacySelectedUnitIds.length > 0);
  let legacySelectedUnits = $state<InformationUnit[]>([]);
  let legacyMissingUnitIds = $state<string[]>([]);
  let legacyUnitsLoading = $state(false);
  let legacyUnitsError = $state('');
  let legacyUnitsRequestSeq = 0;

  // Process section content: render inline markdown, convert [source.ch] to pills, preserve line breaks.
  function renderContent(text: string): string {
    let html = processInlineMarkdown(text);
    // Convert source-ref spans into clickable-looking pills
    html = html.replace(
      /<span class="source-ref">\[([^\]]+)\]<\/span>/g,
      '<a class="source-pill" href="https://$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return html;
  }

  function getSelectedDiagnostics(diagnostics?: SelectionDiagnostics | null): SelectionDiagnosticUnit[] {
    if (!diagnostics) return [];
    if (diagnostics.selected_units && diagnostics.selected_units.length > 0) return diagnostics.selected_units;
    const selectedIds = new Set(diagnostics.selected_unit_ids ?? []);
    return (diagnostics.candidate_snapshot ?? []).filter((unit) => selectedIds.has(unit.id));
  }

  function getRejectedDiagnostics(diagnostics?: SelectionDiagnostics | null): SelectionDiagnosticUnit[] {
    if (!diagnostics) return [];
    if (diagnostics.rejected_top_units && diagnostics.rejected_top_units.length > 0) return diagnostics.rejected_top_units;
    const selectedIds = new Set(diagnostics.selected_unit_ids ?? []);
    return (diagnostics.candidate_snapshot ?? [])
      .filter((unit) => !selectedIds.has(unit.id))
      .slice(0, 10)
      .map((unit) => ({ ...unit, rejection_reason: 'not_selected' }));
  }

  function formatReason(reason: string): string {
    return reasonLabels[reason] ?? reason.replaceAll('_', ' ');
  }

  function rejectionLabel(unit: SelectionDiagnosticUnit): string {
    if (unit.rejection_reason === 'near_duplicate') return 'Duplikat entfernt';
    return 'Nicht in finaler Auswahl';
  }

  function shortUnitId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 8)}...` : id;
  }

  async function loadLegacySelectedUnits(ids: string[]): Promise<void> {
    const requestId = ++legacyUnitsRequestSeq;
    legacyUnitsLoading = true;
    legacyUnitsError = '';

    try {
      const batches: InformationUnit[][] = [];
      for (let index = 0; index < ids.length; index += 100) {
        const batchIds = ids.slice(index, index + 100);
        batches.push(
          await unitsApi.list({
            ids: batchIds,
            unused_only: false,
            limit: batchIds.length,
          })
        );
      }

      if (requestId !== legacyUnitsRequestSeq) return;

      const byId = new Map(batches.flat().map((unit) => [unit.id, unit]));
      const unresolvedIds = ids.filter((id) => !byId.has(id));
      if (unresolvedIds.length > 0) {
        const fallbackRows = await unitsApi.lookupByIds(unresolvedIds);
        for (const unit of fallbackRows) byId.set(unit.id, unit);
      }

      if (requestId !== legacyUnitsRequestSeq) return;

      legacySelectedUnits = ids
        .map((id) => byId.get(id))
        .filter((unit): unit is InformationUnit => !!unit);
      legacyMissingUnitIds = ids.filter((id) => !byId.has(id));
    } catch (err) {
      if (requestId !== legacyUnitsRequestSeq) return;
      legacySelectedUnits = [];
      legacyMissingUnitIds = ids;
      legacyUnitsError = (err as Error).message;
    } finally {
      if (requestId === legacyUnitsRequestSeq) {
        legacyUnitsLoading = false;
      }
    }
  }

  $effect(() => {
    const key = legacySelectedUnitKey;
    const ids = key ? key.split('|') : [];
    if (selectedDiagnostics.length > 0 || ids.length === 0) {
      legacySelectedUnits = [];
      legacyMissingUnitIds = [];
      legacyUnitsError = '';
      legacyUnitsLoading = false;
      return;
    }
    void loadLegacySelectedUnits(ids);
  });
</script>

<article class="document-content">
  <h1>{draft.title}</h1>
  {#if generatedAt}
    <p class="generated-at">Generiert: {formatZurichGeneratedAt(generatedAt)}</p>
  {/if}
  {#if (draft.quality_warnings && draft.quality_warnings.length > 0) || (draft.notes_for_editor && draft.notes_for_editor.length > 0)}
    <section class="quality-banner" aria-label="Qualitätswarnungen">
      <h2>Qualitätsprüfung</h2>
      <ul>
        {#each (draft.quality_warnings && draft.quality_warnings.length > 0 ? draft.quality_warnings.map((w) => w.message) : draft.notes_for_editor || []).slice(0, 5) as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if draft.headline}
    <p class="lede">{draft.headline}</p>
  {/if}

  {#if draft.bullets && draft.bullets.length > 0}
    <section class="bullet-digest" aria-label="Entwurf">
      {#each draft.bullets as bullet}
        <article class="digest-bullet">
          <span class="bullet-emoji" aria-hidden="true">{bullet.emoji}</span>
          <div class="bullet-body">
            <p>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processInlineMarkdown -->
              {@html renderContent(bullet.text)}
            </p>
            {#if bullet.source_domain || bullet.article_url}
              <div class="bullet-source">
                {#if bullet.article_url}
                  <a href={bullet.article_url} target="_blank" rel="noopener noreferrer">
                    {bullet.source_domain || 'Quelle'}
                  </a>
                {:else}
                  <span>{bullet.source_domain}</span>
                {/if}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </section>
  {/if}

  {#if draft.sections && draft.sections.length > 0}
    {#each draft.sections as section}
      <section class="draft-section">
        {#if section.heading}
          <h2>{section.heading}</h2>
        {/if}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processInlineMarkdown -->
        <p>{@html renderContent(section.content)}</p>
      </section>
    {/each}
  {/if}

  {#if draft.gaps && draft.gaps.length > 0}
    <section class="gaps-section">
      <h2>Informationslücken</h2>
      <ul>
        {#each draft.gaps as gap}
          <li>{gap}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if draft.notes_for_editor && draft.notes_for_editor.length > 0}
    <section class="gaps-section">
      <h2>Hinweise für die Redaktion</h2>
      <ul>
        {#each draft.notes_for_editor as note}
          <li>{note}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if draft.sources && draft.sources.length > 0}
    <section class="sources-section">
      <h2>Quellen</h2>
      <div class="source-pills">
        {#each draft.sources as source}
          <a class="source-pill" href={source.url} target="_blank" rel="noopener noreferrer">
            {source.title || source.domain}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if showSelectionAudit}
    <section class="selection-audit">
      <h2>Auswahl-Ranking</h2>
      <div class="audit-columns">
        <div class="audit-column">
          <h3>Ausgewählt</h3>
          {#if selectedDiagnostics.length === 0}
            {#if legacySelectedUnitIds.length > 0}
              {#if legacyUnitsLoading}
                <p class="audit-empty">Ausgewählte Einheiten laden...</p>
              {:else if legacyUnitsError}
                <p class="audit-empty">Ausgewählte Einheiten konnten nicht geladen werden: {legacyUnitsError}</p>
              {:else if legacySelectedUnits.length > 0}
                <div class="audit-list">
                  {#each legacySelectedUnits as unit (unit.id)}
                    <article class="audit-row selected">
                      <div class="audit-row-head">
                        <span class="audit-score">–</span>
                        {#if unit.source_domain}
                          <span class="audit-source">{unit.source_domain}</span>
                        {/if}
                      </div>
                      <p>{unit.statement}</p>
                    </article>
                  {/each}
                </div>
              {:else}
                <p class="audit-empty">Ausgewählte Einheiten konnten nicht rekonstruiert werden.</p>
              {/if}
              {#if legacyMissingUnitIds.length > 0}
                <p class="audit-empty audit-missing">
                  Nicht mehr auffindbar: {legacyMissingUnitIds.map(shortUnitId).join(', ')}
                </p>
              {/if}
            {:else}
              <p class="audit-empty">Keine Rankingdetails gespeichert.</p>
            {/if}
          {:else}
            <div class="audit-list">
              {#each selectedDiagnostics as unit}
                <article class="audit-row selected">
                  <div class="audit-row-head">
                    <span class="audit-score">{unit.score ?? '–'}</span>
                    {#if unit.mandatory}
                      <span class="audit-flag">Pflicht</span>
                    {/if}
                    {#if unit.source_domain}
                      <span class="audit-source">{unit.source_domain}</span>
                    {/if}
                  </div>
                  <p>{unit.statement}</p>
                  {#if unit.reasons && unit.reasons.length > 0}
                    <div class="reason-pills">
                      {#each unit.reasons as reason}
                        <span>{formatReason(reason)}</span>
                      {/each}
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </div>

        <div class="audit-column">
          <h3>Nicht ausgewählt</h3>
          {#if rejectedDiagnostics.length === 0}
            <p class="audit-empty">
              {draft.selection_diagnostics
                ? 'Keine abgelehnten Kandidaten gespeichert.'
                : 'Abgelehnte Kandidaten wurden für diesen Entwurf nicht aufgezeichnet.'}
            </p>
          {:else}
            <div class="audit-list">
              {#each rejectedDiagnostics as unit}
                <article class="audit-row rejected">
                  <div class="audit-row-head">
                    <span class="audit-score">{unit.score ?? '–'}</span>
                    <span class="audit-flag muted">{rejectionLabel(unit)}</span>
                    {#if unit.source_domain}
                      <span class="audit-source">{unit.source_domain}</span>
                    {/if}
                  </div>
                  <p>{unit.statement}</p>
                  {#if unit.matched_statement}
                    <p class="matched-line">Ähnlich wie: {unit.matched_statement}</p>
                  {/if}
                  {#if unit.reasons && unit.reasons.length > 0}
                    <div class="reason-pills">
                      {#each unit.reasons as reason}
                        <span>{formatReason(reason)}</span>
                      {/each}
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      {#if draft.selection_diagnostics?.selection_response_preview}
        <details class="model-preview">
          <summary>Auswahlantwort anzeigen</summary>
          <pre>{draft.selection_diagnostics.selection_response_preview}</pre>
        </details>
      {/if}
    </section>
  {/if}
</article>

<style>
  .document-content {
    padding: var(--spacing-xl) 2.5rem;
    font-family: var(--font-body);
  }

  .document-content h1 {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1.25;
    color: var(--color-text);
    margin: 0 0 var(--spacing-md) 0;
  }

  .generated-at {
    margin: -0.25rem 0 var(--spacing-md);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .document-content .lede {
    font-size: var(--text-lg);
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0 0 var(--spacing-xl) 0;
    padding-bottom: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    white-space: pre-line;
  }

  .quality-banner {
    margin: 0 0 var(--spacing-lg);
    padding: var(--spacing-md);
    border: 1px solid #f59e0b;
    border-left: 3px solid #d97706;
    border-radius: var(--radius-sm);
    background: #fffbeb;
  }

  .quality-banner h2 {
    color: #92400e;
    margin-bottom: 0.5rem;
  }

  .quality-banner ul {
    margin: 0;
    padding-left: 1.125rem;
    color: #78350f;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .document-content h2 {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    margin: 0 0 0.75rem 0;
  }

  .draft-section {
    margin-bottom: var(--spacing-lg);
  }

  .draft-section h2 {
    font-size: var(--text-base-sm);
    letter-spacing: 0.06em;
    color: var(--color-text);
    margin: 0 0 var(--spacing-sm) 0;
  }

  .draft-section p {
    font-size: var(--text-md);
    line-height: 1.7;
    color: var(--color-text);
    margin: 0;
    white-space: pre-line;
  }

  .bullet-digest {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    margin-bottom: var(--spacing-xl);
  }

  .digest-bullet {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .bullet-emoji {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    font-size: 1.25rem;
    line-height: 1.5;
  }

  .bullet-body {
    min-width: 0;
  }

  .bullet-body p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-md);
    line-height: 1.7;
    white-space: pre-line;
  }

  .bullet-source {
    display: flex;
    margin-top: 0.5rem;
  }

  .bullet-source a,
  .bullet-source span {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-full);
    background: rgba(234, 114, 110, 0.08);
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    text-decoration: none;
  }

  .bullet-source a:hover {
    background: rgba(234, 114, 110, 0.15);
  }

  /* Inline source pills */
  .document-content :global(.source-pill) {
    display: inline-flex;
    align-items: center;
    padding: 0.0625rem 0.5rem;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.08);
    border-radius: var(--radius-full);
    text-decoration: none;
    white-space: nowrap;
    vertical-align: baseline;
    transition: background var(--transition-base);
  }

  .document-content :global(.source-pill:hover) {
    background: rgba(234, 114, 110, 0.15);
    text-decoration: none;
  }

  .document-content :global(.inline-link) {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }

  .document-content :global(.inline-link:hover) {
    color: var(--color-primary-dark);
  }

  .gaps-section {
    margin-bottom: var(--spacing-xl);
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-warning-dark);
    border-radius: var(--radius-sm);
  }

  .gaps-section ul { margin: 0; padding: 0; list-style: none; }

  .gaps-section li {
    padding-left: var(--spacing-md);
    font-size: var(--text-md);
    line-height: 1.6;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .sources-section {
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .source-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .source-pills .source-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.625rem;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.08);
    border-radius: var(--radius-full);
    text-decoration: none;
    transition: background var(--transition-base);
  }

  .source-pills .source-pill:hover {
    background: rgba(234, 114, 110, 0.15);
  }

  .selection-audit {
    margin-top: var(--spacing-xl);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .selection-audit > h2 {
    margin-bottom: var(--spacing-md);
  }

  .audit-columns {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .audit-column h3 {
    margin: 0 0 var(--spacing-sm);
    color: var(--color-text);
    font-size: var(--text-base-sm);
    font-weight: 700;
  }

  .audit-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .audit-row {
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-left-width: 3px;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }

  .audit-row.selected {
    border-left-color: var(--color-success, #27ae60);
  }

  .audit-row.rejected {
    border-left-color: var(--color-text-muted);
  }

  .audit-row-head {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    margin-bottom: 0.375rem;
  }

  .audit-score {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 1.25rem;
    padding: 0 0.375rem;
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .audit-flag,
  .audit-source {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-primary);
  }

  .audit-flag.muted,
  .audit-source {
    color: var(--color-text-muted);
  }

  .audit-row p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .audit-row .matched-line {
    margin-top: 0.375rem;
    color: var(--color-text-muted);
  }

  .reason-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  .reason-pills span {
    display: inline-flex;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-full);
    background: var(--color-background);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .audit-empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .audit-missing {
    margin-top: 0.5rem;
  }

  .model-preview {
    margin-top: var(--spacing-md);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .model-preview summary {
    cursor: pointer;
    font-weight: 600;
  }

  .model-preview pre {
    margin: 0.5rem 0 0;
    max-height: 12rem;
    overflow: auto;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    white-space: pre-wrap;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
  }

</style>
