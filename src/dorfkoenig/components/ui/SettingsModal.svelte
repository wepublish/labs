<script lang="ts">
  import { X, Settings as SettingsIcon } from 'lucide-svelte';
  import { Button, Loading } from '@shared/components';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { settingsApi, ApiClientError } from '../../lib/api';

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

  let select = $state(makePromptState());
  let compose = $state(makePromptState());
  let pageError = $state<string | null>(null);
  let loaded = $state(false);

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

    Promise.all([
      settingsApi.getSelectPrompt(),
      settingsApi.getComposePrompt(),
      settingsApi.getMaxUnits(),
    ])
      .then(([s, c, m]) => {
        select.content = s.prompt;
        select.loaded = true;
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

          <section class="setting-section">
            <h3>Entwurfs-Prompt</h3>
            <p class="section-desc">
              Schreibrichtlinien für die Entwurfserstellung (Layer 2). Grundregeln und
              Ausgabeformat bleiben unveränderlich.
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

  .error-message {
    padding: var(--spacing-md);
    background: var(--color-status-error-bg, #fde2e1);
    color: var(--color-danger, #c0392b);
    border-radius: var(--radius-sm);
  }
</style>
