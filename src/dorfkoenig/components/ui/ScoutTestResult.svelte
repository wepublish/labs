<script lang="ts">
  import ProgressIndicator from './ProgressIndicator.svelte';
  import type { TestResult } from '../../lib/types';

  interface Props {
    testResult: TestResult;
  }

  let { testResult }: Props = $props();
</script>

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

<style>
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
</style>
