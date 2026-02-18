<script lang="ts">
  import type { Draft } from '../../lib/types';

  interface Props {
    draft: Draft;
  }

  let { draft }: Props = $props();
</script>

<div class="draft-preview">
  <h2 class="draft-title">{draft.title}</h2>
  <p class="draft-headline">{draft.headline}</p>

  {#each draft.sections as section}
    <section class="draft-section">
      <h3>{section.heading}</h3>
      <p>{section.content}</p>
    </section>
  {/each}

  {#if draft.gaps.length > 0}
    <div class="draft-gaps">
      <h4>Informationslücken</h4>
      <ul>
        {#each draft.gaps as gap}
          <li>{gap}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if draft.sources.length > 0}
    <div class="draft-sources">
      <h4>Quellen</h4>
      {#each draft.sources as source}
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.title || source.domain}
        </a>
      {/each}
    </div>
  {/if}

  <div class="draft-meta">
    <span>{draft.word_count} Wörter</span>
    <span>{draft.units_used} Einheiten verwendet</span>
  </div>
</div>

<style>
  .draft-meta {
    display: flex;
    gap: var(--spacing-md);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--color-border);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
