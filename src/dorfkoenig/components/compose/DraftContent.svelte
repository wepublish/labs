<script lang="ts">
  import type { Draft } from '../../lib/types';

  interface Props {
    draft: Draft;
  }

  let { draft }: Props = $props();
</script>

<article class="document-content">
  <h1>{draft.title}</h1>
  <p class="lede">{draft.headline}</p>

  {#if draft.sections && draft.sections.length > 0}
    {#each draft.sections as section}
      <section class="draft-section">
        <h2>{section.heading}</h2>
        <p>{section.content}</p>
      </section>
    {/each}
  {/if}

  {#if draft.gaps && draft.gaps.length > 0}
    <section class="gaps-section">
      <h2>Informationslücken</h2>
      <ul>
        {#each draft.gaps as gap}
          <li>{gap}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if draft.sources && draft.sources.length > 0}
    <section class="sources-section">
      <h2>Quellen</h2>
      <ul class="source-list">
        {#each draft.sources as source, i}
          <li>
            <span class="source-num">{i + 1}</span>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title || source.domain}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</article>

<style>
  .document-content {
    padding: var(--spacing-xl) 2.5rem;
    font-family: var(--font-article);
  }

  .document-content h1 {
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1.25;
    color: var(--color-text);
    margin: 0 0 var(--spacing-md) 0;
  }

  .document-content .lede {
    font-size: var(--text-xl);
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
    font-size: var(--text-lg);
    line-height: 1.7;
    color: var(--color-text);
    margin: 0;
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

  .source-list { margin: 0; padding: 0; list-style: none; }

  .source-list li {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-sm);
    font-size: var(--text-base);
    line-height: 1.6;
    margin-bottom: 0.375rem;
  }

  .source-num {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-light);
    flex-shrink: 0;
  }

  .source-list a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .source-list a:hover { text-decoration: underline; }
</style>
