<script lang="ts">
  import {
    X,
    File as FileIcon,
    Check,
    AlertTriangle,
    Clock,
    ListChecks,
    ChevronDown,
    ChevronRight,
  } from 'lucide-svelte';
  import { manualUploadApi } from '../../lib/api';
  import type { RecentPdfUpload } from '../../lib/types';
  import UploadDedupDetails from './UploadDedupDetails.svelte';

  const RECENT_REFRESH_INTERVAL_MS = 10_000;

  interface Props {
    file: File | null;
    description: string;
    publicationDate: string;
    onfileselect: (e: Event) => void;
    onfileremove: () => void;
    ondescriptionchange: (description: string) => void;
    onpublicationdatechange: (date: string) => void;
    onresumejob?: (jobId: string) => void;
  }

  let {
    file,
    description,
    publicationDate,
    onfileselect,
    onfileremove,
    ondescriptionchange,
    onpublicationdatechange,
    onresumejob,
  }: Props = $props();

  let recent = $state<RecentPdfUpload[]>([]);
  let expandedUploadId = $state<string | null>(null);

  async function loadRecentUploads(): Promise<void> {
    try {
      recent = await manualUploadApi.recentPdfs(5);
    } catch {
      recent = [];
    }
  }

  $effect(() => {
    // Load the most recent PDF uploads so the journalist can see what's
    // already been ingested before re-uploading the same file.
    void loadRecentUploads();
    const interval = setInterval(() => { void loadRecentUploads(); }, RECENT_REFRESH_INTERVAL_MS);
    return () => { clearInterval(interval); };
  });

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const DATE_FMT = new Intl.DateTimeFormat('de-CH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  function formatDate(iso: string): string {
    try { return DATE_FMT.format(new Date(iso)); } catch { return iso; }
  }

  function statusLabel(r: RecentPdfUpload): string {
    if (r.status === 'completed') {
      const merged = r.units_merged ?? 0;
      if (merged > 0) return `${r.units_created} neu, ${merged} Duplikate`;
      return `${r.units_created} Einheiten`;
    }
    if (r.status === 'review_pending') return 'Bereit zur Prüfung';
    if (r.status === 'storing') return 'Speichert';
    if (r.status === 'failed') return 'Fehlgeschlagen';
    if (r.status === 'cancelled') return 'Abgebrochen';
    return 'In Bearbeitung';
  }

  function stageLabel(r: RecentPdfUpload): string {
    if (r.status === 'processing') {
      if (r.stage === 'parsing_pdf') return 'PDF wird gelesen';
      if (r.stage === 'chunking') return 'Wird aufgeteilt';
      if (r.stage === 'extracting') return 'KI extrahiert';
    }
    if (r.status === 'storing') return 'Speichert Einheiten';
    return statusLabel(r);
  }

  function progressLabel(r: RecentPdfUpload): string {
    if (r.chunks_total > 0 && (r.status === 'processing' || r.status === 'storing')) {
      return `${Math.min(r.chunks_processed, r.chunks_total)}/${r.chunks_total} Abschnitte`;
    }
    if (r.status === 'completed') {
      return statusLabel(r);
    }
    return stageLabel(r);
  }

  function canResume(r: RecentPdfUpload): boolean {
    return r.status === 'review_pending' || r.status === 'processing' || r.status === 'storing';
  }

  function actionLabel(r: RecentPdfUpload): string {
    if (r.status === 'review_pending') return 'Prüfen';
    return 'Öffnen';
  }

  function toggleExpanded(id: string): void {
    expandedUploadId = expandedUploadId === id ? null : id;
  }
</script>

<div class="form-group">
  <label for="upload-pdf">PDF-Dokument</label>
  {#if file}
    <div class="file-info">
      <FileIcon size={20} />
      <div class="file-details">
        <span class="file-name">{file.name}</span>
        <span class="file-size">{formatFileSize(file.size)}</span>
      </div>
      <button class="file-remove" onclick={onfileremove}>
        <X size={14} />
      </button>
    </div>
  {:else}
    <label class="file-drop" for="upload-pdf-input">
      <FileIcon size={24} />
      <span>PDF auswählen</span>
      <span class="file-drop-hint">max 100 MB</span>
    </label>
    <input
      id="upload-pdf-input"
      type="file"
      accept="application/pdf"
      onchange={onfileselect}
      class="file-input-hidden"
    />
  {/if}
</div>
<div class="form-group">
  <label for="upload-pdf-date">Publikationsdatum</label>
  <input
    id="upload-pdf-date"
    type="date"
    value={publicationDate}
    oninput={(e) => onpublicationdatechange(e.currentTarget.value)}
  />
</div>
<div class="form-group">
  <label for="upload-pdf-desc">Bezeichnung <span class="optional">(optional)</span></label>
  <textarea
    id="upload-pdf-desc"
    value={description}
    oninput={(e) => ondescriptionchange(e.currentTarget.value)}
    placeholder="z.B. Wochenblatt 19. März 2026"
    rows="2"
  ></textarea>
</div>

<p class="pdf-gemeinde-hint">
  Die KI erkennt automatisch, welche Gemeinden im PDF vorkommen, und ordnet jede
  Information der entsprechenden Gemeinde zu. Kein Ort erforderlich.
</p>

{#if recent.length > 0}
  <div class="recent-uploads">
    <div class="recent-header">
      <h4 class="recent-title">Zuletzt hochgeladen</h4>
      <span class="recent-subtitle">Upload-Log</span>
    </div>
    <ul class="recent-list">
      {#each recent as r (r.id)}
        {@const expanded = expandedUploadId === r.id}
        <li class="recent-row">
          <div class="recent-row-main">
            <button
              class="recent-toggle"
              type="button"
              aria-expanded={expanded}
              onclick={() => toggleExpanded(r.id)}
            >
              {#if expanded}
                <ChevronDown size={14} />
              {:else}
                <ChevronRight size={14} />
              {/if}
            </button>
            <span class="recent-icon" class:ok={r.status === 'completed'} class:bad={r.status === 'failed'}>
              {#if r.status === 'completed'}
                <Check size={14} />
              {:else if r.status === 'failed'}
                <AlertTriangle size={14} />
              {:else}
                <Clock size={14} />
              {/if}
            </span>
            <div class="recent-main-text">
              <span class="recent-label" title={r.label ?? ''}>{r.label ?? '(ohne Bezeichnung)'}</span>
              <span class="recent-meta">{formatDate(r.created_at)} · {progressLabel(r)}</span>
            </div>
            <span class="recent-status">{stageLabel(r)}</span>
            {#if canResume(r)}
              <button
                class="recent-action"
                type="button"
                aria-label={actionLabel(r) === 'Prüfen' ? 'Upload prüfen' : 'Upload öffnen'}
                title={actionLabel(r) === 'Prüfen' ? 'Upload prüfen' : 'Upload öffnen'}
                onclick={(e) => {
                  e.stopPropagation();
                  onresumejob?.(r.id);
                }}
              >
                {#if r.status === 'review_pending'}
                  <ListChecks size={14} />
                {:else}
                  <Clock size={14} />
                {/if}
                <span>{actionLabel(r)}</span>
              </button>
            {:else}
              <span class="recent-action-spacer"></span>
            {/if}
          </div>

          {#if expanded}
            <div class="recent-details">
              <dl class="recent-detail-grid">
                <div>
                  <dt>Status</dt>
                  <dd>{r.status}</dd>
                </div>
                <div>
                  <dt>Stage</dt>
                  <dd>{r.stage ?? '—'}</dd>
                </div>
                <div>
                  <dt>Abschnitte</dt>
                  <dd>{r.chunks_processed}/{r.chunks_total}</dd>
                </div>
                <div>
                  <dt>Einheiten</dt>
                  <dd>{r.units_created} neu / {r.units_merged ?? 0} dup</dd>
                </div>
                <div>
                  <dt>Erstellt</dt>
                  <dd>{formatDate(r.created_at)}</dd>
                </div>
                <div>
                  <dt>Fertig</dt>
                  <dd>{r.completed_at ? formatDate(r.completed_at) : '—'}</dd>
                </div>
              </dl>

              {#if r.error_message}
                <p class="recent-error">{r.error_message}</p>
              {/if}

              {#if r.dedup_summary && r.dedup_summary.length > 0}
                <UploadDedupDetails details={r.dedup_summary} />
              {/if}

              {#if r.skipped_items && r.skipped_items.length > 0}
                <div class="skipped-block">
                  <h5>Übersprungen ({r.skipped_items.length})</h5>
                  <ul>
                    {#each r.skipped_items.slice(0, 6) as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .optional {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .form-group textarea,
  .form-group input[type="date"] {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
    font-family: inherit;
    resize: vertical;
  }

  .form-group textarea:focus,
  .form-group input[type="date"]:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .file-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    overflow: hidden;
  }

  .file-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
    border: 2px dashed var(--color-border, #e5e7eb);
    border-radius: 0.5rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }

  .file-drop:hover {
    border-color: var(--color-primary);
    background: rgba(234, 114, 110, 0.04);
  }

  .file-drop span {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .file-drop-hint {
    font-size: 0.75rem !important;
    font-weight: 400 !important;
    color: var(--color-text-light);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text-muted);
  }

  .file-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .file-remove {
    position: static;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 50%;
    background: var(--color-surface-muted, #e5e7eb);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background 0.15s;
  }

  .file-remove:hover {
    background: var(--color-danger, #ef4444);
    color: white;
  }

  .pdf-gemeinde-hint {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .recent-uploads {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--color-surface, white);
  }

  .recent-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .recent-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .recent-subtitle {
    color: var(--color-text-light);
    font-size: 0.75rem;
  }

  .recent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .recent-row {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.625rem;
    font-size: 0.8125rem;
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    border: 1px solid var(--color-border, #e5e7eb);
  }

  .recent-row-main {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem;
  }

  .recent-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
  }

  .recent-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .recent-icon.ok { color: #16a34a; }
  .recent-icon.bad { color: var(--color-danger, #ef4444); }

  .recent-main-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .recent-label {
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .recent-meta {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .recent-status {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .recent-action,
  .recent-action-spacer {
    min-width: 4.5rem;
  }

  .recent-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    height: 1.75rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-surface, white);
    color: var(--color-text);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .recent-action:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .recent-details {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding-left: 2rem;
  }

  .recent-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.375rem 0.75rem;
    margin: 0;
  }

  .recent-detail-grid div {
    min-width: 0;
  }

  .recent-detail-grid dt {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
  }

  .recent-detail-grid dd {
    margin: 0.125rem 0 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .recent-error {
    margin: 0;
    color: var(--color-danger, #ef4444);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .skipped-block {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .skipped-block h5 {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text);
  }

  .skipped-block ul {
    margin: 0;
    padding-left: 1rem;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  @media (max-width: 640px) {
    .recent-row-main {
      grid-template-columns: auto auto minmax(0, 1fr);
    }

    .recent-status,
    .recent-action,
    .recent-action-spacer {
      grid-column: 3;
      justify-self: start;
    }

    .recent-details {
      padding-left: 0;
    }

    .recent-detail-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
