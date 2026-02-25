<script lang="ts">
  import { X, Globe } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { FREQUENCY_OPTIONS_EXTENDED, DAY_OF_WEEK_OPTIONS } from '../../lib/constants';
  import ScopeToggle from './ScopeToggle.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import type { Location, TestResult } from '../../lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  // Derive existing topics from all scouts for autocomplete suggestions
  let existingTopics = $derived(
    [...new Set(
      $scouts.scouts
        .filter(s => s.topic)
        .flatMap(s => s.topic!.split(',').map(t => t.trim()))
        .filter(Boolean)
    )].sort()
  );

  // Step tracking
  let step = $state<1 | 2>(1);

  // Step 1 state
  let url = $state('');
  let criteriaMode = $state<'any' | 'specific'>('any');
  let criteria = $state('');
  let location = $state<Location | null>(null);
  let topic = $state('');

  // Test state
  let testing = $state(false);
  let testProgress = $state(0);
  let testResult = $state<TestResult | null>(null);
  let testError = $state('');
  let draftScoutId = $state<string | null>(null);

  // Step 2 state
  let name = $state('');
  let frequency = $state<string>('daily');
  let dayOfWeek = $state('monday');
  let timeHour = $state('08');
  let timeMinute = $state('00');
  let extractBaseline = $state(false);

  // Submit state
  let submitting = $state(false);
  let submitError = $state('');

  // Validation
  let step1Error = $state('');

  function resetState() {
    step = 1;
    url = '';
    criteriaMode = 'any';
    criteria = '';
    location = null;
    topic = '';
    testing = false;
    testProgress = 0;
    testResult = null;
    testError = '';
    draftScoutId = null;
    name = '';
    frequency = 'daily';
    dayOfWeek = 'monday';
    timeHour = '08';
    timeMinute = '00';
    extractBaseline = false;
    submitting = false;
    submitError = '';
    step1Error = '';
  }

  function handleClose() {
    if (draftScoutId && step === 1) {
      scouts.delete(draftScoutId).catch(console.warn);
    }
    resetState();
    onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  // Simulated progress animation
  function simulateProgress(): () => void {
    testProgress = 0;
    const steps = [
      { target: 30, delay: 300 },
      { target: 60, delay: 1200 },
      { target: 90, delay: 2500 },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const s of steps) {
      timers.push(setTimeout(() => {
        if (testing) testProgress = s.target;
      }, s.delay));
    }

    return () => timers.forEach(clearTimeout);
  }

  async function handleTest() {
    step1Error = '';
    testError = '';
    testResult = null;

    // Validate URL
    if (!url.trim()) {
      step1Error = 'URL ist erforderlich';
      return;
    }
    try { new URL(url); } catch { step1Error = 'Ungültige URL'; return; }

    if (criteriaMode === 'specific' && !criteria.trim()) {
      step1Error = 'Kriterien sind erforderlich im spezifischen Modus';
      return;
    }

    if (!location && !topic.trim()) {
      step1Error = 'Ort oder Thema ist erforderlich';
      return;
    }

    testing = true;
    const stopProgress = simulateProgress();

    try {
      // If we already have a draft, delete it first
      if (draftScoutId) {
        await scouts.delete(draftScoutId).catch(console.warn);
        draftScoutId = null;
      }

      // Create draft scout (inactive)
      const effectiveLocation = location;
      const effectiveTopic = topic.trim() || null;

      const scout = await scouts.create({
        name: new URL(url).hostname,
        url: url.trim(),
        criteria: criteriaMode === 'any' ? '' : criteria.trim(),
        location: effectiveLocation,
        topic: effectiveTopic,
        frequency: 'daily',
        is_active: false,
      });
      draftScoutId = scout.id;

      // Run test
      const result = await scouts.test(draftScoutId);
      testProgress = 100;
      testResult = result;

      // Pre-fill name from page title if available
      if (result.scrape_result.title && !name) {
        name = result.scrape_result.title.slice(0, 60);
      }
    } catch (err) {
      testError = (err as Error).message;
      testProgress = 100;
    } finally {
      testing = false;
      stopProgress();
    }
  }

  async function handleSubmit() {
    submitError = '';

    if (!name.trim()) {
      submitError = 'Name ist erforderlich';
      return;
    }

    if (!draftScoutId) {
      submitError = 'Kein Scout-Entwurf vorhanden';
      return;
    }

    submitting = true;

    try {
      // Update scout with final details
      await scouts.update(draftScoutId, {
        name: name.trim(),
        frequency: frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        is_active: true,
      });

      // Run first execution async (don't block)
      scouts.run(draftScoutId, { extract_units: extractBaseline }).catch(console.warn);

      // Clear draft ID so cleanup doesn't delete it
      draftScoutId = null;

      // Reload scouts list and close
      await scouts.load();
      resetState();
      onclose();
    } catch (err) {
      submitError = (err as Error).message;
    } finally {
      submitting = false;
    }
  }

  function handleBack() {
    step = 1;
    submitError = '';
  }

  // Step 1 validity: URL + scope (location or topic) must be filled
  let step1Valid = $derived(
    url.trim() !== '' &&
    (criteriaMode === 'any' || criteria.trim() !== '') &&
    (location !== null || topic.trim() !== '')
  );

  // Show day-of-week picker for weekly/biweekly
  let showDayPicker = $derived(frequency === 'weekly' || frequency === 'biweekly');

  // Generate hour options
  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minuteOptions = ['00', '15', '30', '45'];
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Neuer Scout"
    tabindex="-1"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div class="modal-card">

      <!-- Header -->
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-icon">
            <Globe size={20} />
          </div>
          <div>
            <h2 class="modal-title">Neuer Scout</h2>
            <p class="modal-subtitle">
              {step === 1 ? 'Website prüfen' : 'Scout einrichten'}
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
          <span class="step-label">Prüfen</span>
        </div>
        <div class="step-line" class:filled={step > 1}></div>
        <div class="step" class:active={step >= 2}>
          <div class="step-circle">2</div>
          <span class="step-label">Einrichten</span>
        </div>
      </div>

      <!-- Step 1: Test Website -->
      {#if step === 1}
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
              bind:value={url}
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
                  onclick={() => { criteriaMode = 'any'; }}
                  disabled={testing}
                >
                  Jede Änderung
                </button>
                <button
                  type="button"
                  class="criteria-track"
                  class:specific={criteriaMode === 'specific'}
                  onclick={() => { criteriaMode = criteriaMode === 'any' ? 'specific' : 'any'; }}
                  aria-label="Kriterienmodus umschalten"
                  disabled={testing}
                >
                  <span class="criteria-thumb"></span>
                </button>
                <button
                  type="button"
                  class="criteria-label"
                  class:active={criteriaMode === 'specific'}
                  onclick={() => { criteriaMode = 'specific'; }}
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
                bind:value={criteria}
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
              onlocationchange={(loc) => { location = loc; testResult = null; }}
              ontopicchange={(t) => { topic = t; testResult = null; }}
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
            <div class="test-results">
              <ProgressIndicator
                state={testResult.scrape_result.success ? 'success' : 'error'}
                progress={100}
                successMessage="Website erreichbar"
                successDetails="{testResult.scrape_result.word_count} Wörter gefunden"
                errorTitle="Fehler beim Scrapen"
                errorMessage={testResult.scrape_result.error}
              />
              {#if testResult.criteria_analysis}
                <div class="criteria-result">
                  <span class="criteria-badge" class:match={testResult.criteria_analysis.matches}>
                    {testResult.criteria_analysis.matches ? 'Kriterien erfüllt' : 'Keine Übereinstimmung'}
                  </span>
                  <p class="criteria-summary">{testResult.criteria_analysis.summary}</p>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="modal-footer">
          <Button variant="ghost" onclick={handleClose}>Abbrechen</Button>
          {#if !testResult}
            <Button onclick={handleTest} loading={testing} disabled={!step1Valid}>Website testen</Button>
          {:else if testResult.scrape_result.success}
            <Button onclick={() => { step = 2; }}>Weiter</Button>
          {:else}
            <Button onclick={handleTest} disabled={!step1Valid}>Erneut testen</Button>
          {/if}
        </div>

      <!-- Step 2: Configure -->
      {:else}
        <div class="modal-body">
          {#if submitError}
            <div class="error-message">{submitError}</div>
          {/if}

          <!-- Name -->
          <div class="form-group">
            <label for="scout-name">Name</label>
            <input
              id="scout-name"
              type="text"
              bind:value={name}
              placeholder="z.B. Berlin News Monitor"
            />
          </div>

          <!-- Frequency -->
          <div class="form-group">
            <label for="scout-frequency">Häufigkeit</label>
            <select id="scout-frequency" bind:value={frequency}>
              {#each FREQUENCY_OPTIONS_EXTENDED as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          <!-- Day of week (conditional) -->
          {#if showDayPicker}
            <div class="form-group">
              <label for="scout-day">Wochentag</label>
              <select id="scout-day" bind:value={dayOfWeek}>
                {#each DAY_OF_WEEK_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Time -->
          <div class="form-group">
            <span class="form-label">Uhrzeit</span>
            <div class="time-selects">
              <select bind:value={timeHour} aria-label="Stunde">
                {#each hourOptions as h}
                  <option value={h}>{h}</option>
                {/each}
              </select>
              <span class="time-separator">:</span>
              <select bind:value={timeMinute} aria-label="Minute">
                {#each minuteOptions as m}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            </div>
          </div>

          <!-- Extract baseline toggle -->
          <div class="form-group">
            <div class="criteria-toggle-wrapper">
              <div class="criteria-toggle">
                <button
                  type="button"
                  class="criteria-track"
                  class:specific={extractBaseline}
                  onclick={() => { extractBaseline = !extractBaseline; }}
                  aria-label="Baseline-Import umschalten"
                >
                  <span class="criteria-thumb"></span>
                </button>
                <button
                  type="button"
                  class="criteria-label"
                  class:active={extractBaseline}
                  onclick={() => { extractBaseline = !extractBaseline; }}
                >
                  Aktuelle Seiteninhalte importieren
                </button>
              </div>
            </div>
            <p class="hint-text">
              Wenn aktiviert, werden vorhandene Inhalte der Seite beim ersten Lauf als Informationseinheiten gespeichert.
            </p>
          </div>
        </div>

        <div class="modal-footer">
          <Button variant="ghost" onclick={handleBack}>Zurück</Button>
          <Button onclick={handleSubmit} loading={submitting}>Scout erstellen</Button>
        </div>
      {/if}

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
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    position: relative;
    width: 100%;
    max-width: 32rem;
    margin: 1rem;
    background: var(--color-surface, white);
    border-radius: var(--radius-lg, 1rem);
    border: 1px solid var(--color-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-surface, white);
    z-index: 1;
    border-radius: var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0;
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
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
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
    font-size: 0.8125rem;
    font-weight: 600;
    border: 2px solid var(--color-border);
    color: var(--color-text-muted);
    background: white;
    transition: all 0.2s;
  }

  .step.active .step-circle {
    border-color: var(--color-primary);
    color: white;
    background: var(--color-primary);
  }

  .step.completed .step-circle {
    border-color: var(--color-primary);
    color: white;
    background: var(--color-primary);
  }

  .step-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .step.active .step-label { color: var(--color-primary-dark); }

  .step-line {
    width: 4rem;
    height: 2px;
    background: var(--color-border);
    margin: 0 0.5rem;
    margin-bottom: 1.25rem;
    transition: background 0.3s;
  }

  .step-line.filled { background: var(--color-primary); }

  /* Body */
  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
  }

  /* Form elements */
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

  .form-group input[type="text"],
  .form-group input[type="url"],
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
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

  /* Criteria toggle */
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

  .hint-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0;
    line-height: 1.4;
  }

  /* Test results */
  .test-results {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .criteria-result {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    background: var(--color-background, #f9fafb);
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
  }

  .criteria-badge {
    display: inline-flex;
    align-self: flex-start;
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 9999px;
    background: #fef2f2;
    color: #b91c1c;
  }

  .criteria-badge.match {
    background: #ecfdf5;
    color: #065f46;
  }

  .criteria-summary {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  /* Time selects */
  .time-selects {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .time-selects select {
    width: auto;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
  }

  .time-selects select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .time-separator {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }
</style>
