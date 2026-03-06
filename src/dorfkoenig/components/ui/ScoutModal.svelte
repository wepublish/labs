<script lang="ts">
  import { X, Globe } from 'lucide-svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { scouts } from '../../stores/scouts';
  import { extractTopics } from '../../lib/constants';
  import ScoutWizardStep1 from './ScoutWizardStep1.svelte';
  import ScoutWizardStep2 from './ScoutWizardStep2.svelte';
  import type { Location, TestResult } from '../../lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let existingTopics = $derived(extractTopics($scouts.scouts));

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
  let detectedProvider = $state<string | null>(null);
  let contentHash = $state<string | null>(null);

  // Submit state
  let submitting = $state(false);
  let submitError = $state('');

  // Validation
  let step1Error = $state('');

  let step1Valid = $derived(
    url.trim() !== '' &&
    (criteriaMode === 'any' || criteria.trim() !== '') &&
    (location !== null || topic.trim() !== '')
  );

  function resetState(): void {
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
    detectedProvider = null;
    contentHash = null;
    submitting = false;
    submitError = '';
    step1Error = '';
  }

  function handleClose(): void {
    if (draftScoutId && step === 1) {
      scouts.delete(draftScoutId).catch(console.warn);
    }
    resetState();
    onclose();
  }

  function handleBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) handleClose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') handleClose();
  }

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

  async function handleTest(): Promise<void> {
    step1Error = '';
    testError = '';
    testResult = null;

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
      if (draftScoutId) {
        await scouts.delete(draftScoutId).catch(console.warn);
        draftScoutId = null;
      }

      const scout = await scouts.create({
        name: new URL(url).hostname,
        url: url.trim(),
        criteria: criteriaMode === 'any' ? '' : criteria.trim(),
        location,
        topic: topic.trim() || null,
        frequency: 'daily',
        is_active: false,
      });
      draftScoutId = scout.id;

      const result = await scouts.test(draftScoutId);
      testProgress = 100;
      testResult = result;
      detectedProvider = result.provider ?? null;
      contentHash = result.content_hash ?? null;

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

  async function handleSubmit(): Promise<void> {
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
      await scouts.update(draftScoutId, {
        name: name.trim(),
        frequency: frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        is_active: true,
        provider: detectedProvider,
        content_hash: contentHash,
      });

      scouts.run(draftScoutId, { skip_notification: true }).catch(console.warn);

      draftScoutId = null;

      await scouts.load();
      resetState();
      onclose();
    } catch (err) {
      submitError = (err as Error).message;
    } finally {
      submitting = false;
    }
  }

  function handleBack(): void {
    step = 1;
    submitError = '';
  }
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
    <div class="modal-card" use:focusTrap>

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

      {#if step === 1}
        <ScoutWizardStep1
          {url}
          {criteriaMode}
          {criteria}
          {location}
          {topic}
          {existingTopics}
          {testing}
          {testProgress}
          {testResult}
          {testError}
          {step1Error}
          {step1Valid}
          onurlchange={(v) => { url = v; }}
          oncriteriamodechange={(m) => { criteriaMode = m; }}
          oncriteriachange={(v) => { criteria = v; }}
          onlocationchange={(loc) => { location = loc; testResult = null; }}
          ontopicchange={(t) => { topic = t; testResult = null; }}
          ontest={handleTest}
          onnext={() => { step = 2; }}
          onclose={handleClose}
        />
      {:else}
        <ScoutWizardStep2
          {name}
          {frequency}
          {dayOfWeek}
          {timeHour}
          {timeMinute}
          {submitting}
          {submitError}
          onnamechange={(v) => { name = v; }}
          onfrequencychange={(v) => { frequency = v; }}
          ondayofweekchange={(v) => { dayOfWeek = v; }}
          ontimehourchange={(v) => { timeHour = v; }}
          ontimeminutechange={(v) => { timeMinute = v; }}
          onback={handleBack}
          onsubmit={handleSubmit}
        />
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
    background: var(--color-backdrop);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    position: relative;
    width: 100%;
    max-width: 32rem;
    margin: var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
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
    font-size: var(--text-xs);
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
    transition: background var(--transition-slow);
  }

  .step-line.filled { background: var(--color-primary); }
</style>
