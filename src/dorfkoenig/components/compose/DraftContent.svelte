<script lang="ts">
  import { processInlineMarkdown } from '../../bajour/utils';
  import type { Draft } from '../../lib/types';
  import type { DraftBullet, QualityWarning } from '../../bajour/types';

  interface Props {
    draft: Draft & {
      bullets?: DraftBullet[];
      notes_for_editor?: string[];
      quality_warnings?: QualityWarning[];
    };
  }

  let { draft }: Props = $props();

  // Process section content: render inline markdown, convert [source.ch] to pills, preserve line breaks.
  function renderContent(text: string): string {
    let html = processInlineMarkdown(text);
    // Convert source-ref spans into clickable-looking pills
    html = html.replace(
      /<span class="source-ref">\[([^\]]+)\]<\/span>/g,
      '<a class="source-pill" href="https://$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return html;
  }
</script>

<article class="document-content">
  <h1>{draft.title}</h1>
  {#if (draft.quality_warnings && draft.quality_warnings.length > 0) || (draft.notes_for_editor && draft.notes_for_editor.length > 0)}
    <section class="quality-banner" aria-label="Qualitätswarnungen">
      <h2>Qualitätsprüfung</h2>
      <ul>
        {#each (draft.quality_warnings && draft.quality_warnings.length > 0 ? draft.quality_warnings.map((w) => w.message) : draft.notes_for_editor || []).slice(0, 5) as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if draft.headline}
    <p class="lede">{draft.headline}</p>
  {/if}

  {#if draft.bullets && draft.bullets.length > 0}
    <section class="bullet-digest" aria-label="Entwurf">
      {#each draft.bullets as bullet}
        <article class="digest-bullet">
          <span class="bullet-emoji" aria-hidden="true">{bullet.emoji}</span>
          <div class="bullet-body">
            <p>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via processInlineMarkdown -->
              {@html renderContent(bullet.text)}
            </p>
            {#if bullet.source_domain || bullet.article_url}
              <div class="bullet-source">
                {#if bullet.article_url}
                  <a href={bullet.article_url} target="_blank" rel="noopener noreferrer">
                    {bullet.source_domain || 'Quelle'}
                  </a>
                {:else}
                  <span>{bullet.source_domain}</span>
                {/if}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </section>
  {/if}

  {#if draft.sections && draft.sections.length > 0}
    {#each draft.sections as section}
      <section class="draft-section">
        {#if section.heading}
          <h2>{section.heading}</h2>
        {/if}
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
          <li>{gap}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if draft.notes_for_editor && draft.notes_for_editor.length > 0}
    <section class="gaps-section">
      <h2>Hinweise für die Redaktion</h2>
      <ul>
        {#each draft.notes_for_editor as note}
          <li>{note}</li>
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
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0 0 var(--spacing-xl) 0;
    padding-bottom: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    white-space: pre-line;
  }

  .quality-banner {
    margin: 0 0 var(--spacing-lg);
    padding: var(--spacing-md);
    border: 1px solid #f59e0b;
    border-left: 3px solid #d97706;
    border-radius: var(--radius-sm);
    background: #fffbeb;
  }

  .quality-banner h2 {
    color: #92400e;
    margin-bottom: 0.5rem;
  }

  .quality-banner ul {
    margin: 0;
    padding-left: 1.125rem;
    color: #78350f;
    font-size: var(--text-sm);
    line-height: 1.5;
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
    white-space: pre-line;
  }

  .bullet-digest {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    margin-bottom: var(--spacing-xl);
  }

  .digest-bullet {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .bullet-emoji {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    font-size: 1.25rem;
    line-height: 1.5;
  }

  .bullet-body {
    min-width: 0;
  }

  .bullet-body p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-md);
    line-height: 1.7;
    white-space: pre-line;
  }

  .bullet-source {
    display: flex;
    margin-top: 0.5rem;
  }

  .bullet-source a,
  .bullet-source span {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-full);
    background: rgba(234, 114, 110, 0.08);
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    text-decoration: none;
  }

  .bullet-source a:hover {
    background: rgba(234, 114, 110, 0.15);
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

  .document-content :global(.inline-link) {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }

  .document-content :global(.inline-link:hover) {
    color: var(--color-primary-dark);
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
