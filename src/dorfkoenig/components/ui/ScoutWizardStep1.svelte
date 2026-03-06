<script lang="ts">
  import ScopeToggle from './ScopeToggle.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import ScoutTestResult from './ScoutTestResult.svelte';
  import { Button } from '@shared/components';
  import type { Location, TestResult } from '../../lib/types';

  interface Props {
    url: string;
    criteriaMode: 'any' | 'specific';
    criteria: string;
    location: Location | null;
    topic: string;
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

  <!-- Scope toggle -->
  <div class="form-group" role="group" aria-label="Ort und/oder Thema">
    <span class="form-label">Ort und/oder Thema</span>
    <ScopeToggle
      {location}
      {topic}
      {existingTopics}
      {onlocationchange}
      {ontopicchange}
    />
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
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-group input[type="url"],
  .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
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
    font-size: 0.8125rem;
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
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
    font-size: 0.8125rem;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    transition: color 0.2s ease;
    white-space: nowrap;
  }

  .criteria-label.active {
    color: var(--color-primary, #4f46e5);
  }

  .criteria-label:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .criteria-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: #e0e7ff;
    border: 1px solid #c7d2fe;
    border-radius: 9999px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.2s ease;
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
    background: var(--color-primary, #4f46e5);
    border-radius: 9999px;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .criteria-track.specific .criteria-thumb {
    transform: translateX(16px);
  }
</style>
