<script lang="ts">
  import { X, File as FileIcon, Check, AlertTriangle, Clock } from 'lucide-svelte';
  import { manualUploadApi } from '../../lib/api';
  import type { RecentPdfUpload } from '../../lib/types';

  interface Props {
    file: File | null;
    description: string;
    publicationDate: string;
    onfileselect: (e: Event) => void;
    onfileremove: () => void;
    ondescriptionchange: (description: string) => void;
    onpublicationdatechange: (date: string) => void;
  }

  let {
    file,
    description,
    publicationDate,
    onfileselect,
    onfileremove,
    ondescriptionchange,
    onpublicationdatechange,
  }: Props = $props();

  let recent = $state<RecentPdfUpload[]>([]);

  $effect(() => {
    // Load the most recent PDF uploads so the journalist can see what's
    // already been ingested before re-uploading the same file.
    manualUploadApi.recentPdfs(5)
      .then((rows) => { recent = rows; })
      .catch(() => { recent = []; });
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
    if (r.status === 'failed') return 'Fehlgeschlagen';
    return 'In Bearbeitung';
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
    <h4 class="recent-title">Zuletzt hochgeladen</h4>
    <ul class="recent-list">
      {#each recent as r (r.id)}
        <li class="recent-row">
          <span class="recent-icon" class:ok={r.status === 'completed'} class:bad={r.status === 'failed'}>
            {#if r.status === 'completed'}
              <Check size={14} />
            {:else if r.status === 'failed'}
              <AlertTriangle size={14} />
            {:else}
              <Clock size={14} />
            {/if}
          </span>
          <span class="recent-label" title={r.label ?? ''}>{r.label ?? '(ohne Bezeichnung)'}</span>
          <span class="recent-date">{formatDate(r.created_at)}</span>
          <span class="recent-status">{statusLabel(r)}</span>
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
    gap: 0.375rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .recent-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .recent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .recent-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
  }

  .recent-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .recent-icon.ok { color: #16a34a; }
  .recent-icon.bad { color: var(--color-danger, #ef4444); }

  .recent-label {
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .recent-date {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .recent-status {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }
</style>
