<script lang="ts">
  import { onMount } from 'svelte';
  import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileSearch,
    Loader2,
    RefreshCw,
    Search
  } from 'lucide-svelte';
  import { Loading } from '@shared/components';
  import { EmptyState } from '../ui/primitives';
  import UnitList from '../compose/UnitList.svelte';
  import UploadDedupDetails from '../ui/UploadDedupDetails.svelte';
  import { manualUploadApi, unitsApi } from '../../lib/api';
  import type { InformationUnit, NewspaperJobStatus, RecentPdfUpload } from '../../lib/types';

  const MAX_UPLOADS = 20;
  const MAX_COVERAGE_QUERIES = 12;
  const COVERAGE_MIN_QUERY_LENGTH = 24;
  const COVERAGE_SEARCH_LIMIT = 3;
  const COVERAGE_MIN_SIMILARITY = 0.18;
  const EMPTY_SELECTION = new Set<string>();

  type CoverageStatus = 'found' | 'likely' | 'weak' | 'missing' | 'error';

  interface CoverageResult {
    query: string;
    status: CoverageStatus;
    matches: InformationUnit[];
    error?: string;
  }

  let uploads = $state<RecentPdfUpload[]>([]);
  let selectedUploadId = $state<string | null>(null);
  let uploadUnits = $state<InformationUnit[]>([]);
  let loadingUploads = $state(false);
  let loadingUnits = $state(false);
  let uploadError = $state('');
  let unitsError = $state('');
  let unitsRequestSeq = 0;

  let draftText = $state('');
  let coverageLoading = $state(false);
  let coverageError = $state('');
  let coverageResults = $state<CoverageResult[]>([]);

  const DATE_FMT = new Intl.DateTimeFormat('de-CH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let selectedUpload = $derived(
    selectedUploadId ? (uploads.find((upload) => upload.id === selectedUploadId) ?? null) : null
  );

  onMount(() => {
    void loadUploads();
  });

  $effect(() => {
    if (selectedUploadId) {
      void loadUploadUnits(selectedUploadId);
    } else {
      uploadUnits = [];
    }
  });

  async function loadUploads(): Promise<void> {
    const previousSelectedId = selectedUploadId;
    loadingUploads = true;
    uploadError = '';
    try {
      const rows = await manualUploadApi.listPdfs(MAX_UPLOADS);
      uploads = rows;
      if (rows.length === 0) {
        selectedUploadId = null;
      } else if (!selectedUploadId || !rows.some((upload) => upload.id === selectedUploadId)) {
        selectedUploadId = rows[0].id;
      }
      if (selectedUploadId && selectedUploadId === previousSelectedId) {
        void loadUploadUnits(selectedUploadId);
      }
    } catch (err) {
      uploadError = (err as Error).message;
      uploads = [];
      selectedUploadId = null;
    } finally {
      loadingUploads = false;
    }
  }

  async function loadUploadUnits(uploadId: string): Promise<void> {
    const requestId = ++unitsRequestSeq;
    loadingUnits = true;
    unitsError = '';
    try {
      const rows = await unitsApi.list({
        upload_job_id: uploadId,
        unused_only: false,
        limit: 100
      });
      if (requestId === unitsRequestSeq) {
        uploadUnits = rows;
      }
    } catch (err) {
      if (requestId === unitsRequestSeq) {
        unitsError = (err as Error).message;
        uploadUnits = [];
      }
    } finally {
      if (requestId === unitsRequestSeq) {
        loadingUnits = false;
      }
    }
  }

  function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    try {
      return DATE_FMT.format(new Date(value));
    } catch {
      return value;
    }
  }

  function formatSource(upload: RecentPdfUpload): string {
    if (upload.source_citation?.publication) return upload.source_citation.publication;
    if (upload.source_url) return formatDomain(upload.source_url);
    return 'PDF';
  }

  function formatDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  function statusLabel(status: NewspaperJobStatus): string {
    if (status === 'completed') return 'Abgeschlossen';
    if (status === 'review_pending') return 'Prüfung offen';
    if (status === 'processing') return 'In Bearbeitung';
    if (status === 'storing') return 'Speichert';
    if (status === 'failed') return 'Fehlgeschlagen';
    return 'Abgebrochen';
  }

  function unitCountLabel(upload: RecentPdfUpload): string {
    const merged = upload.units_merged ?? 0;
    if (upload.status !== 'completed') return statusLabel(upload.status);
    if (merged > 0) return `${upload.units_created} neu, ${merged} dup`;
    return `${upload.units_created} Einheiten`;
  }

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

  async function runCoverageCheck(): Promise<void> {
    const queries = extractDraftQueries(draftText);
    coverageResults = [];
    coverageError = '';
    if (queries.length === 0) {
      coverageError = 'Kein prüfbarer Text gefunden.';
      return;
    }

    coverageLoading = true;
    try {
      for (const query of queries) {
        try {
          const matches = await unitsApi.search(query, {
            unused_only: false,
            min_similarity: COVERAGE_MIN_SIMILARITY,
            limit: COVERAGE_SEARCH_LIMIT
          });
          coverageResults = [
            ...coverageResults,
            {
              query,
              matches,
              status: coverageStatus(matches)
            }
          ];
        } catch (err) {
          coverageResults = [
            ...coverageResults,
            {
              query,
              matches: [],
              status: 'error',
              error: (err as Error).message
            }
          ];
        }
      }
    } finally {
      coverageLoading = false;
    }
  }
</script>

<div class="uploads-panel">
  <section class="uploads-section" aria-labelledby="uploads-heading">
    <div class="section-heading">
      <div>
        <h2 id="uploads-heading">PDF-Uploads</h2>
        <p>{uploads.length} Uploads</p>
      </div>
      <button
        class="icon-button"
        type="button"
        onclick={loadUploads}
        disabled={loadingUploads}
        title="Aktualisieren"
      >
        <RefreshCw size={15} class={loadingUploads ? 'spin' : ''} />
      </button>
    </div>

    {#if uploadError}
      <div class="error-message" aria-live="polite">{uploadError}</div>
    {/if}

    {#if loadingUploads && uploads.length === 0}
      <Loading label="Uploads laden..." />
    {:else if uploads.length === 0}
      <EmptyState
        icon={FileSearch}
        title="Keine PDF-Uploads"
        description="Es wurden noch keine PDF-Uploads gefunden."
      />
    {:else}
      <div class="upload-list">
        {#each uploads as upload (upload.id)}
          <button
            class="upload-row"
            class:active={upload.id === selectedUploadId}
            type="button"
            onclick={() => {
              selectedUploadId = upload.id;
            }}
          >
            <span
              class="upload-icon"
              class:bad={upload.status === 'failed'}
              class:ok={upload.status === 'completed'}
            >
              {#if upload.status === 'completed'}
                <CheckCircle2 size={16} />
              {:else if upload.status === 'failed'}
                <AlertTriangle size={16} />
              {:else}
                <Clock size={16} />
              {/if}
            </span>
            <span class="upload-main">
              <span class="upload-title">{upload.label ?? '(ohne Bezeichnung)'}</span>
              <span class="upload-meta"
                >{formatDate(upload.created_at)} · {formatSource(upload)}</span
              >
            </span>
            <span class="upload-status">{unitCountLabel(upload)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="units-section" aria-labelledby="upload-units-heading">
    <div class="section-heading">
      <div>
        <h2 id="upload-units-heading">Einheiten aus Upload</h2>
        <p>
          {#if selectedUpload}
            {selectedUpload.label ?? formatSource(selectedUpload)}
          {:else}
            Kein Upload ausgewählt
          {/if}
        </p>
      </div>
      <span class="section-count">{uploadUnits.length}</span>
    </div>

    {#if selectedUpload}
      <div class="upload-detail-strip">
        <span>{statusLabel(selectedUpload.status)}</span>
        <span>{formatDate(selectedUpload.completed_at ?? selectedUpload.created_at)}</span>
        {#if selectedUpload.source_url}
          <a href={selectedUpload.source_url} target="_blank" rel="noopener noreferrer">
            {formatDomain(selectedUpload.source_url)}
          </a>
        {/if}
      </div>

      {#if selectedUpload.dedup_summary && selectedUpload.dedup_summary.length > 0}
        <UploadDedupDetails details={selectedUpload.dedup_summary} />
      {/if}

      {#if selectedUpload.skipped_items && selectedUpload.skipped_items.length > 0}
        <div class="skipped-block">
          <h3>Übersprungen ({selectedUpload.skipped_items.length})</h3>
          <ul>
            {#each selectedUpload.skipped_items.slice(0, 8) as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}

    {#if unitsError}
      <div class="error-message" aria-live="polite">{unitsError}</div>
    {/if}

    {#if loadingUnits}
      <Loading label="Einheiten laden..." />
    {:else}
      <UnitList
        units={uploadUnits}
        selected={EMPTY_SELECTION}
        ontoggle={() => {}}
        readonly={true}
      />
    {/if}
  </section>

  <section class="coverage-section" aria-labelledby="coverage-heading">
    <div class="section-heading">
      <div>
        <h2 id="coverage-heading">Draft-Abgleich</h2>
        <p>{coverageResults.length} geprüfte Textstellen</p>
      </div>
    </div>

    <div class="coverage-input">
      <textarea
        bind:value={draftText}
        rows="7"
        placeholder="Manuellen Draft oder Bullet-Liste einfügen..."
      ></textarea>
      <button
        class="primary-action"
        type="button"
        disabled={coverageLoading || draftText.trim().length === 0}
        onclick={runCoverageCheck}
      >
        {#if coverageLoading}
          <Loader2 size={15} class="spin" />
        {:else}
          <Search size={15} />
        {/if}
        <span>Datenbank prüfen</span>
      </button>
    </div>

    {#if coverageError}
      <div class="error-message" aria-live="polite">{coverageError}</div>
    {/if}

    {#if coverageResults.length > 0}
      <div class="coverage-results">
        {#each coverageResults as result}
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
  </section>
</div>

<style>
  .uploads-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .uploads-section,
  .units-section,
  .coverage-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .section-heading h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text);
  }

  .section-heading p {
    margin: 0.125rem 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .section-count {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .icon-button:hover:not(:disabled) {
    color: var(--color-text);
    border-color: var(--color-primary);
  }

  .icon-button:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .upload-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .upload-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--transition-base),
      background var(--transition-base),
      box-shadow var(--transition-base);
  }

  .upload-row:hover,
  .upload-row.active {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(234, 114, 110, 0.06);
  }

  .upload-row.active {
    background: rgba(234, 114, 110, 0.04);
  }

  .upload-icon {
    display: inline-flex;
    color: var(--color-text-muted);
  }

  .upload-icon.ok {
    color: #16a34a;
  }

  .upload-icon.bad {
    color: var(--color-danger, #ef4444);
  }

  .upload-main {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .upload-title {
    overflow: hidden;
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .upload-meta,
  .upload-status {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .upload-status {
    white-space: nowrap;
  }

  .upload-detail-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .upload-detail-strip span,
  .upload-detail-strip a {
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface-muted);
    color: inherit;
    text-decoration: none;
  }

  .upload-detail-strip a:hover {
    color: var(--color-primary);
  }

  .skipped-block {
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
  }

  .skipped-block h3 {
    margin: 0 0 0.5rem;
    font-size: var(--text-sm);
  }

  .skipped-block ul {
    margin: 0;
    padding-left: 1.1rem;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .coverage-input {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .coverage-input textarea {
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

  .coverage-input textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
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
    .upload-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .upload-status {
      grid-column: 2;
    }

    .match-list li {
      grid-template-columns: 2.75rem minmax(0, 1fr);
    }

    .match-source {
      grid-column: 2;
    }
  }
</style>
