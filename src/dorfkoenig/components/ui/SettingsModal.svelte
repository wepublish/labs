<script lang="ts">
  import { X, Settings as SettingsIcon } from 'lucide-svelte';
  import { Button, Loading } from '@shared/components';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { settingsApi, ApiClientError } from '../../lib/api';
  import type { SelectionRankingConfig, SelectionRankingReasonKey } from '../../bajour/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  type PromptState = {
    loaded: boolean;
    content: string;
    saving: boolean;
    error: string | null;
    savedFlashTimer: ReturnType<typeof setTimeout> | null;
    justSaved: boolean;
  };

  function makePromptState(): PromptState {
    return {
      loaded: false,
      content: '',
      saving: false,
      error: null,
      savedFlashTimer: null,
      justSaved: false,
    };
  }

  const MAX_UNITS_MIN = 3;
  const MAX_UNITS_MAX = 50;

  const rankingReasons: Array<{ key: SelectionRankingReasonKey; label: string }> = [
    { key: 'fresh_sensitive', label: 'Aktuelle sensible Meldung' },
    { key: 'stale_sensitive', label: 'Veraltete sensible Meldung' },
    { key: 'future_publication', label: 'Publikation liegt in der Zukunft' },
    { key: 'static_directory_fact', label: 'Statische Kontakt-/Adressinfo' },
    { key: 'supporting_fragment', label: 'Nur Nebenfragment' },
    { key: 'cross_village_drift', label: 'Andere Gemeinde erwähnt' },
    { key: 'public_safety', label: 'Polizei, Feuerwehr, Unfall' },
    { key: 'civic_utility', label: 'Gemeinde, Politik, Infrastruktur' },
    { key: 'soft_filler', label: 'Weiches Vereins-/Füllthema' },
    { key: 'today_event', label: 'Event am Erscheinungstag' },
    { key: 'past_event', label: 'Event ist vorbei' },
    { key: 'far_future_event', label: 'Event zu weit in der Zukunft' },
    { key: 'too_early_event', label: 'Event noch zu früh' },
    { key: 'fresh', label: 'Frisch publiziert' },
    { key: 'stale', label: 'Älter als 7 Tage' },
    { key: 'article_url', label: 'Konkrete Artikel-URL' },
    { key: 'weak_url', label: 'Schwache Quelle/Homepage' },
    { key: 'low_village_confidence', label: 'Unsichere Ortszuordnung' },
    { key: 'high_village_confidence', label: 'Sichere Ortszuordnung' },
    { key: 'below_quality_threshold', label: 'Unter Qualitätsgrenze' },
  ];

  const DEFAULT_RANKING_CONFIG: SelectionRankingConfig = {
    weights: {
      fresh_sensitive: 45,
      stale_sensitive: -80,
      future_publication: -80,
      static_directory_fact: -55,
      supporting_fragment: -70,
      cross_village_drift: -60,
      public_safety: 35,
      civic_utility: 25,
      soft_filler: -25,
      today_event: 30,
      past_event: -40,
      far_future_event: -30,
      too_early_event: -55,
      fresh: 20,
      stale: -35,
      article_url: 15,
      weak_url: -25,
      low_village_confidence: -60,
      high_village_confidence: 10,
      below_quality_threshold: -40,
    },
    mandatoryScore: 95,
    composeStrictMinScore: 70,
    composeThinMinScore: 25,
    weakUrlStrictMinScore: 115,
    weakUrlThinMinScore: 80,
  };

  const thresholdKeys = [
    'mandatoryScore',
    'composeStrictMinScore',
    'composeThinMinScore',
    'weakUrlStrictMinScore',
    'weakUrlThinMinScore',
  ] as const;

  let select = $state(makePromptState());
  let compose = $state(makePromptState());
  let pageError = $state<string | null>(null);
  let loaded = $state(false);

  let ranking = $state({
    config: null as SelectionRankingConfig | null,
    defaultConfig: null as SelectionRankingConfig | null,
    saving: false,
    error: null as string | null,
    savedFlashTimer: null as ReturnType<typeof setTimeout> | null,
    justSaved: false,
  });

  let maxUnits = $state({
    value: 20,
    saving: false,
    error: null as string | null,
    savedFlashTimer: null as ReturnType<typeof setTimeout> | null,
    justSaved: false,
  });

  // Load (and reload) when the modal opens.
  $effect(() => {
    if (!open) return;
    loaded = false;
    pageError = null;
    select = makePromptState();
    compose = makePromptState();
    maxUnits.value = 20;
    maxUnits.error = null;
    maxUnits.justSaved = false;
    ranking.config = null;
    ranking.defaultConfig = null;
    ranking.error = null;
    ranking.justSaved = false;

    Promise.all([
      settingsApi.getSelectPrompt(),
      settingsApi.getSelectionRanking(),
      settingsApi.getComposePrompt(),
      settingsApi.getMaxUnits(),
    ])
      .then(([s, r, c, m]) => {
        select.content = s.prompt;
        select.loaded = true;
        ranking.config = normalizeRankingConfig((r as { config?: unknown }).config);
        ranking.defaultConfig = normalizeRankingConfig((r as { default_config?: unknown }).default_config);
        if (!isRankingConfig((r as { config?: unknown }).config)) {
          ranking.error = 'Ranking-Antwort konnte nicht gelesen werden; Standardwerte werden angezeigt.';
        }
        compose.content = c.prompt;
        compose.loaded = true;
        maxUnits.value = m.value;
        loaded = true;
      })
      .catch((err) => {
        pageError = err instanceof Error ? err.message : 'Fehler beim Laden der Einstellungen';
        loaded = true;
      });
  });

  function flashSaved(state: PromptState) {
    state.justSaved = true;
    if (state.savedFlashTimer) clearTimeout(state.savedFlashTimer);
    state.savedFlashTimer = setTimeout(() => { state.justSaved = false; }, 2000);
  }

  function flashMaxUnitsSaved() {
    maxUnits.justSaved = true;
    if (maxUnits.savedFlashTimer) clearTimeout(maxUnits.savedFlashTimer);
    maxUnits.savedFlashTimer = setTimeout(() => { maxUnits.justSaved = false; }, 2000);
  }

  function flashRankingSaved() {
    ranking.justSaved = true;
    if (ranking.savedFlashTimer) clearTimeout(ranking.savedFlashTimer);
    ranking.savedFlashTimer = setTimeout(() => { ranking.justSaved = false; }, 2000);
  }

  function cloneRankingConfig(config: SelectionRankingConfig): SelectionRankingConfig {
    return {
      ...config,
      weights: { ...config.weights },
    };
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isRankingConfig(value: unknown): value is SelectionRankingConfig {
    if (!isRecord(value) || !isRecord(value.weights)) return false;
    const weights = value.weights as Record<string, unknown>;
    const hasWeights = rankingReasons.every(({ key }) => {
      const raw = weights[key];
      return typeof raw === 'number' && Number.isFinite(raw);
    });
    const hasThresholds = thresholdKeys.every((key) => {
      const raw = value[key];
      return typeof raw === 'number' && Number.isFinite(raw);
    });
    return hasWeights && hasThresholds;
  }

  function normalizeRankingConfig(value: unknown): SelectionRankingConfig {
    const config = cloneRankingConfig(DEFAULT_RANKING_CONFIG);
    if (!isRecord(value)) return config;

    if (isRecord(value.weights)) {
      for (const { key } of rankingReasons) {
        const raw = value.weights[key];
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          config.weights[key] = Math.round(raw);
        }
      }
    }

    for (const key of thresholdKeys) {
      const raw = value[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        config[key] = Math.round(raw);
      }
    }

    return config;
  }

  async function savePrompt(
    state: PromptState,
    put: (content: string) => Promise<{ prompt: string }>,
  ) {
    state.error = null;
    state.saving = true;
    try {
      const result = await put(state.content);
      state.content = result.prompt;
      flashSaved(state);
    } catch (err) {
      state.error = err instanceof ApiClientError ? err.message : 'Speichern fehlgeschlagen';
    } finally {
      state.saving = false;
    }
  }

  async function resetPrompt(
    state: PromptState,
    del: () => Promise<{ prompt: string }>,
  ) {
    state.error = null;
    state.saving = true;
    try {
      const result = await del();
      state.content = result.prompt;
      flashSaved(state);
    } catch (err) {
      state.error = err instanceof ApiClientError ? err.message : 'Zurücksetzen fehlgeschlagen';
    } finally {
      state.saving = false;
    }
  }

  async function saveMaxUnits() {
    maxUnits.error = null;
    maxUnits.saving = true;
    try {
      const result = await settingsApi.putMaxUnits(maxUnits.value);
      maxUnits.value = result.value;
      flashMaxUnitsSaved();
    } catch (err) {
      maxUnits.error = err instanceof ApiClientError ? err.message : 'Speichern fehlgeschlagen';
    } finally {
      maxUnits.saving = false;
    }
  }

  async function resetMaxUnits() {
    maxUnits.error = null;
    maxUnits.saving = true;
    try {
      const result = await settingsApi.resetMaxUnits();
      maxUnits.value = result.value;
      flashMaxUnitsSaved();
    } catch (err) {
      maxUnits.error = err instanceof ApiClientError ? err.message : 'Zurücksetzen fehlgeschlagen';
    } finally {
      maxUnits.saving = false;
    }
  }

  async function saveRanking() {
    if (!ranking.config) return;
    ranking.error = null;
    ranking.saving = true;
    try {
      const result = await settingsApi.putSelectionRanking(ranking.config);
      ranking.config = normalizeRankingConfig((result as { config?: unknown }).config);
      ranking.defaultConfig = normalizeRankingConfig((result as { default_config?: unknown }).default_config);
      flashRankingSaved();
    } catch (err) {
      ranking.error = err instanceof ApiClientError ? err.message : 'Speichern fehlgeschlagen';
    } finally {
      ranking.saving = false;
    }
  }

  async function resetRanking() {
    ranking.error = null;
    ranking.saving = true;
    try {
      const result = await settingsApi.resetSelectionRanking();
      ranking.config = normalizeRankingConfig((result as { config?: unknown }).config);
      ranking.defaultConfig = normalizeRankingConfig((result as { default_config?: unknown }).default_config);
      flashRankingSaved();
    } catch (err) {
      ranking.error = err instanceof ApiClientError ? err.message : 'Zurücksetzen fehlgeschlagen';
    } finally {
      ranking.saving = false;
    }
  }

  function setRankingWeight(key: SelectionRankingReasonKey, value: string) {
    if (!ranking.config) return;
    ranking.config.weights[key] = Number.parseInt(value, 10);
  }

  function setRankingThreshold(key: keyof Omit<SelectionRankingConfig, 'weights'>, value: string) {
    if (!ranking.config) return;
    ranking.config[key] = Number.parseInt(value, 10);
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Einstellungen"
    tabindex="-1"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div class="modal-card" use:focusTrap>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-icon">
            <SettingsIcon size={20} />
          </div>
          <div>
            <h2 class="modal-title">Einstellungen</h2>
            <p class="modal-subtitle">Prompts &amp; Limits</p>
          </div>
        </div>
        <button class="modal-close" onclick={onclose} aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>

      <div class="modal-body">
        {#if pageError}
          <div class="error-message" aria-live="polite">{pageError}</div>
        {:else if !loaded}
          <Loading label="Einstellungen laden..." />
        {:else}
          <section class="setting-section">
            <h3>Auswahl-Prompt</h3>
            <p class="section-desc">
              Steuert die KI-gestützte Auswahl der relevantesten Informationseinheiten.
              Muss die Platzhalter <code>{'{{currentDate}}'}</code> und
              <code>{'{{recencyInstruction}}'}</code> enthalten — diese werden zur Laufzeit ersetzt.
            </p>
            <textarea
              bind:value={select.content}
              rows="10"
              aria-label="Auswahl-Prompt"
            ></textarea>
            <div class="meta-row">
              <span class="char-count" class:over={select.content.length > 8000}>
                {select.content.length} / 8000 Zeichen
              </span>
              {#if select.error}
                <span class="field-error" aria-live="polite">{select.error}</span>
              {:else if select.justSaved}
                <span class="field-ok" aria-live="polite">Gespeichert</span>
              {/if}
            </div>
            <div class="button-row">
              <Button
                variant="primary"
                loading={select.saving}
                onclick={() => savePrompt(select, settingsApi.putSelectPrompt)}
              >
                Speichern
              </Button>
              <Button
                variant="ghost"
                loading={select.saving}
                onclick={() => resetPrompt(select, settingsApi.resetSelectPrompt)}
              >
                Auf Standard zurücksetzen
              </Button>
            </div>
          </section>

          {#if ranking.config}
            <section class="setting-section">
              <h3>Auswahl-Ranking</h3>
              <p class="section-desc">
                Punktwerte für die deterministische Sortierung vor und nach der KI-Auswahl.
                Positive Werte heben Einheiten an, negative Werte senken sie ab.
              </p>
              <div class="ranking-grid">
                {#each rankingReasons as reason}
                  <label class="ranking-row">
                    <span>
                      <strong>{reason.label}</strong>
                      <code>{reason.key}</code>
                      {#if ranking.defaultConfig}
                        <small>Standard {ranking.defaultConfig.weights[reason.key]}</small>
                      {/if}
                    </span>
                    <input
                      type="number"
                      min="-200"
                      max="200"
                      step="1"
                      value={ranking.config.weights[reason.key]}
                      oninput={(e) => setRankingWeight(reason.key, e.currentTarget.value)}
                      aria-label={`Rankingwert ${reason.label}`}
                    />
                  </label>
                {/each}
              </div>
              <div class="threshold-grid">
                <label>
                  <span>Pflichtauswahl ab Score</span>
                  <input
                    type="number"
                    min="0"
                    max="250"
                    step="1"
                    value={ranking.config.mandatoryScore}
                    oninput={(e) => setRankingThreshold('mandatoryScore', e.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>Compose strikt ab Score</span>
                  <input
                    type="number"
                    min="0"
                    max="250"
                    step="1"
                    value={ranking.config.composeStrictMinScore}
                    oninput={(e) => setRankingThreshold('composeStrictMinScore', e.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>Compose dünner Tag ab Score</span>
                  <input
                    type="number"
                    min="0"
                    max="250"
                    step="1"
                    value={ranking.config.composeThinMinScore}
                    oninput={(e) => setRankingThreshold('composeThinMinScore', e.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>Schwache URL strikt ab Score</span>
                  <input
                    type="number"
                    min="0"
                    max="250"
                    step="1"
                    value={ranking.config.weakUrlStrictMinScore}
                    oninput={(e) => setRankingThreshold('weakUrlStrictMinScore', e.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>Schwache URL dünner Tag ab Score</span>
                  <input
                    type="number"
                    min="0"
                    max="250"
                    step="1"
                    value={ranking.config.weakUrlThinMinScore}
                    oninput={(e) => setRankingThreshold('weakUrlThinMinScore', e.currentTarget.value)}
                  />
                </label>
              </div>
              <div class="meta-row">
                <span class="char-count">Standardwerte bleiben über “Zurücksetzen” verfügbar.</span>
                {#if ranking.error}
                  <span class="field-error" aria-live="polite">{ranking.error}</span>
                {:else if ranking.justSaved}
                  <span class="field-ok" aria-live="polite">Gespeichert</span>
                {/if}
              </div>
              <div class="button-row">
                <Button variant="primary" loading={ranking.saving} onclick={saveRanking}>
                  Speichern
                </Button>
                <Button variant="ghost" loading={ranking.saving} onclick={resetRanking}>
                  Auf Standard zurücksetzen
                </Button>
              </div>
            </section>
          {/if}

          <section class="setting-section">
            <h3>Entwurfs-Prompt</h3>
            <p class="section-desc">
              Schreibrichtlinien für die Entwurfserstellung (Layer 2, Auto-Draft-Default).
              Grundregeln und Ausgabeformat bleiben unveränderlich.
            </p>
            <textarea
              bind:value={compose.content}
              rows="10"
              aria-label="Entwurfs-Prompt"
            ></textarea>
            <div class="meta-row">
              <span class="char-count" class:over={compose.content.length > 8000}>
                {compose.content.length} / 8000 Zeichen
              </span>
              {#if compose.error}
                <span class="field-error" aria-live="polite">{compose.error}</span>
              {:else if compose.justSaved}
                <span class="field-ok" aria-live="polite">Gespeichert</span>
              {/if}
            </div>
            <div class="button-row">
              <Button
                variant="primary"
                loading={compose.saving}
                onclick={() => savePrompt(compose, settingsApi.putComposePrompt)}
              >
                Speichern
              </Button>
              <Button
                variant="ghost"
                loading={compose.saving}
                onclick={() => resetPrompt(compose, settingsApi.resetComposePrompt)}
              >
                Auf Standard zurücksetzen
              </Button>
            </div>
          </section>

          <section class="setting-section">
            <h3>Maximale Einheiten pro Entwurf</h3>
            <p class="section-desc">
              Wie viele Informationseinheiten maximal in einen Entwurf einfliessen.
              Erlaubt: {MAX_UNITS_MIN}–{MAX_UNITS_MAX}.
            </p>
            <div class="number-row">
              <input
                type="number"
                min={MAX_UNITS_MIN}
                max={MAX_UNITS_MAX}
                step="1"
                bind:value={maxUnits.value}
                aria-label="Maximale Einheiten pro Entwurf"
              />
              <div class="meta-row" style="flex: 1;">
                {#if maxUnits.error}
                  <span class="field-error" aria-live="polite">{maxUnits.error}</span>
                {:else if maxUnits.justSaved}
                  <span class="field-ok" aria-live="polite">Gespeichert</span>
                {/if}
              </div>
            </div>
            <div class="button-row">
              <Button variant="primary" loading={maxUnits.saving} onclick={saveMaxUnits}>
                Speichern
              </Button>
              <Button variant="ghost" loading={maxUnits.saving} onclick={resetMaxUnits}>
                Auf Standard zurücksetzen
              </Button>
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-backdrop);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    position: relative;
    width: 100%;
    max-width: 48rem;
    margin: var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .modal-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .modal-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.625rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
  }

  .modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .modal-subtitle {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .modal-close:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }

  .modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .setting-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding-bottom: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .setting-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .setting-section h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
  }

  .section-desc {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .section-desc code {
    background: var(--color-background);
    padding: 0.1em 0.3em;
    border-radius: var(--radius-sm);
    font-size: 0.9em;
  }

  textarea {
    width: 100%;
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-sm);
    line-height: 1.5;
    resize: vertical;
    background: var(--color-background);
    color: var(--color-text);
    box-sizing: border-box;
  }

  textarea:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 1.5em;
    font-size: var(--text-sm);
  }

  .char-count {
    color: var(--color-text-muted);
  }

  .char-count.over {
    color: var(--color-danger, #c0392b);
    font-weight: 600;
  }

  .field-error {
    color: var(--color-danger, #c0392b);
  }

  .field-ok {
    color: var(--color-success, #27ae60);
  }

  .button-row {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .number-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .number-row input[type='number'] {
    width: 5rem;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-base);
    font-family: var(--font-mono, ui-monospace, monospace);
    background: var(--color-background);
    color: var(--color-text);
  }

  .number-row input[type='number']:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
  }

  .ranking-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 0.75rem;
  }

  .ranking-row,
  .threshold-grid label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .ranking-row span {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .ranking-row strong,
  .threshold-grid span {
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .ranking-row code {
    width: fit-content;
    background: var(--color-background);
    padding: 0.1rem 0.25rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: 0.6875rem;
  }

  .ranking-row small {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .ranking-row input,
  .threshold-grid input {
    width: 4.75rem;
    flex-shrink: 0;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-family: var(--font-mono, ui-monospace, monospace);
    background: var(--color-background);
    color: var(--color-text);
  }

  .ranking-row input:focus,
  .threshold-grid input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
  }

  .threshold-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 0.75rem;
  }

  .error-message {
    padding: var(--spacing-md);
    background: var(--color-status-error-bg, #fde2e1);
    color: var(--color-danger, #c0392b);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 760px) {
    .ranking-grid,
    .threshold-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
