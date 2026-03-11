<script lang="ts">
  import { processInlineMarkdown } from '../../bajour/utils';
  import type { Draft } from '../../lib/types';

  interface Props {
    draft: Draft;
  }

  let { draft }: Props = $props();

  // Strip emoji characters from text
  function stripEmojis(text: string): string {
    return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/\s{2,}/g, ' ').trim();
  }

  // Process section content: strip emojis, render inline markdown, convert [source.ch] to pills
  function renderContent(text: string): string {
    const cleaned = stripEmojis(text);
    let html = processInlineMarkdown(cleaned);
    // Convert source-ref spans into clickable-looking pills
    html = html.replace(
      /<span class="source-ref">\[([^\]]+)\]<\/span>/g,
      '<a class="source-pill" href="https://$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return html;
  }
</script>

<article class="document-content">
  <h1>{stripEmojis(draft.title)}</h1>
  {#if draft.headline}
    <p class="lede">{stripEmojis(draft.headline)}</p>
  {/if}

  {#if draft.sections && draft.sections.length > 0}
    {#each draft.sections as section}
      <section class="draft-section">
        <h2>{stripEmojis(section.heading)}</h2>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processInlineMarkdown -->
        <p>{@html renderContent(section.content)}</p>
      </section>
    {/each}
  {/if}

  {#if draft.gaps && draft.gaps.length > 0}
    <section class="gaps-section">
      <h2>Informationslücken</h2>
      <ul>
        {#each draft.gaps as gap}
          <li>{stripEmojis(gap)}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if draft.sources && draft.sources.length > 0}
    <section class="sources-section">
      <h2>Quellen</h2>
      <div class="source-pills">
        {#each draft.sources as source}
          <a class="source-pill" href={source.url} target="_blank" rel="noopener noreferrer">
            {source.title || source.domain}
          </a>
        {/each}
      </div>
    </section>
  {/if}
</article>

<style>
  .document-content {
    padding: var(--spacing-xl) 2.5rem;
    font-family: var(--font-body);
  }

  .document-content h1 {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1.25;
    color: var(--color-text);
    margin: 0 0 var(--spacing-md) 0;
  }

  .document-content .lede {
    font-size: var(--text-lg);
    font-style: italic;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0 0 var(--spacing-xl) 0;
    padding-bottom: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .document-content h2 {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    margin: 0 0 0.75rem 0;
  }

  .draft-section {
    margin-bottom: var(--spacing-lg);
  }

  .draft-section h2 {
    font-size: var(--text-base-sm);
    letter-spacing: 0.06em;
    color: var(--color-text);
    margin: 0 0 var(--spacing-sm) 0;
  }

  .draft-section p {
    font-size: var(--text-md);
    line-height: 1.7;
    color: var(--color-text);
    margin: 0;
  }

  /* Inline source pills */
  .document-content :global(.source-pill) {
    display: inline-flex;
    align-items: center;
    padding: 0.0625rem 0.5rem;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.08);
    border-radius: var(--radius-full);
    text-decoration: none;
    white-space: nowrap;
    vertical-align: baseline;
    transition: background var(--transition-base);
  }

  .document-content :global(.source-pill:hover) {
    background: rgba(234, 114, 110, 0.15);
    text-decoration: none;
  }

  .gaps-section {
    margin-bottom: var(--spacing-xl);
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-warning-dark);
    border-radius: var(--radius-sm);
  }

  .gaps-section ul { margin: 0; padding: 0; list-style: none; }

  .gaps-section li {
    padding-left: var(--spacing-md);
    font-size: var(--text-md);
    line-height: 1.6;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .sources-section {
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .source-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .source-pills .source-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.625rem;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.08);
    border-radius: var(--radius-full);
    text-decoration: none;
    transition: background var(--transition-base);
  }

  .source-pills .source-pill:hover {
    background: rgba(234, 114, 110, 0.15);
  }
</style>
