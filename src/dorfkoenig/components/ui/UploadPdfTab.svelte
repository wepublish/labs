<script lang="ts">
  import { X, File as FileIcon } from 'lucide-svelte';

  interface Props {
    file: File | null;
    description: string;
    onfileselect: (e: Event) => void;
    onfileremove: () => void;
    ondescriptionchange: (description: string) => void;
  }

  let {
    file,
    description,
    onfileselect,
    onfileremove,
    ondescriptionchange,
  }: Props = $props();

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      <span class="file-drop-hint">max 50 MB</span>
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
  <label for="upload-pdf-desc">Beschreibung</label>
  <textarea
    id="upload-pdf-desc"
    value={description}
    oninput={(e) => ondescriptionchange(e.currentTarget.value)}
    placeholder="Worum geht es in diesem Dokument?"
    rows="3"
  ></textarea>
</div>

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

  .form-group textarea {
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

  .form-group textarea:focus {
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
</style>
