<script lang="ts">
  import { X, Upload, FileText, Camera, File as FileIcon } from 'lucide-svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { manualUploadApi } from '../../lib/api';
  import { MIN_TEXT_LENGTH, MIN_DESCRIPTION_LENGTH, extractTopics } from '../../lib/constants';
  import { scouts } from '../../stores/scouts';
  import { Button } from '@shared/components';
  import ScopeToggle from './ScopeToggle.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import UploadTextTab from './UploadTextTab.svelte';
  import UploadPhotoTab from './UploadPhotoTab.svelte';
  import UploadPdfTab from './UploadPdfTab.svelte';
  import type { Location } from '../../lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let existingTopics = $derived(extractTopics($scouts.scouts));

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

  // Clean up auto-close timer and object URLs on component destroy
  $effect(() => {
    return () => {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  });

  function resetState(): void {
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

  function handleClose(): void {
    resetState();
    onclose();
  }

  function handleBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) handleClose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') handleClose();
  }

  function handleFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    const selected = input.files?.[0];
    if (!selected) return;

    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      filePreviewUrl = null;
    }

    file = selected;

    if (selected.type.startsWith('image/')) {
      filePreviewUrl = URL.createObjectURL(selected);
    }
  }

  function handleFileRemove(): void {
    file = null;
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      filePreviewUrl = null;
    }
  }

  let isValid = $derived.by(() => {
    if (location === null) return false;

    if (activeTab === 'text') {
      return text.trim().length >= MIN_TEXT_LENGTH;
    } else {
      return file !== null && description.trim().length >= MIN_DESCRIPTION_LENGTH;
    }
  });

  function validate(): boolean {
    validationError = '';

    if (!location) {
      validationError = 'Ort ist erforderlich';
      return false;
    }

    if (activeTab === 'text') {
      if (text.trim().length < MIN_TEXT_LENGTH) {
        validationError = `Text muss mindestens ${MIN_TEXT_LENGTH} Zeichen lang sein`;
        return false;
      }
    } else {
      if (!file) {
        validationError = 'Datei ist erforderlich';
        return false;
      }
      if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
        validationError = `Beschreibung muss mindestens ${MIN_DESCRIPTION_LENGTH} Zeichen lang sein`;
        return false;
      }
    }

    return true;
  }

  async function handleSubmit(): Promise<void> {
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
        uploadProgress = 20;
        const contentType = activeTab as 'photo' | 'pdf';
        const presigned = await manualUploadApi.requestUploadUrl({
          content_type: contentType,
          file_name: file!.name,
          file_size: file!.size,
          mime_type: file!.type,
        });

        uploadProgress = 50;
        const uploadResponse = await manualUploadApi.uploadFile(presigned.upload_url, file!);
        if (!uploadResponse.ok) {
          throw new Error('Datei-Upload fehlgeschlagen');
        }

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
        // Handle both ManualUploadResult and NewspaperProcessingResult
        if ('units_created' in result) {
          unitsCreated = result.units_created;
        } else if ('job_id' in result) {
          // NewspaperProcessingResult - newspaper processing job started
          unitsCreated = 0; // Job is still processing, show 0 for now
        }
      }

      uploadState = 'success';

      autoCloseTimer = setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      uploadState = 'error';
      uploadProgress = 100;
      uploadError = (err as Error).message || 'Ein Fehler ist aufgetreten';
    }
  }

  function handleRetry(): void {
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
    <div class="modal-card" use:focusTrap>

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

          {#if activeTab === 'text'}
            <UploadTextTab {text} ontextchange={(v) => { text = v; }} />
          {:else if activeTab === 'photo'}
            <UploadPhotoTab
              {file}
              {filePreviewUrl}
              {description}
              onfileselect={handleFileSelect}
              onfileremove={handleFileRemove}
              ondescriptionchange={(v) => { description = v; }}
            />
          {:else if activeTab === 'pdf'}
            <UploadPdfTab
              {file}
              {description}
              onfileselect={handleFileSelect}
              onfileremove={() => { file = null; }}
              ondescriptionchange={(v) => { description = v; }}
            />
          {/if}

          <!-- Scope toggle (shared across tabs) -->
          <div class="form-group" role="group" aria-label="Ort und Thema">
            <span class="form-label">Ort und Thema <span class="optional">(Thema optional)</span></span>
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
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-backdrop);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    position: relative;
    width: 100%;
    max-width: 32rem;
    margin: var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
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
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
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
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-base-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-base);
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
    gap: 0.5rem;
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
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .optional {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .form-group input[type="text"] {
    width: 100%;
    padding: var(--spacing-sm) 0.75rem;
    font-size: var(--text-base);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    font-family: inherit;
    resize: vertical;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .error-message {
    padding: 0.625rem 0.75rem;
    font-size: var(--text-base-sm);
    color: var(--color-status-error-text);
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
    border-radius: var(--radius-sm);
  }
</style>
