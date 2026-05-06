<script lang="ts">
  import { onMount } from 'svelte';
  import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileSearch,
    Search,
    X
  } from 'lucide-svelte';
  import { Loading } from '@shared/components';
  import { EmptyState } from '../ui/primitives';
  import DraftCoverageModal from '../compose/DraftCoverageModal.svelte';
  import UnitList from '../compose/UnitList.svelte';
  import UploadDedupDetails from '../ui/UploadDedupDetails.svelte';
  import { manualUploadApi, unitsApi } from '../../lib/api';
  import type { InformationUnit, NewspaperJobStatus, RecentPdfUpload } from '../../lib/types';

  interface Props {
    onfocuschange?: (focused: boolean) => void;
  }

  let { onfocuschange = () => {} }: Props = $props();

  const MAX_UPLOADS = 20;
  const EMPTY_SELECTION = new Set<string>();

  let uploads = $state<RecentPdfUpload[]>([]);
  let selectedUploadId = $state<string | null>(null);
  let uploadUnits = $state<InformationUnit[]>([]);
  let loadingUploads = $state(false);
  let loadingUnits = $state(false);
  let uploadError = $state('');
  let unitsError = $state('');
  let unitsRequestSeq = 0;
  let uploadSearchInput = $state('');
  let showDraftCoverageModal = $state(false);

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
  let displayedUploads = $derived(selectedUpload ? [selectedUpload] : uploads);
  let draftCoverageUnitIds = $derived(new Set(uploadUnits.map((unit) => unit.id)));
  let draftCoverageScopeLabel = $derived(
    selectedUpload ? (selectedUpload.label ?? formatSource(selectedUpload)) : 'Uploads-Inbox'
  );
  let filteredUploadUnits = $derived(
    uploadSearchInput.trim()
      ? uploadUnits.filter((unit) => unitMatchesSearch(unit, uploadSearchInput))
      : uploadUnits
  );

  onMount(() => {
    void loadUploads();
  });

  $effect(() => {
    if (selectedUploadId) {
      void loadUploadUnits(selectedUploadId);
    } else if (uploads.length > 0) {
      void loadAllUploadUnits(uploads);
    } else {
      uploadUnits = [];
    }
  });

  async function loadUploads(): Promise<void> {
    loadingUploads = true;
    uploadError = '';
    try {
      const rows = await manualUploadApi.listPdfs(MAX_UPLOADS);
      uploads = rows;
      if (selectedUploadId && !rows.some((upload) => upload.id === selectedUploadId)) {
        selectedUploadId = null;
        onfocuschange(false);
      }
    } catch (err) {
      uploadError = (err as Error).message;
      uploads = [];
      selectedUploadId = null;
      onfocuschange(false);
    } finally {
      loadingUploads = false;
    }
  }

  async function loadAllUploadUnits(rows: RecentPdfUpload[]): Promise<void> {
    const requestId = ++unitsRequestSeq;
    loadingUnits = true;
    unitsError = '';
    try {
      const batches = await Promise.all(
        rows.map((upload) =>
          unitsApi.list({
            upload_job_id: upload.id,
            unused_only: false,
            limit: 100
          })
        )
      );
      if (requestId === unitsRequestSeq) {
        const seen = new Set<string>();
        uploadUnits = batches.flat().filter((unit) => {
          if (seen.has(unit.id)) return false;
          seen.add(unit.id);
          return true;
        });
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

  function focusUpload(id: string): void {
    selectedUploadId = id;
    uploadSearchInput = '';
    onfocuschange(true);
  }

  function showAllUploads(): void {
    selectedUploadId = null;
    uploadSearchInput = '';
    onfocuschange(false);
  }

  function unitCountLabel(upload: RecentPdfUpload): string {
    const merged = upload.units_merged ?? 0;
    if (upload.status !== 'completed') return statusLabel(upload.status);
    if (merged > 0) return `${upload.units_created} neu, ${merged} dup`;
    return `${upload.units_created} Einheiten`;
  }

  function unitMatchesSearch(unit: InformationUnit, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      unit.statement,
      unit.source_title,
      unit.source_domain,
      unit.topic,
      ...(unit.entities ?? []),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  }
</script>

<div class="uploads-panel">
  <section class="uploads-section" aria-label="PDF-Uploads">
    {#if uploadError}
      <div class="error-message" aria-live="polite">{uploadError}</div>
    {/if}

    {#if selectedUpload}
      <div class="focused-upload-return">
        <button class="back-to-uploads-btn" onclick={showAllUploads} type="button">
          ← Alle Uploads
        </button>
      </div>
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
      <div class="upload-list" class:focused={!!selectedUpload}>
        {#each displayedUploads as upload (upload.id)}
          <button
            class="upload-row"
            class:active={upload.id === selectedUploadId}
            type="button"
            onclick={() => focusUpload(upload.id)}
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

      {#if selectedUpload}
        <div class="upload-detail-panel">
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(selectedUpload.status)}</dd>
            </div>
            <div>
              <dt>Verarbeitet</dt>
              <dd>{formatDate(selectedUpload.completed_at ?? selectedUpload.created_at)}</dd>
            </div>
            <div>
              <dt>Publikation</dt>
              <dd>{selectedUpload.source_citation?.publication ?? formatSource(selectedUpload)}</dd>
            </div>
            <div>
              <dt>Ausgabe</dt>
              <dd>{selectedUpload.source_citation?.issue_label ?? selectedUpload.publication_date ?? '-'}</dd>
            </div>
            <div>
              <dt>Artikel</dt>
              <dd>{selectedUpload.source_citation?.article_title ?? selectedUpload.label ?? '-'}</dd>
            </div>
            <div>
              <dt>Einheiten</dt>
              <dd>{unitCountLabel(selectedUpload)}</dd>
            </div>
            {#if selectedUpload.source_citation?.page}
              <div>
                <dt>Seite</dt>
                <dd>{selectedUpload.source_citation.page}</dd>
              </div>
            {/if}
            {#if selectedUpload.source_citation?.section}
              <div>
                <dt>Rubrik</dt>
                <dd>{selectedUpload.source_citation.section}</dd>
              </div>
            {/if}
            {#if selectedUpload.source_url}
              <div>
                <dt>Quelle</dt>
                <dd>
                  <a href={selectedUpload.source_url} target="_blank" rel="noopener noreferrer">
                    {formatDomain(selectedUpload.source_url)}
                  </a>
                </dd>
              </div>
            {/if}
            {#if selectedUpload.error_message}
              <div class="detail-wide">
                <dt>Fehler</dt>
                <dd>{selectedUpload.error_message}</dd>
              </div>
            {/if}
          </dl>
        </div>
      {/if}
    {/if}
  </section>

  <section class="units-section" aria-labelledby="upload-units-heading">
    <div class="section-heading">
      <div>
        <h2 id="upload-units-heading">{selectedUpload ? 'Inbox' : 'Uploads-Inbox'}</h2>
        <p>
          {#if selectedUpload}
            Einheiten aus diesem PDF.
          {:else}
            Einheiten aus den letzten PDF-Uploads.
          {/if}
        </p>
      </div>
      <span class="section-count">{filteredUploadUnits.length}</span>
    </div>

    <div class="inbox-toolbar">
      <div class="inbox-search">
        <Search size={14} />
        <input
          type="text"
          value={uploadSearchInput}
          oninput={(event) => { uploadSearchInput = event.currentTarget.value; }}
          placeholder={selectedUpload ? 'Einheiten in diesem PDF suchen...' : 'Einheiten suchen...'}
        />
        {#if uploadSearchInput}
          <button
            class="search-clear"
            onclick={() => { uploadSearchInput = ''; }}
            type="button"
            aria-label="Suche löschen"
          >
            <X size={14} />
          </button>
        {/if}
        <button
          class="draft-search-btn"
          onclick={() => { showDraftCoverageModal = true; }}
          type="button"
          title="Draft-Abgleich"
          aria-label="Draft-Abgleich öffnen"
        >
          <FileSearch size={14} />
        </button>
      </div>
    </div>

    {#if selectedUpload}
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
        units={filteredUploadUnits}
        selected={EMPTY_SELECTION}
        ontoggle={() => {}}
        readonly={true}
      />
    {/if}
  </section>
</div>

<DraftCoverageModal
  open={showDraftCoverageModal}
  onclose={() => { showDraftCoverageModal = false; }}
  allowedUnitIds={draftCoverageUnitIds}
  scopeLabel={draftCoverageScopeLabel}
/>

<style>
  .uploads-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .uploads-section,
  .units-section {
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

  .inbox-toolbar {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr);
    gap: 0.625rem;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .inbox-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text-muted);
  }

  .inbox-search:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.12);
  }

  .inbox-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-base-sm);
  }

  .inbox-search input::placeholder {
    color: var(--color-text-light);
  }

  .search-clear,
  .draft-search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
  }

  .draft-search-btn {
    color: var(--color-primary);
  }

  .search-clear:hover,
  .draft-search-btn:hover {
    color: var(--color-text);
    background: var(--color-surface-muted);
  }

  .upload-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0.625rem;
  }

  .upload-list.focused {
    grid-template-columns: 1fr;
  }

  .focused-upload-return {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .back-to-uploads-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4375rem 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--text-base-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .back-to-uploads-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(234, 114, 110, 0.06);
  }

  .upload-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 4.25rem;
    padding: 0.625rem 0.75rem;
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
    font-size: var(--text-base-sm);
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

  .upload-detail-panel {
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .upload-detail-panel dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  .upload-detail-panel div {
    min-width: 0;
  }

  .upload-detail-panel .detail-wide {
    grid-column: 1 / -1;
  }

  .upload-detail-panel dt {
    margin: 0 0 0.125rem;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
  }

  .upload-detail-panel dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .upload-detail-panel a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .upload-detail-panel a:hover {
    text-decoration: underline;
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

  .error-message {
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .error-message {
    color: var(--color-status-error-text);
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
  }

  @media (max-width: 720px) {
    .upload-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .upload-status {
      grid-column: 2;
    }

  }
</style>
