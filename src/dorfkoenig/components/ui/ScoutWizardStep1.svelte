<script lang="ts">
  import ScopeToggle from './ScopeToggle.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import ScoutTestResult from './ScoutTestResult.svelte';
  import { Button } from '@shared/components';
  import type { Location, LocationMode, TestResult } from '../../lib/types';

  interface Props {
    url: string;
    criteriaMode: 'any' | 'specific';
    criteria: string;
    location: Location | null;
    topic: string;
    locationMode: LocationMode;
    existingTopics: string[];
    testing: boolean;
    testProgress: number;
    testResult: TestResult | null;
    testError: string;
    step1Error: string;
    step1Valid: boolean;
    onurlchange: (url: string) => void;
    oncriteriamodechange: (mode: 'any' | 'specific') => void;
    oncriteriachange: (criteria: string) => void;
    onlocationchange: (loc: Location | null) => void;
    ontopicchange: (topic: string) => void;
    onlocationmodechange: (mode: LocationMode) => void;
    ontest: () => void;
    onnext: () => void;
    onclose: () => void;
  }

  let {
    url,
    criteriaMode,
    criteria,
    location,
    topic,
    locationMode,
    existingTopics,
    testing,
    testProgress,
    testResult,
    testError,
    step1Error,
    step1Valid,
    onurlchange,
    oncriteriamodechange,
    oncriteriachange,
    onlocationchange,
    ontopicchange,
    onlocationmodechange,
    ontest,
    onnext,
    onclose,
  }: Props = $props();
</script>

<div class="modal-body">
  {#if step1Error}
    <div class="error-message">{step1Error}</div>
  {/if}

  <!-- URL input -->
  <div class="form-group">
    <label for="scout-url">URL</label>
    <input
      id="scout-url"
      type="url"
      value={url}
      oninput={(e) => onurlchange(e.currentTarget.value)}
      placeholder="https://example.com/news"
      disabled={testing}
      aria-required="true"
    />
  </div>

  <!-- Criteria mode toggle -->
  <div class="form-group" role="group" aria-label="Benachrichtigung bei">
    <span class="form-label">Benachrichtigung bei</span>
    <div class="criteria-toggle-wrapper">
      <div class="criteria-toggle">
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'any'}
          onclick={() => oncriteriamodechange('any')}
          disabled={testing}
        >
          Jede Änderung
        </button>
        <button
          type="button"
          class="criteria-track"
          class:specific={criteriaMode === 'specific'}
          onclick={() => oncriteriamodechange(criteriaMode === 'any' ? 'specific' : 'any')}
          aria-label="Kriterienmodus umschalten"
          disabled={testing}
        >
          <span class="criteria-thumb"></span>
        </button>
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'specific'}
          onclick={() => oncriteriamodechange('specific')}
          disabled={testing}
        >
          Bestimmte Kriterien
        </button>
      </div>
    </div>
  </div>

  {#if criteriaMode === 'specific'}
    <div class="form-group">
      <label for="scout-criteria">Kriterien</label>
      <textarea
        id="scout-criteria"
        value={criteria}
        oninput={(e) => oncriteriachange(e.currentTarget.value)}
        placeholder="Welche Informationen sollen gefunden werden?"
        rows="3"
        disabled={testing}
      ></textarea>
    </div>
  {/if}

  <!-- Gemeinde-Zuordnung toggle -->
  <div class="form-group" role="group" aria-label="Gemeinde-Zuordnung">
    <span class="form-label">Gemeinde-Zuordnung</span>
    <div class="criteria-toggle-wrapper">
      <div class="criteria-toggle">
        <button
          type="button"
          class="criteria-label"
          class:active={locationMode === 'manual'}
          onclick={() => onlocationmodechange('manual')}
          disabled={testing}
        >
          Manuell
        </button>
        <button
          type="button"
          class="criteria-track"
          class:specific={locationMode === 'auto'}
          onclick={() => onlocationmodechange(locationMode === 'manual' ? 'auto' : 'manual')}
          aria-label="Gemeinde-Zuordnungsmodus umschalten"
          disabled={testing}
        >
          <span class="criteria-thumb"></span>
        </button>
        <button
          type="button"
          class="criteria-label"
          class:active={locationMode === 'auto'}
          onclick={() => onlocationmodechange('auto')}
          disabled={testing}
        >
          Automatisch (KI)
        </button>
      </div>
    </div>
  </div>

  <!-- Scope toggle -->
  <div class="form-group" role="group" aria-label="Ort und/oder Thema">
    <span class="form-label">
      {locationMode === 'auto' ? 'Thema' : 'Ort und/oder Thema'}
    </span>
    <ScopeToggle
      {location}
      {topic}
      {existingTopics}
      hideLocation={locationMode === 'auto'}
      {onlocationchange}
      {ontopicchange}
    />
    {#if locationMode === 'auto'}
      <p class="scope-hint">
        Die KI erkennt die betroffene Gemeinde automatisch aus dem Artikeltext.
        Jede Information zeigt ein Vertrauens-Indikator (hoch/mittel/niedrig) im
        Feed-Panel &mdash; unsichere Zuordnungen kannst Du dort pr&uuml;fen und
        korrigieren.
      </p>
    {:else}
      <p class="scope-hint">
        F&uuml;r regionale Seiten (z.&nbsp;B. Kantonspolizei), die mehrere Gemeinden
        abdecken, schalte auf &bdquo;Automatisch (KI)&ldquo; um &mdash; so wird jede
        Information der passenden Gemeinde zugeordnet, ohne pro Gemeinde einen
        eigenen Scout zu erstellen.
      </p>
    {/if}
  </div>

  <!-- Test results -->
  {#if testing}
    <ProgressIndicator
      state="loading"
      progress={testProgress}
      message="Website wird geprüft..."
      hintText="Seite wird geladen und analysiert"
    />
  {:else if testError}
    <ProgressIndicator
      state="error"
      progress={100}
      errorTitle="Fehler beim Testen"
      errorMessage={testError}
    />
  {:else if testResult}
    <ScoutTestResult {testResult} />
  {/if}
</div>

<div class="modal-footer">
  <Button variant="ghost" onclick={onclose}>Abbrechen</Button>
  {#if !testResult}
    <Button onclick={ontest} loading={testing} disabled={!step1Valid}>Website testen</Button>
  {:else if testResult.scrape_result.success}
    <Button onclick={onnext}>Weiter</Button>
  {:else}
    <Button onclick={ontest} disabled={!step1Valid}>Erneut testen</Button>
  {/if}
</div>

<style>
  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label,
  .form-label {
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .form-group input[type="url"],
  .form-group textarea {
    width: 100%;
    padding: var(--spacing-sm) 0.75rem;
    font-size: var(--text-base);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .form-group input:disabled,
  .form-group textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    padding: 0.625rem 0.75rem;
    font-size: var(--text-base-sm);
    color: var(--color-status-error-text);
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
    border-radius: var(--radius-sm);
  }

  .criteria-toggle-wrapper {
    display: flex;
    justify-content: flex-start;
  }

  .criteria-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .criteria-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0;
    border: none;
    background: transparent;
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text-light);
    cursor: pointer;
    transition: color var(--transition-base);
    white-space: nowrap;
  }

  .criteria-label.active {
    color: var(--color-primary);
  }

  .criteria-label:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .criteria-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: var(--color-primary-light);
    border: 1px solid rgba(234, 114, 110, 0.3);
    border-radius: var(--radius-full);
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .criteria-track:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .criteria-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: var(--color-primary);
    border-radius: var(--radius-full);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .criteria-track.specific .criteria-thumb {
    transform: translateX(16px);
  }

  .scope-hint {
    margin: 0.375rem 0 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
