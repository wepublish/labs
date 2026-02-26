<script lang="ts">
  import type { BajourDraftGenerated } from '../types';
  import { processInlineMarkdown } from '../utils';

  interface Props {
    draft: BajourDraftGenerated;
  }

  let { draft }: Props = $props();
</script>

<div class="draft-preview">
  <h2 class="draft-title">{draft.title}</h2>

  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processText -->
  <p class="draft-greeting">{@html processInlineMarkdown(draft.greeting)}</p>

  {#each draft.sections as section}
    <div class="draft-section">
      <h3 class="section-heading">{section.heading}</h3>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processText -->
      <p class="section-body">{@html processInlineMarkdown(section.body)}</p>
    </div>
  {/each}

  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processText -->
  <p class="draft-outlook">{@html processInlineMarkdown(draft.outlook)}</p>

  <p class="draft-signoff">{draft.sign_off}</p>
</div>

<style>
  .draft-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .draft-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text, #111827);
    margin: 0;
    line-height: 1.3;
  }

  .draft-greeting {
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    line-height: 1.6;
    margin: 0;
  }

  .draft-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-heading {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text, #111827);
    margin: 0;
  }

  .section-body {
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    line-height: 1.6;
    margin: 0;
  }

  .draft-outlook {
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    line-height: 1.6;
    margin: 0;
    font-style: italic;
  }

  .draft-signoff {
    font-size: 0.8125rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0;
  }

  .draft-preview :global(strong) {
    font-weight: 600;
  }

  .draft-preview :global(.source-ref) {
    font-size: 0.6875rem;
    color: var(--color-text-muted, #6b7280);
  }
</style>
