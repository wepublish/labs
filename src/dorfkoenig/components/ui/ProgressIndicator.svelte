<script lang="ts">
  import { CheckCircle, Clock, XCircle } from 'lucide-svelte';

  interface Props {
    progress?: number;
    message?: string;
    state?: 'loading' | 'success' | 'error';
    successMessage?: string;
    successDetails?: string;
    errorTitle?: string;
    errorMessage?: string;
    hintText?: string;
  }

  let {
    progress = 0,
    message = 'Laden...',
    state = 'loading',
    successMessage = 'Fertig!',
    successDetails = '',
    errorTitle = 'Fehler',
    errorMessage = '',
    hintText = 'Dies kann einen Moment dauern',
  }: Props = $props();
</script>

<div
  class="extraction-progress"
  class:extraction-progress--success={state === 'success'}
  class:extraction-progress--error={state === 'error'}
>
  {#if state === 'loading'}
    <div class="extraction-progress__header">
      <span class="extraction-progress__message">{message}</span>
      <span class="extraction-progress__percentage">{progress}%</span>
    </div>
    <div class="extraction-progress__track">
      <div class="extraction-progress__fill" style="width: {progress}%"></div>
      <div class="extraction-progress__shimmer" style="width: {progress}%"></div>
    </div>
    {#if hintText}
      <div class="extraction-progress__footer">
        <p class="extraction-progress__hint">
          <Clock size={14} />
          {hintText}
        </p>
      </div>
    {/if}

  {:else if state === 'success'}
    <div class="extraction-progress__success">
      <div class="extraction-progress__success-header">
        <div class="extraction-progress__success-icon">
          <CheckCircle size={24} />
        </div>
        <div class="extraction-progress__success-text">
          <span class="extraction-progress__success-title">{successMessage}</span>
          {#if successDetails}
            <span class="extraction-progress__success-details">{successDetails}</span>
          {/if}
        </div>
      </div>
    </div>

  {:else if state === 'error'}
    <div class="extraction-progress__error">
      <div class="extraction-progress__error-header">
        <div class="extraction-progress__error-icon">
          <XCircle size={24} />
        </div>
        <div class="extraction-progress__error-text">
          <span class="extraction-progress__error-title">{errorTitle}</span>
          {#if errorMessage}
            <span class="extraction-progress__error-details">{errorMessage}</span>
          {/if}
        </div>
      </div>
      <div class="extraction-progress__track extraction-progress__track--error">
        <div class="extraction-progress__fill extraction-progress__fill--error" style="width: {progress}%"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Base */
  .extraction-progress {
    position: relative;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(234, 114, 110, 0.03) 0%, rgba(212, 90, 86, 0.06) 100%);
    border: 1px solid rgba(234, 114, 110, 0.15);
    border-radius: var(--radius-lg, 1rem);
    overflow: hidden;
  }

  .extraction-progress::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--color-primary, #ea726e), var(--color-primary-dark, #d45a56));
    opacity: 0.5;
  }

  /* Loading state */
  .extraction-progress__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .extraction-progress__message {
    font-family: var(--font-body, 'DM Sans', sans-serif);
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--color-text, #1c1917);
  }

  .extraction-progress__percentage {
    font-family: var(--font-display, 'Crimson Pro', serif);
    font-size: 1.5rem;
    font-weight: 600;
    background: linear-gradient(135deg, var(--color-primary-dark, #d45a56), var(--color-primary, #ea726e));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .extraction-progress__track {
    position: relative;
    width: 100%;
    height: 0.5rem;
    background: rgba(234, 114, 110, 0.08);
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .extraction-progress__fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary, #ea726e), var(--color-primary-dark, #d45a56));
    border-radius: 999px;
    transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .extraction-progress__shimmer {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
    border-radius: 999px;
    animation: shimmerProgress 2s infinite;
    transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes shimmerProgress {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }

  .extraction-progress__hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #57534e);
    font-style: italic;
    margin: 0;
  }

  /* Success state */
  .extraction-progress--success {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.08) 100%);
    border-color: rgba(16, 185, 129, 0.2);
  }

  .extraction-progress--success::before {
    background: linear-gradient(90deg, #10b981, #059669);
  }

  .extraction-progress__success {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .extraction-progress__success-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .extraction-progress__success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #059669;
  }

  .extraction-progress__success-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .extraction-progress__success-title {
    font-family: var(--font-body, 'DM Sans', sans-serif);
    font-size: 0.9375rem;
    font-weight: 600;
    color: #065f46;
  }

  .extraction-progress__success-details {
    font-size: 0.8125rem;
    color: #047857;
  }

  /* Error state */
  .extraction-progress--error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.08) 100%);
    border-color: rgba(239, 68, 68, 0.2);
  }

  .extraction-progress--error::before {
    background: linear-gradient(90deg, #ef4444, #dc2626);
  }

  .extraction-progress__error {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .extraction-progress__error-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .extraction-progress__error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #dc2626;
  }

  .extraction-progress__error-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .extraction-progress__error-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #991b1b;
  }

  .extraction-progress__error-details {
    font-size: 0.8125rem;
    color: #b91c1c;
  }

  .extraction-progress__track--error {
    background: rgba(239, 68, 68, 0.1);
  }

  .extraction-progress__fill--error {
    background: linear-gradient(90deg, #ef4444, #dc2626);
  }
</style>
