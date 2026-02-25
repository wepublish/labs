<script lang="ts">
  import { X, Upload, FileText, Camera, File as FileIcon } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import { manualUploadApi } from '../../lib/api';
  import { scouts } from '../../stores/scouts';
  import ScopeToggle from './ScopeToggle.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import type { Location } from '../../lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  // Derive existing topics from scouts for autocomplete
  let existingTopics = $derived(
    [...new Set(
      $scouts.scouts
        .filter(s => s.topic)
        .flatMap(s => s.topic!.split(',').map(t => t.trim()))
        .filter(Boolean)
    )].sort()
  );

  // Tab state
  type Tab = 'text' | 'photo' | 'pdf';
  let activeTab = $state<Tab>('text');

  // Shared state
  let location = $state<Location | null>(null);
  let topic = $state('');
  let sourceTitle = $state('');

  // Text state
  let text = $state('');

  // File state
  let file = $state<File | null>(null);
  let filePreviewUrl = $state<string | null>(null);
  let description = $state('');

  // Upload state
  type UploadState = 'idle' | 'uploading' | 'success' | 'error';
  let uploadState = $state<UploadState>('idle');
  let uploadProgress = $state(0);
  let uploadError = $state('');
  let unitsCreated = $state(0);

  // Validation error
  let validationError = $state('');

  // Auto-close timer
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  function resetState() {
    activeTab = 'text';
    location = null;
    topic = '';
    sourceTitle = '';
    text = '';
    file = null;
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      filePreviewUrl = null;
    }
    description = '';
    uploadState = 'idle';
    uploadProgress = 0;
    uploadError = '';
    unitsCreated = 0;
    validationError = '';
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  }

  function handleClose() {
    resetState();
    onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const selected = input.files?.[0];
    if (!selected) return;

    // Revoke previous preview URL
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      filePreviewUrl = null;
    }

    file = selected;

    // Generate preview for images
    if (selected.type.startsWith('image/')) {
      filePreviewUrl = URL.createObjectURL(selected);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Validation
  let isValid = $derived.by(() => {
    const hasScope = location !== null || topic.trim() !== '';
    if (!hasScope) return false;

    if (activeTab === 'text') {
      return text.trim().length >= 20;
    } else {
      return file !== null && description.trim().length >= 10;
    }
  });

  function validate(): boolean {
    validationError = '';

    if (!location && !topic.trim()) {
      validationError = 'Ort oder Thema ist erforderlich';
      return false;
    }

    if (activeTab === 'text') {
      if (text.trim().length < 20) {
        validationError = 'Text muss mindestens 20 Zeichen lang sein';
        return false;
      }
    } else {
      if (!file) {
        validationError = 'Datei ist erforderlich';
        return false;
      }
      if (description.trim().length < 10) {
        validationError = 'Beschreibung muss mindestens 10 Zeichen lang sein';
        return false;
      }
    }

    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;

    uploadState = 'uploading';
    uploadProgress = 10;
    uploadError = '';

    try {
      if (activeTab === 'text') {
        uploadProgress = 30;
        const result = await manualUploadApi.submitText({
          text: text.trim(),
          location,
          topic: topic.trim() || null,
          source_title: sourceTitle.trim() || null,
        });
        uploadProgress = 100;
        unitsCreated = result.units_created;
      } else {
        // Step A: Get presigned upload URL
        uploadProgress = 20;
        const contentType = activeTab as 'photo' | 'pdf';
        const presigned = await manualUploadApi.requestUploadUrl({
          content_type: contentType,
          file_name: file!.name,
          file_size: file!.size,
          mime_type: file!.type,
        });

        // Step B: Upload file directly to storage
        uploadProgress = 50;
        const uploadResponse = await manualUploadApi.uploadFile(presigned.upload_url, file!);
        if (!uploadResponse.ok) {
          throw new Error('Datei-Upload fehlgeschlagen');
        }

        // Step C: Confirm upload
        uploadProgress = 80;
        const confirmType = contentType === 'photo' ? 'photo_confirm' : 'pdf_confirm';
        const result = await manualUploadApi.confirmUpload({
          content_type: confirmType as 'photo_confirm' | 'pdf_confirm',
          storage_path: presigned.storage_path,
          description: description.trim(),
          location,
          topic: topic.trim() || null,
          source_title: sourceTitle.trim() || null,
        });
        uploadProgress = 100;
        unitsCreated = result.units_created;
      }

      uploadState = 'success';

      // Auto-close after 2 seconds
      autoCloseTimer = setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      uploadState = 'error';
      uploadProgress = 100;
      uploadError = (err as Error).message || 'Ein Fehler ist aufgetreten';
    }
  }

  function handleRetry() {
    uploadState = 'idle';
    uploadProgress = 0;
    uploadError = '';
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Information hochladen"
    tabindex="-1"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div class="modal-card">

      <!-- Header -->
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-icon">
            <Upload size={20} />
          </div>
          <div>
            <h2 class="modal-title">Information hochladen</h2>
            <p class="modal-subtitle">Text, Fotos oder PDFs manuell hinzufügen</p>
          </div>
        </div>
        <button class="modal-close" onclick={handleClose} aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>

      <!-- Content type tabs -->
      {#if uploadState === 'idle'}
        <div class="tab-bar">
          <button
            class="tab"
            class:active={activeTab === 'text'}
            onclick={() => { activeTab = 'text'; validationError = ''; }}
          >
            <FileText size={15} />
            <span>Text</span>
          </button>
          <button
            class="tab"
            class:active={activeTab === 'photo'}
            onclick={() => { activeTab = 'photo'; validationError = ''; }}
          >
            <Camera size={15} />
            <span>Foto</span>
          </button>
          <button
            class="tab"
            class:active={activeTab === 'pdf'}
            onclick={() => { activeTab = 'pdf'; validationError = ''; }}
          >
            <FileIcon size={15} />
            <span>PDF</span>
          </button>
        </div>
      {/if}

      <!-- Body -->
      <div class="modal-body">
        {#if uploadState === 'uploading'}
          <ProgressIndicator
            state="loading"
            progress={uploadProgress}
            message={activeTab === 'text' ? 'KI extrahiert Fakten...' : 'Datei wird hochgeladen...'}
            hintText="Dies kann einen Moment dauern"
          />

        {:else if uploadState === 'success'}
          <ProgressIndicator
            state="success"
            progress={100}
            successMessage="Erfolgreich hochgeladen"
            successDetails={unitsCreated === 1
              ? '1 Informationseinheit erstellt'
              : `${unitsCreated} Informationseinheiten erstellt`}
          />

        {:else if uploadState === 'error'}
          <ProgressIndicator
            state="error"
            progress={100}
            errorTitle="Upload fehlgeschlagen"
            errorMessage={uploadError}
          />

        {:else}
          {#if validationError}
            <div class="error-message">{validationError}</div>
          {/if}

          <!-- Text tab -->
          {#if activeTab === 'text'}
            <div class="form-group">
              <label for="upload-text">Text</label>
              <textarea
                id="upload-text"
                bind:value={text}
                placeholder="Text eingeben oder einfügen..."
                rows="5"
              ></textarea>
              <p class="hint-text">KI extrahiert automatisch Fakten aus dem Text</p>
            </div>

          <!-- Photo tab -->
          {:else if activeTab === 'photo'}
            <div class="form-group">
              <label for="upload-photo">Foto</label>
              {#if file && filePreviewUrl}
                <div class="file-preview">
                  <img src={filePreviewUrl} alt="Vorschau" class="image-preview" />
                  <button class="file-remove" onclick={() => { file = null; if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); filePreviewUrl = null; } }}>
                    <X size={14} />
                  </button>
                </div>
              {:else}
                <label class="file-drop" for="upload-photo-input">
                  <Camera size={24} />
                  <span>Foto auswählen</span>
                  <span class="file-drop-hint">JPEG, PNG, WebP — max 50 MB</span>
                </label>
                <input
                  id="upload-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onchange={handleFileSelect}
                  class="file-input-hidden"
                />
              {/if}
            </div>
            <div class="form-group">
              <label for="upload-photo-desc">Beschreibung</label>
              <textarea
                id="upload-photo-desc"
                bind:value={description}
                placeholder="Was zeigt dieses Foto?"
                rows="3"
              ></textarea>
            </div>

          <!-- PDF tab -->
          {:else if activeTab === 'pdf'}
            <div class="form-group">
              <label for="upload-pdf">PDF-Dokument</label>
              {#if file}
                <div class="file-info">
                  <FileIcon size={20} />
                  <div class="file-details">
                    <span class="file-name">{file.name}</span>
                    <span class="file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button class="file-remove" onclick={() => { file = null; }}>
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
                  onchange={handleFileSelect}
                  class="file-input-hidden"
                />
              {/if}
            </div>
            <div class="form-group">
              <label for="upload-pdf-desc">Beschreibung</label>
              <textarea
                id="upload-pdf-desc"
                bind:value={description}
                placeholder="Worum geht es in diesem Dokument?"
                rows="3"
              ></textarea>
            </div>
          {/if}

          <!-- Scope toggle (shared across tabs) -->
          <div class="form-group" role="group" aria-label="Ort und/oder Thema">
            <span class="form-label">Ort und/oder Thema</span>
            <ScopeToggle
              {location}
              {topic}
              {existingTopics}
              onlocationchange={(loc) => { location = loc; }}
              ontopicchange={(t) => { topic = t; }}
            />
          </div>

          <!-- Optional source title -->
          <div class="form-group">
            <label for="upload-source">Quellenangabe <span class="optional">(optional)</span></label>
            <input
              id="upload-source"
              type="text"
              bind:value={sourceTitle}
              placeholder="z.B. Pressekonferenz Rathaus"
            />
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        {#if uploadState === 'idle'}
          <Button variant="ghost" onclick={handleClose}>Abbrechen</Button>
          <Button onclick={handleSubmit} disabled={!isValid}>Hochladen</Button>
        {:else if uploadState === 'error'}
          <Button variant="ghost" onclick={handleClose}>Abbrechen</Button>
          <Button onclick={handleRetry}>Erneut versuchen</Button>
        {:else if uploadState === 'success'}
          <Button onclick={handleClose}>Schliessen</Button>
        {/if}
      </div>

    </div>
  </div>
{/if}

<style>
  /* Reuses modal patterns from ScoutModal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    position: relative;
    width: 100%;
    max-width: 32rem;
    margin: 1rem;
    background: var(--color-surface, white);
    border-radius: var(--radius-lg, 1rem);
    border: 1px solid var(--color-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-surface, white);
    z-index: 1;
    border-radius: var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0;
  }

  .modal-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .modal-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.625rem;
    background: rgba(234, 114, 110, 0.1);
    color: var(--color-primary);
  }

  .modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .modal-subtitle {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .modal-close:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    padding: 0.75rem 1.5rem;
    gap: 0.375rem;
    border-bottom: 1px solid var(--color-border);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .tab.active {
    border-color: var(--color-primary);
    background: rgba(234, 114, 110, 0.08);
    color: var(--color-primary);
  }

  /* Body */
  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
  }

  /* Form elements */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label,
  .form-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .optional {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .form-group input[type="text"],
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

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .hint-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0;
    line-height: 1.4;
  }

  .error-message {
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
  }

  /* File input */
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

  /* File preview / info */
  .file-preview {
    position: relative;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .image-preview {
    display: block;
    width: 100%;
    max-height: 200px;
    object-fit: cover;
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
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .file-info .file-remove {
    position: static;
    background: var(--color-surface-muted, #e5e7eb);
    color: var(--color-text-muted);
  }

  .file-remove:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .file-info .file-remove:hover {
    background: var(--color-danger, #ef4444);
    color: white;
  }
</style>
