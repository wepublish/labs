<script lang="ts">
  import { Check } from 'lucide-svelte';

  interface Step {
    label: string;
    subtitle: string;
  }

  interface Props {
    currentStep: number;
    steps: Step[];
  }

  let { currentStep, steps }: Props = $props();
</script>

<nav class="step-indicator" aria-label="Fortschritt">
  {#each steps as step, i}
    <div class="step-item" class:completed={i < currentStep} class:active={i === currentStep} class:future={i > currentStep}>
      <div class="step-circle">
        {#if i < currentStep}
          <Check size={14} strokeWidth={3} />
        {:else}
          <span class="step-number">{i + 1}</span>
        {/if}
      </div>
      <div class="step-text">
        <span class="step-label">{step.label}</span>
        <span class="step-subtitle">{step.subtitle}</span>
      </div>
      {#if i < steps.length - 1}
        <div class="step-connector" class:completed={i < currentStep}></div>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .step-indicator {
    display: flex;
    flex-direction: column;
    width: 180px;
    padding: 1.5rem 1rem 1.5rem 1.25rem;
    border-right: 1px solid var(--color-border, #e5e7eb);
    flex-shrink: 0;
  }

  .step-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding-bottom: 2rem;
  }

  .step-item:last-child {
    padding-bottom: 0;
  }

  .step-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 2px solid var(--color-border, #e5e7eb);
    background: var(--color-surface, white);
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    transition: all 0.2s ease;
  }

  .step-number {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-light, #9ca3af);
  }

  .step-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding-top: 0.25rem;
    min-width: 0;
  }

  .step-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-light, #9ca3af);
    line-height: 1.3;
    transition: color 0.2s ease;
  }

  .step-subtitle {
    font-size: 0.6875rem;
    color: var(--color-text-light, #9ca3af);
    line-height: 1.3;
    opacity: 0.7;
    transition: color 0.2s ease, opacity 0.2s ease;
  }

  /* Connector line */
  .step-connector {
    position: absolute;
    left: calc(1rem - 1px);
    top: 2rem;
    bottom: 0;
    width: 2px;
    background: var(--color-border, #e5e7eb);
    transition: background 0.2s ease;
  }

  .step-connector.completed {
    background: var(--color-primary, #ea726e);
  }

  /* Active state */
  .active .step-circle {
    border-color: var(--color-primary, #ea726e);
    background: rgba(234, 114, 110, 0.1);
    box-shadow: 0 0 0 4px rgba(234, 114, 110, 0.08);
  }

  .active .step-number {
    color: var(--color-primary, #ea726e);
  }

  .active .step-label {
    color: var(--color-text, #111827);
  }

  .active .step-subtitle {
    color: var(--color-text-muted, #6b7280);
    opacity: 1;
  }

  /* Completed state */
  .completed .step-circle {
    border-color: var(--color-primary, #ea726e);
    background: var(--color-primary, #ea726e);
    color: white;
  }

  .completed .step-label {
    color: var(--color-text-muted, #6b7280);
  }

  .completed .step-subtitle {
    color: var(--color-text-light, #9ca3af);
  }

  /* Mobile: horizontal layout */
  @media (max-width: 768px) {
    .step-indicator {
      flex-direction: row;
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--color-border, #e5e7eb);
      padding: 1rem;
      gap: 0.5rem;
      overflow-x: auto;
    }

    .step-item {
      flex-direction: column;
      align-items: center;
      padding-bottom: 0;
      padding-right: 1.5rem;
      flex-shrink: 0;
    }

    .step-item:last-child {
      padding-right: 0;
    }

    .step-connector {
      left: 2rem;
      top: 1rem;
      bottom: auto;
      right: 0;
      width: auto;
      height: 2px;
    }

    .step-text {
      align-items: center;
      text-align: center;
      padding-top: 0.375rem;
    }

    .step-subtitle {
      display: none;
    }
  }
</style>
