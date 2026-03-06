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
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=DM+Sans:wght@400;500;600&display=swap');

  .document-content {
    padding: 2rem 2.5rem;
    font-family: 'Source Serif 4', Georgia, serif;
  }

  .document-content h1 {
    font-size: 1.625rem;
    font-weight: 700;
    line-height: 1.25;
    color: #111827;
    margin: 0 0 1rem 0;
  }

  .document-content .lede {
    font-size: 1.125rem;
    font-style: italic;
    color: #4b5563;
    line-height: 1.6;
    margin: 0 0 2rem 0;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .document-content h2 {
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted, #6b7280);
    margin: 0 0 0.75rem 0;
  }

  .draft-section {
    margin-bottom: 1.5rem;
  }

  .draft-section h2 {
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
    color: var(--color-text, #374151);
    margin: 0 0 0.5rem 0;
  }

  .draft-section p {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--color-text, #374151);
    margin: 0;
  }

  .gaps-section {
    margin-bottom: 2rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-left: 3px solid #d1d5db;
    border-radius: 6px;
  }

  .gaps-section ul { margin: 0; padding: 0; list-style: none; }

  .gaps-section li {
    padding-left: 0.75rem;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: #4b5563;
    margin-bottom: 0.5rem;
  }

  .sources-section {
    padding-top: 1.5rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .source-list { margin: 0; padding: 0; list-style: none; }

  .source-list li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.6;
    margin-bottom: 0.375rem;
  }

  .source-num {
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .source-list a {
    color: var(--color-primary, #ea726e);
    text-decoration: none;
  }

  .source-list a:hover { text-decoration: underline; }
</style>
