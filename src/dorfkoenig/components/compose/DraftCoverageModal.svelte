<script lang="ts">
  import { FileSearch, Loader2, Search, X } from 'lucide-svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { unitsApi } from '../../lib/api';
  import type { InformationUnit } from '../../lib/types';

  interface SearchParams {
    location_city?: string;
    topic?: string;
    scout_id?: string;
    unused_only?: boolean;
  }

  interface Props {
    open: boolean;
    onclose: () => void;
    searchParams?: SearchParams;
    allowedUnitIds?: Set<string>;
    scopeLabel?: string;
  }

  type CoverageStatus = 'found' | 'likely' | 'weak' | 'missing' | 'error';

  interface CoverageResult {
    query: string;
    status: CoverageStatus;
    matches: InformationUnit[];
    error?: string;
  }

  let {
    open,
    onclose,
    searchParams = {},
    allowedUnitIds,
    scopeLabel = 'Inbox',
  }: Props = $props();

  const MAX_COVERAGE_QUERIES = 12;
  const COVERAGE_MIN_QUERY_LENGTH = 24;
  const COVERAGE_SEARCH_LIMIT = 3;
  const SCOPED_SEARCH_LIMIT = 50;
  const COVERAGE_MIN_SIMILARITY = 0.18;

  let draftText = $state('');
  let loading = $state(false);
  let error = $state('');
  let results = $state<CoverageResult[]>([]);
  let searchRequestSeq = 0;

  function cleanDraftLine(value: string): string {
    return value
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*•]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractDraftQueries(value: string): string[] {
    const normalized = value.replace(/\r/g, '\n');
    const lines = normalized
      .split(/\n+/)
      .map(cleanDraftLine)
      .filter((line) => line.length >= COVERAGE_MIN_QUERY_LENGTH);

    const chunks: string[] = [];
    for (const line of lines) {
      if (line.length <= 260) {
        chunks.push(line);
        continue;
      }

      const sentences = line
        .split(/[.!?]\s+/)
        .map(cleanDraftLine)
        .filter((sentence) => sentence.length >= COVERAGE_MIN_QUERY_LENGTH);
      chunks.push(...(sentences.length > 1 ? sentences : [line]));
    }

    const seen = new Set<string>();
    const queries: string[] = [];
    for (const chunk of chunks) {
      const query = chunk.length > 320 ? `${chunk.slice(0, 317)}...` : chunk;
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(query);
      if (queries.length >= MAX_COVERAGE_QUERIES) break;
    }
    return queries;
  }

  function coverageStatus(matches: InformationUnit[]): CoverageStatus {
    const score = matches[0]?.similarity ?? 0;
    if (score >= 0.82) return 'found';
    if (score >= 0.62) return 'likely';
    if (score >= 0.38) return 'weak';
    return 'missing';
  }

  function coverageLabel(status: CoverageStatus): string {
    if (status === 'found') return 'Gefunden';
    if (status === 'likely') return 'Wahrscheinlich';
    if (status === 'weak') return 'Schwach';
    if (status === 'error') return 'Fehler';
    return 'Fehlt';
  }

  function scoreLabel(unit: InformationUnit): string {
    return unit.similarity === undefined ? '-' : `${Math.round(unit.similarity * 100)}%`;
  }

  function formatDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onclose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }

  function handlePaste() {
    window.setTimeout(() => {
      if (draftText.trim().length > 0) void runCoverageCheck();
    }, 0);
  }

  async function runCoverageCheck(): Promise<void> {
    const queries = extractDraftQueries(draftText);
    const requestId = ++searchRequestSeq;
    results = [];
    error = '';

    if (queries.length === 0) {
      error = 'Kein prüfbarer Text gefunden.';
      return;
    }

    if (allowedUnitIds && allowedUnitIds.size === 0) {
      error = 'Die aktuelle Inbox enthält keine Einheiten.';
      return;
    }

    loading = true;
    try {
      for (const query of queries) {
        try {
          const matches = await unitsApi.search(query, {
            ...searchParams,
            unused_only: false,
            min_similarity: COVERAGE_MIN_SIMILARITY,
            limit: allowedUnitIds ? SCOPED_SEARCH_LIMIT : COVERAGE_SEARCH_LIMIT,
          });
          if (requestId !== searchRequestSeq) return;

          const scopedMatches = allowedUnitIds
            ? matches.filter((match) => allowedUnitIds.has(match.id)).slice(0, COVERAGE_SEARCH_LIMIT)
            : matches.slice(0, COVERAGE_SEARCH_LIMIT);

          results = [
            ...results,
            {
              query,
              matches: scopedMatches,
              status: coverageStatus(scopedMatches),
            },
          ];
        } catch (err) {
          if (requestId !== searchRequestSeq) return;
          results = [
            ...results,
            {
              query,
              matches: [],
              status: 'error',
              error: (err as Error).message,
            },
          ];
        }
      }
    } finally {
      if (requestId === searchRequestSeq) {
        loading = false;
      }
    }
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="draft-coverage-title"
    tabindex="-1"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div class="modal-card" use:focusTrap>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-icon">
            <FileSearch size={20} />
          </div>
          <div>
            <h2 id="draft-coverage-title">Draft-Abgleich</h2>
            <p>{scopeLabel}</p>
          </div>
        </div>
        <button class="modal-close" onclick={onclose} aria-label="Schliessen" type="button">
          <X size={18} />
        </button>
      </div>

      <div class="modal-body">
        <textarea
          bind:value={draftText}
          rows="8"
          placeholder="Draft oder Bullet-Liste einfügen..."
          aria-label="Draft oder Bullet-Liste"
          onpaste={handlePaste}
        ></textarea>

        <div class="modal-actions">
          <span>{results.length} Textstellen</span>
          <button
            class="primary-action"
            type="button"
            disabled={loading || draftText.trim().length === 0}
            onclick={runCoverageCheck}
          >
            {#if loading}
              <Loader2 size={15} class="spin" />
            {:else}
              <Search size={15} />
            {/if}
            <span>Prüfen</span>
          </button>
        </div>

        {#if error}
          <div class="error-message" aria-live="polite">{error}</div>
        {/if}

        {#if results.length > 0}
          <div class="coverage-results">
            {#each results as result}
              <article class="coverage-row status-{result.status}">
                <div class="coverage-row-header">
                  <span class="coverage-badge">{coverageLabel(result.status)}</span>
                  <p>{result.query}</p>
                </div>

                {#if result.error}
                  <div class="coverage-error">{result.error}</div>
                {:else if result.matches.length === 0}
                  <div class="no-match">Kein Treffer</div>
                {:else}
                  <ol class="match-list">
                    {#each result.matches as match}
                      <li>
                        <span class="match-score">{scoreLabel(match)}</span>
                        <span class="match-statement">{match.statement}</span>
                        <span class="match-source">
                          {#if match.source_url}
                            <a href={match.source_url} target="_blank" rel="noopener noreferrer">
                              {formatDomain(match.source_url)}
                            </a>
                          {:else}
                            {match.source_domain}
                          {/if}
                        </span>
                      </li>
                    {/each}
                  </ol>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: var(--color-backdrop);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    display: flex;
    flex-direction: column;
    width: min(52rem, 100%);
    max-height: min(48rem, calc(100vh - 3rem));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-xl);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .modal-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .modal-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
  }

  .modal-header h2 {
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
  }

  .modal-header p {
    margin: 0.125rem 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .modal-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .modal-close:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    overflow-y: auto;
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--text-sm);
    line-height: 1.5;
    resize: vertical;
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 2rem;
    padding: 0 0.875rem;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: white;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .primary-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .coverage-results {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .coverage-row {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--color-border);
    border-left: 3px solid #9ca3af;
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .coverage-row.status-found {
    border-left-color: #16a34a;
  }

  .coverage-row.status-likely {
    border-left-color: #2563eb;
  }

  .coverage-row.status-weak {
    border-left-color: #d97706;
  }

  .coverage-row.status-missing,
  .coverage-row.status-error {
    border-left-color: var(--color-danger, #ef4444);
  }

  .coverage-row-header {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
  }

  .coverage-row-header p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .coverage-badge {
    flex: 0 0 auto;
    min-width: 6.25rem;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
  }

  .match-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .match-list li {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) auto;
    gap: 0.625rem;
    align-items: baseline;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .match-score {
    font-weight: 700;
    color: var(--color-text);
  }

  .match-statement {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .match-source a {
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .match-source a:hover {
    color: var(--color-primary);
  }

  .no-match,
  .coverage-error,
  .error-message {
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .no-match {
    color: var(--color-text-muted);
    background: var(--color-surface-muted);
  }

  .coverage-error,
  .error-message {
    color: var(--color-status-error-text);
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 720px) {
    .modal-backdrop {
      align-items: stretch;
      padding: 0;
    }

    .modal-card {
      max-height: none;
      border-radius: 0;
    }

    .coverage-row-header,
    .match-list li {
      grid-template-columns: 1fr;
    }

    .coverage-row-header {
      flex-direction: column;
    }
  }
</style>
