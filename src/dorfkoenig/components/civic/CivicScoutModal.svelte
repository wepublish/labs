<script lang="ts">
  import { X, Landmark, Search, FlaskConical, CheckSquare, Square } from 'lucide-svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { Loading, Button } from '@shared/components';
  import ScopeToggle from '../ui/ScopeToggle.svelte';
  import { scouts } from '../../stores/scouts';
  import { civicApi } from '../../lib/api';
  import { extractTopics, FREQUENCY_OPTIONS_EXTENDED } from '../../lib/constants';
  import type { CandidateUrl, Location, ExtractedPromise, LocationMode } from '../../lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();
  let existingTopics = $derived(extractTopics($scouts.scouts));

  // Step tracking (1: discover, 2: test, 3: schedule)
  let step = $state<1 | 2 | 3>(1);

  // Step 1: Discover
  let domain = $state('');
  let discovering = $state(false);
  let discoverError = $state('');
  let candidates = $state<CandidateUrl[]>([]);
  let selectedUrls = $state<Set<string>>(new Set());

  // Step 2: Test
  let criteria = $state('');
  let testing = $state(false);
  let testError = $state('');
  let testResult = $state<{ documents_found: number; sample_promises: ExtractedPromise[] } | null>(null);

  // Step 3: Schedule
  let name = $state('');
  let frequency = $state<string>('weekly');
  let location = $state<Location | null>(null);
  let topic = $state('');
  let locationMode = $state<LocationMode>('manual');
  let submitting = $state(false);
  let submitError = $state('');

  let canDiscover = $derived(domain.trim().length > 0);
  let canTest = $derived(selectedUrls.size > 0 && selectedUrls.size <= 2);
  let canSubmit = $derived(name.trim().length > 0);

  function resetState() {
    step = 1;
    domain = '';
    discovering = false;
    discoverError = '';
    candidates = [];
    selectedUrls = new Set();
    criteria = '';
    testing = false;
    testError = '';
    testResult = null;
    name = '';
    frequency = 'weekly';
    location = null;
    topic = '';
    locationMode = 'manual';
    submitting = false;
    submitError = '';
  }

  function handleClose() {
    resetState();
    onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  async function handleDiscover() {
    if (!canDiscover) return;
    discovering = true;
    discoverError = '';
    candidates = [];
    selectedUrls = new Set();

    try {
      const result = await civicApi.discover(domain.trim());
      candidates = result;
      if (candidates.length === 0) {
        discoverError = 'Keine relevanten Seiten gefunden';
      }
    } catch (err) {
      discoverError = (err as Error).message;
    } finally {
      discovering = false;
    }
  }

  function toggleUrl(url: string) {
    const next = new Set(selectedUrls);
    if (next.has(url)) {
      next.delete(url);
    } else if (next.size < 2) {
      next.add(url);
    }
    selectedUrls = next;
  }

  async function handleTest() {
    if (!canTest) return;
    testing = true;
    testError = '';
    testResult = null;

    try {
      const result = await civicApi.test([...selectedUrls], criteria || undefined);
      if (!result.valid) {
        testError = result.error || 'Extraktion fehlgeschlagen';
        return;
      }
      testResult = {
        documents_found: result.documents_found,
        sample_promises: result.sample_promises,
      };
      // Auto-fill name from domain
      if (!name) {
        name = domain.trim().replace(/^www\./, '').split('/')[0];
      }
    } catch (err) {
      testError = (err as Error).message;
    } finally {
      testing = false;
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    submitting = true;
    submitError = '';

    try {
      await scouts.create({
        name: name.trim(),
        scout_type: 'civic',
        root_domain: domain.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''),
        tracked_urls: [...selectedUrls],
        criteria: criteria.trim(),
        frequency: frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        location: locationMode === 'auto' ? null : location,
        topic: topic.trim() || undefined,
        location_mode: locationMode,
        is_active: true,
      });

      await scouts.load();
      resetState();
      onclose();
    } catch (err) {
      submitError = (err as Error).message;
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Gemeinderat verfolgen"
    tabindex="-1"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div class="modal-card" use:focusTrap>

      <!-- Header -->
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-icon">
            <Landmark size={20} />
          </div>
          <div>
            <h2 class="modal-title">Gemeinderat verfolgen</h2>
            <p class="modal-subtitle">
              {#if step === 1}Domain durchsuchen
              {:else if step === 2}Extraktion testen
              {:else}Scout einrichten
              {/if}
            </p>
          </div>
        </div>
        <button class="modal-close" onclick={handleClose} aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>

      <!-- Step Tracker -->
      <div class="step-tracker">
        <div class="step" class:active={step >= 1} class:completed={step > 1}>
          <div class="step-circle">1</div>
          <span class="step-label">Suchen</span>
        </div>
        <div class="step-line" class:filled={step > 1}></div>
        <div class="step" class:active={step >= 2} class:completed={step > 2}>
          <div class="step-circle">2</div>
          <span class="step-label">Testen</span>
        </div>
        <div class="step-line" class:filled={step > 2}></div>
        <div class="step" class:active={step >= 3}>
          <div class="step-circle">3</div>
          <span class="step-label">Einrichten</span>
        </div>
      </div>

      <!-- Step Content -->
      <div class="modal-body">
        {#if step === 1}
          <!-- STEP 1: Domain discovery -->
          <div class="field-group">
            <label for="civic-domain" class="field-label">Gemeinde-Domain</label>
            <input
              id="civic-domain"
              type="text"
              bind:value={domain}
              placeholder="gemeinde.zermatt.ch"
              class="form-input"
              disabled={discovering}
            />
          </div>

          {#if discoverError}
            <p class="error-text">{discoverError}</p>
          {/if}

          {#if discovering}
            <div class="loading-state">
              <Loading label="Domain wird durchsucht..." />
              <p class="hint-text">Dies kann bis zu 30 Sekunden dauern</p>
            </div>
          {:else if candidates.length > 0}
            <div class="candidates-section">
              <p class="field-label">Seiten mit Ratsprotokollen auswählen (max. 2)</p>
              <p class="selection-count">{selectedUrls.size}/2 ausgewählt</p>
              <div class="url-list">
                {#each candidates as candidate}
                  <button
                    class="url-item"
                    class:selected={selectedUrls.has(candidate.url)}
                    class:disabled={!selectedUrls.has(candidate.url) && selectedUrls.size >= 2}
                    onclick={() => toggleUrl(candidate.url)}
                    type="button"
                  >
                    <span class="url-check">
                      {#if selectedUrls.has(candidate.url)}
                        <CheckSquare size={16} />
                      {:else}
                        <Square size={16} />
                      {/if}
                    </span>
                    <span class="url-content">
                      <span class="url-text">{candidate.url}</span>
                      {#if candidate.description}
                        <span class="url-description">{candidate.description}</span>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <div class="modal-footer">
            <Button variant="ghost" onclick={handleClose}>Abbrechen</Button>
            {#if candidates.length > 0 && canTest}
              <Button onclick={() => { step = 2; }}>Weiter</Button>
            {:else}
              <Button onclick={handleDiscover} disabled={!canDiscover || discovering} loading={discovering}>
                <Search size={14} />
                Domain durchsuchen
              </Button>
            {/if}
          </div>

        {:else if step === 2}
          <!-- STEP 2: Test extraction -->
          <div class="field-group">
            <label class="field-label">
              Kriterien
              <span class="field-hint">(optional — leer lassen für alle Versprechen)</span>
            </label>
            <textarea
              bind:value={criteria}
              placeholder="z.B. Wohnungspolitik, Infrastruktur, Budget"
              class="form-textarea"
              rows={2}
              disabled={testing}
            ></textarea>
          </div>

          {#if testError}
            <p class="error-text">{testError}</p>
          {/if}

          {#if testing}
            <div class="loading-state">
              <Loading label="Dokumente werden analysiert..." />
              <p class="hint-text">Protokolle werden geladen und durchsucht</p>
            </div>
          {:else if testResult}
            <div class="test-results">
              <p class="results-summary">
                {testResult.documents_found} Dokument(e) analysiert,
                {testResult.sample_promises.length} Versprechen gefunden
              </p>
              {#if testResult.sample_promises.length > 0}
                <div class="promises-preview">
                  {#each testResult.sample_promises.slice(0, 5) as promise}
                    <div class="preview-item">
                      <p class="preview-text">{promise.promise_text}</p>
                      {#if promise.due_date}
                        <span class="preview-due">Frist: {promise.due_date}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <div class="modal-footer">
            <Button variant="ghost" onclick={() => { step = 1; }}>Zurück</Button>
            {#if testResult}
              <Button onclick={() => { step = 3; }}>Weiter</Button>
            {:else}
              <Button onclick={handleTest} disabled={testing} loading={testing}>
                <FlaskConical size={14} />
                Extraktion testen
              </Button>
            {/if}
          </div>

        {:else}
          <!-- STEP 3: Schedule -->
          <div class="field-group">
            <label for="civic-name" class="field-label">Name</label>
            <input
              id="civic-name"
              type="text"
              bind:value={name}
              placeholder="z.B. Gemeinde Zermatt"
              class="form-input"
            />
          </div>

          <div class="field-group">
            <label for="civic-frequency" class="field-label">Frequenz</label>
            <select id="civic-frequency" bind:value={frequency} class="form-select">
              {#each FREQUENCY_OPTIONS_EXTENDED as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          <div class="field-group" role="group" aria-label="Gemeinde-Zuordnung">
            <span class="field-label">Gemeinde-Zuordnung</span>
            <div class="mode-toggle">
              <button
                type="button"
                class="mode-label"
                class:active={locationMode === 'manual'}
                onclick={() => { locationMode = 'manual'; }}
              >Manuell</button>
              <button
                type="button"
                class="mode-track"
                class:auto={locationMode === 'auto'}
                onclick={() => { locationMode = locationMode === 'manual' ? 'auto' : 'manual'; }}
                aria-label="Gemeinde-Zuordnungsmodus umschalten"
              >
                <span class="mode-thumb"></span>
              </button>
              <button
                type="button"
                class="mode-label"
                class:active={locationMode === 'auto'}
                onclick={() => { locationMode = 'auto'; }}
              >Automatisch (KI)</button>
            </div>
          </div>

          <ScopeToggle
            {location}
            topic={topic}
            {existingTopics}
            hideLocation={locationMode === 'auto'}
            onlocationchange={(loc) => { location = loc; }}
            ontopicchange={(t) => { topic = t; }}
          />

          {#if locationMode === 'auto'}
            <p class="mode-hint">
              Die KI erkennt die betroffene Gemeinde automatisch aus dem Artikeltext.
              Jede Information zeigt ein Vertrauens-Indikator im Feed-Panel &mdash;
              unsichere Zuordnungen kannst Du dort pr&uuml;fen.
            </p>
          {/if}

          {#if submitError}
            <p class="error-text">{submitError}</p>
          {/if}

          <div class="modal-footer">
            <Button variant="ghost" onclick={() => { step = 2; }}>Zurück</Button>
            <Button onclick={handleSubmit} disabled={!canSubmit || submitting} loading={submitting}>
              Scout erstellen
            </Button>
          </div>
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
    max-width: 36rem;
    margin: var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-surface);
    z-index: 1;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
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
    background: rgba(245, 158, 11, 0.1);
    color: #d97706;
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
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .modal-close:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  /* Step Tracker */
  .step-tracker {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
  }

  .step-circle {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-base-sm);
    font-weight: 600;
    border: 2px solid var(--color-border);
    color: var(--color-text-muted);
    background: var(--color-surface);
    transition: all var(--transition-base);
  }

  .step.active .step-circle {
    border-color: #d97706;
    color: white;
    background: #d97706;
  }

  .step.completed .step-circle {
    border-color: #d97706;
    color: white;
    background: #d97706;
  }

  .step-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .step.active .step-label { color: #92400e; }

  .step-line {
    width: 3rem;
    height: 2px;
    background: var(--color-border);
    margin: 0 0.5rem;
    margin-bottom: 1.25rem;
    transition: background var(--transition-slow);
  }

  .step-line.filled { background: #d97706; }

  /* Body */
  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  /* Form elements */
  .field-group { display: flex; flex-direction: column; gap: 0.375rem; }

  .field-label {
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .field-hint {
    font-weight: 400;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    margin-left: 0.25rem;
  }

  .form-input, .form-select, .form-textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-base-sm);
    color: var(--color-text);
    background: var(--color-surface);
    font-family: var(--font-body);
    transition: border-color var(--transition-base);
  }

  .form-input:focus, .form-select:focus, .form-textarea:focus {
    outline: none;
    border-color: #d97706;
  }

  .form-textarea { resize: vertical; }

  .error-text {
    color: var(--color-danger);
    font-size: var(--text-sm);
    margin: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0;
  }

  .hint-text {
    font-size: var(--text-xs);
    color: var(--color-text-light);
    margin: 0;
  }

  /* Candidates / URL list */
  .candidates-section { display: flex; flex-direction: column; gap: 0.5rem; }

  .selection-count {
    font-size: var(--text-xs);
    font-weight: 600;
    color: #d97706;
    margin: 0;
  }

  .url-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0.25rem;
    background: white;
  }

  .url-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: none;
    background: transparent;
    text-align: left;
    width: 100%;
    font-family: var(--font-body);
    transition: background var(--transition-base);
  }

  .url-item:hover { background: #f9fafb; }
  .url-item.selected { background: #fffbeb; }
  .url-item.selected:hover { background: #fef3c7; }
  .url-item.disabled { opacity: 0.4; cursor: not-allowed; }

  .url-check {
    flex-shrink: 0;
    display: flex;
    color: #9ca3af;
  }

  .url-item.selected .url-check { color: #d97706; }

  .url-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .url-text {
    font-size: var(--text-sm);
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-item.selected .url-text { color: #92400e; }

  .url-description {
    font-size: var(--text-xs);
    color: #9ca3af;
    line-height: 1.3;
  }

  /* Test results */
  .test-results { display: flex; flex-direction: column; gap: 0.75rem; }

  .results-summary {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .promises-preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 250px;
    overflow-y: auto;
  }

  .preview-item {
    padding: 0.625rem;
    background: #fffbeb;
    border: 1px solid #fef3c7;
    border-radius: var(--radius-sm);
  }

  .preview-text {
    font-size: var(--text-sm);
    color: var(--color-text);
    margin: 0 0 0.25rem;
    line-height: 1.5;
  }

  .preview-due {
    font-size: var(--text-xs);
    font-weight: 500;
    color: #d97706;
    background: #fef3c7;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--radius-full);
  }

  .mode-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .mode-label {
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

  .mode-label.active {
    color: var(--color-primary, #4f46e5);
  }

  .mode-track {
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

  .mode-thumb {
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

  .mode-track.auto .mode-thumb {
    transform: translateX(16px);
  }

  .mode-hint {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
