<script lang="ts">
  import { X, Upload, FileText, File as FileIcon } from 'lucide-svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import { manualUploadApi } from '../../lib/api';
  import { MIN_TEXT_LENGTH, extractTopics } from '../../lib/constants';
  import { scouts } from '../../stores/scouts';
  import { Button } from '@shared/components';
  import ScopeToggle from './ScopeToggle.svelte';
  import ProgressIndicator from './ProgressIndicator.svelte';
  import UploadTextTab from './UploadTextTab.svelte';
  // import UploadPhotoTab from './UploadPhotoTab.svelte';  // Hidden until image embedding
  import UploadPdfTab from './UploadPdfTab.svelte';
  import PdfReviewPanel from './PdfReviewPanel.svelte';
  import UploadDedupDetails from './UploadDedupDetails.svelte';
  import type {
    Location,
    NewspaperJob,
    NewspaperJobStage,
    NewspaperExtractedUnit,
    UploadDedupDetail,
  } from '../../lib/types';
  import { supabase } from '../../lib/supabase';
  import { loadPilotVillages } from '../../lib/villages';
  import { formatUploadSuccessDetails } from '../../lib/upload-summary';

  const JOB_POLL_INTERVAL_MS = 10_000;
  const SECONDS_PER_CHUNK = 15;
  const STAGE_MESSAGES: Record<NewspaperJobStage, string> = {
    parsing_pdf: 'PDF wird gelesen…',
    chunking: 'Inhalt wird aufgeteilt…',
    extracting: 'KI extrahiert Fakten…',
    storing: 'Einheiten werden gespeichert…',
  };

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let existingTopics = $derived(extractTopics($scouts.scouts));

  // Tab state
  type Tab = 'text' | 'pdf';
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
  type UploadState = 'idle' | 'uploading' | 'review' | 'finalizing' | 'success' | 'error';
  let uploadState = $state<UploadState>('idle');
  let uploadProgress = $state(0);
  let uploadError = $state('');
  let unitsCreated = $state(0);
  let unitsMerged = $state(0);
  let dedupSummary = $state<UploadDedupDetail[]>([]);

  // Review state (PDF preview-and-confirm)
  let reviewUnits = $state<NewspaperExtractedUnit[]>([]);
  let selectedUids = $state<Set<string>>(new Set());

  // PDF processing state
  let publicationDate = $state('');
  let processingJobId = $state<string | null>(null);
  let chunksTotal = $state(0);
  let chunksProcessed = $state(0);
  let jobStage = $state<NewspaperJobStage | null>(null);
  let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Validation error
  let validationError = $state('');

  // Auto-close timer
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  // Clean up auto-close timer, object URLs, and job watchers on component destroy
  $effect(() => {
    return () => {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      teardownJobWatchers();
    };
  });

  // Pilot allow-list drives the Ort picker in manual upload. Call eagerly
  // whenever the modal opens so the first-time user doesn't see an empty
  // dropdown while the list resolves.
  $effect(() => {
    if (open) loadPilotVillages();
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
    publicationDate = '';
    processingJobId = null;
    chunksTotal = 0;
    chunksProcessed = 0;
    jobStage = null;
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    uploadState = 'idle';
    uploadProgress = 0;
    uploadError = '';
    unitsCreated = 0;
    unitsMerged = 0;
    dedupSummary = [];
    reviewUnits = [];
    selectedUids = new Set();
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

  let uploadMessage = $derived.by(() => {
    if (processingJobId) {
      return jobStage ? STAGE_MESSAGES[jobStage] : 'Zeitung wird analysiert…';
    }
    return activeTab === 'text' ? 'KI extrahiert Fakten...' : 'Datei wird hochgeladen...';
  });

  let uploadHint = $derived.by(() => {
    if (!processingJobId) return 'Dies kann einen Moment dauern';
    if (chunksTotal === 0) {
      return 'Bitte Fenster offen lassen, bis die Verarbeitung abgeschlossen ist.';
    }
    const processed = Math.min(chunksProcessed, chunksTotal);
    const minsLeft = Math.max(1, Math.round((chunksTotal - processed) * SECONDS_PER_CHUNK / 60));
    return `Abschnitt ${processed} von ${chunksTotal} — ca. ${minsLeft} Min. verbleibend`;
  });

  let isValid = $derived.by(() => {
    if (activeTab === 'text') {
      if (location === null) return false;
      if (publicationDate === '') return false;
      return text.trim().length >= MIN_TEXT_LENGTH;
    } else {
      // PDF: file required, publication date required, no location needed
      return file !== null && publicationDate !== '';
    }
  });

  function validate(): boolean {
    validationError = '';

    if (activeTab === 'text') {
      if (!location) {
        validationError = 'Ort ist erforderlich';
        return false;
      }
      if (text.trim().length < MIN_TEXT_LENGTH) {
        validationError = `Text muss mindestens ${MIN_TEXT_LENGTH} Zeichen lang sein`;
        return false;
      }
      if (!publicationDate) {
        validationError = 'Publikationsdatum ist erforderlich';
        return false;
      }
    } else {
      if (!file) {
        validationError = 'Datei ist erforderlich';
        return false;
      }
      if (!publicationDate) {
        validationError = 'Publikationsdatum ist erforderlich';
        return false;
      }
    }

    return true;
  }

  function teardownJobWatchers(): void {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function startJobWatchers(jobId: string): void {
    teardownJobWatchers();
    processingJobId = jobId;
    realtimeChannel = supabase
      .channel(`newspaper-job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'newspaper_jobs', filter: `id=eq.${jobId}` },
        (payload) => applyJobUpdate(payload.new as NewspaperJob),
      )
      .subscribe();

    pollInterval = setInterval(async () => {
      if (!processingJobId) return;
      try {
        const job = await manualUploadApi.getJob(processingJobId);
        applyJobUpdate(job);
      } catch {
        // Realtime remains primary; transient polling failures are retried.
      }
    }, JOB_POLL_INTERVAL_MS);

    void refreshJob(jobId);
  }

  async function refreshJob(jobId: string): Promise<void> {
    try {
      const job = await manualUploadApi.getJob(jobId);
      applyJobUpdate(job);
    } catch (err) {
      uploadState = 'error';
      uploadProgress = 100;
      uploadError = (err as Error).message || 'Job konnte nicht geladen werden';
    }
  }

  function applyJobUpdate(job: NewspaperJob): void {
    if (processingJobId && job.id !== processingJobId) return;
    if (uploadState === 'success' || uploadState === 'error') return;

    chunksTotal = job.chunks_total;
    chunksProcessed = job.chunks_processed;
    jobStage = job.stage ?? null;

    if (job.chunks_total > 0) {
      uploadProgress = Math.round((Math.min(job.chunks_processed, job.chunks_total) / job.chunks_total) * 100);
    }

    if (job.status === 'review_pending' && job.extracted_units) {
      processingJobId = job.id;
      teardownJobWatchers();
      reviewUnits = job.extracted_units;
      // Default-select only the units whose date is anchored in the source
      // (exact or year-inferred). Units with date_confidence === 'unanchored'
      // start unchecked — the journalist must tick them back in to save.
      selectedUids = new Set(
        reviewUnits
          .filter((u) => u.date_confidence !== 'unanchored')
          .map((u) => u.uid)
      );
      uploadState = 'review';
      return;
    }

    if (job.status === 'review_pending' && !job.extracted_units) {
      processingJobId = job.id;
      teardownJobWatchers();
      uploadState = 'error';
      uploadProgress = 100;
      uploadError = 'Keine prüfbaren Einheiten im Job gefunden';
      return;
    }

    if (job.status === 'completed') {
      processingJobId = null;
      teardownJobWatchers();
      unitsCreated = job.units_created;
      unitsMerged = job.units_merged ?? 0;
      dedupSummary = job.dedup_summary ?? [];
      uploadState = 'success';
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      processingJobId = null;
      teardownJobWatchers();
      if (job.status === 'cancelled') {
        uploadState = 'idle';
      } else {
        uploadState = 'error';
        uploadProgress = 100;
        uploadError = job.error_message || 'Verarbeitung fehlgeschlagen';
      }
    }
  }

  async function resumeJob(jobId: string): Promise<void> {
    activeTab = 'pdf';
    uploadState = 'uploading';
    uploadProgress = 0;
    uploadError = '';
    processingJobId = jobId;
    await refreshJob(jobId);
    if (uploadState === 'uploading') {
      startJobWatchers(jobId);
    }
  }

  function toggleReviewUid(uid: string): void {
    const next = new Set(selectedUids);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    selectedUids = next;
  }

  function selectAllReview(): void {
    selectedUids = new Set(reviewUnits.map((u) => u.uid));
  }

  function selectNoneReview(): void {
    selectedUids = new Set();
  }

  async function confirmReview(): Promise<void> {
    if (!processingJobId || selectedUids.size === 0) return;
    uploadState = 'finalizing';
    uploadError = '';
    try {
      const result = await manualUploadApi.finalizePdf(processingJobId, [...selectedUids]);
      unitsCreated = result.units_created;
      unitsMerged = result.units_merged ?? 0;
      dedupSummary = result.dedup_summary ?? [];
      processingJobId = null;
      teardownJobWatchers();
      uploadState = 'success';
      if (dedupSummary.length === 0 && unitsMerged === 0) {
        autoCloseTimer = setTimeout(() => { handleClose(); }, 2000);
      }
    } catch (err) {
      uploadState = 'review';
      uploadError = (err as Error).message || 'Speichern fehlgeschlagen';
    }
  }

  async function cancelReview(): Promise<void> {
    if (processingJobId) {
      try {
        await manualUploadApi.cancelPdf(processingJobId);
      } catch {
        // best-effort; close either way
      }
    }
    handleClose();
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
          publication_date: publicationDate,
        });
        uploadProgress = 60;
        if (result.status === 'completed') {
          uploadProgress = 100;
          unitsCreated = result.units_created ?? 0;
          unitsMerged = result.units_merged ?? 0;
          dedupSummary = [];
          uploadState = 'success';
          autoCloseTimer = setTimeout(() => { handleClose(); }, 2000);
        } else {
          // Hop onto the same job-watching path used for PDFs (review_pending →
          // PdfReviewPanel → pdf_finalize). Server already staged units in
          // extracted_units, so even without polling the first getJob call returns
          // the review payload immediately.
          processingJobId = result.job_id;
          uploadState = 'uploading';
          uploadProgress = 100;
          await refreshJob(result.job_id);
          if (uploadState === 'uploading') {
            startJobWatchers(result.job_id);
          }
        }
      } else {
        // PDF upload: 3-step process
        uploadProgress = 20;
        const presigned = await manualUploadApi.requestUploadUrl({
          content_type: 'pdf',
          file_name: file!.name,
          file_size: file!.size,
          mime_type: file!.type,
        });

        uploadProgress = 50;
        const uploadResponse = await manualUploadApi.uploadFile(presigned.upload_url, file!);
        if (!uploadResponse.ok) {
          // Supabase storage wraps size-limit rejections in HTTP 400 with a
          // `statusCode: "413"` JSON body, not a raw HTTP 413.
          let tooLarge = uploadResponse.status === 413;
          if (!tooLarge) {
            try {
              tooLarge = (await uploadResponse.json())?.statusCode === '413';
            } catch { /* non-JSON body — fall through to generic message */ }
          }
          throw new Error(
            tooLarge
              ? 'PDF zu gross (max 100 MB).'
              : `Datei-Upload fehlgeschlagen (HTTP ${uploadResponse.status}).`
          );
        }

        uploadProgress = 80;
        const result = await manualUploadApi.confirmUpload({
          content_type: 'pdf_confirm',
          storage_path: presigned.storage_path,
          description: description.trim() || undefined,
          publication_date: publicationDate || null,
          source_title: sourceTitle.trim() || null,
        });

        // Check if response is processing (PDF) or immediate (photo)
        if ('status' in result && result.status === 'processing') {
          processingJobId = result.job_id;
          uploadState = 'uploading';
          uploadProgress = 0;
          startJobWatchers(result.job_id);
        } else {
          uploadProgress = 100;
          if ('units_created' in result && typeof result.units_created === 'number') {
            unitsCreated = result.units_created;
          }
          unitsMerged = 'units_merged' in result && typeof result.units_merged === 'number'
            ? result.units_merged
            : 0;
          dedupSummary = [];
          uploadState = 'success';
          autoCloseTimer = setTimeout(() => { handleClose(); }, 2000);
        }
      }
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

  let successDetails = $derived(formatUploadSuccessDetails(unitsCreated, unitsMerged));
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
            <p class="modal-subtitle">Text oder PDFs manuell hinzufügen</p>
          </div>
        </div>
        <button class="modal-close" onclick={handleClose} aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>

      <!-- Content type tabs (hidden in review/finalizing to focus on preview) -->
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
          <!-- Photo tab hidden until image embedding is implemented
          <button
            class="tab"
            class:active={activeTab === 'photo'}
            onclick={() => { activeTab = 'photo'; validationError = ''; }}
          >
            <Camera size={15} />
            <span>Foto</span>
          </button>
          -->
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
            message={uploadMessage}
            hintText={uploadHint}
          />

        {:else if uploadState === 'review' || uploadState === 'finalizing'}
          <div class="review-header-row">
            <h3 class="review-title">
              {reviewUnits.length} Informationseinheiten gefunden
            </h3>
            <p class="review-subtitle">
              Wähle aus, welche gespeichert werden sollen. Standardmässig sind alle ausgewählt.
            </p>
          </div>
          <PdfReviewPanel
            units={reviewUnits}
            selected={selectedUids}
            ontoggle={toggleReviewUid}
            onselectall={selectAllReview}
            onselectnone={selectNoneReview}
          />
          {#if uploadError}
            <div class="error-message">{uploadError}</div>
          {/if}

        {:else if uploadState === 'success'}
          <div class="success-stack">
            <ProgressIndicator
              state="success"
              progress={100}
              successMessage="Erfolgreich verarbeitet"
              {successDetails}
            />
            <UploadDedupDetails details={dedupSummary} />
          </div>

        {:else if uploadState === 'error'}
          <ProgressIndicator
            state="error"
            progress={100}
            errorTitle="Verarbeitung fehlgeschlagen"
            errorMessage={uploadError}
          />

        {:else}
          {#if validationError}
            <div class="error-message">{validationError}</div>
          {/if}

          {#if activeTab === 'text'}
            <UploadTextTab
              {text}
              {publicationDate}
              ontextchange={(v) => { text = v; }}
              onpublicationdatechange={(v) => { publicationDate = v; }}
            />
          {:else if activeTab === 'pdf'}
            <UploadPdfTab
              {file}
              {description}
              {publicationDate}
              onfileselect={handleFileSelect}
              onfileremove={() => { file = null; }}
              ondescriptionchange={(v) => { description = v; }}
              onpublicationdatechange={(v) => { publicationDate = v; }}
              onresumejob={resumeJob}
            />
          {/if}

          <!-- Scope toggle: only for text uploads (PDF assigns villages via LLM) -->
          {#if activeTab === 'text'}
            <div class="form-group" role="group" aria-label="Ort und Thema">
              <span class="form-label">Ort und Thema <span class="optional">(Thema optional)</span></span>
              <ScopeToggle
                {location}
                {topic}
                {existingTopics}
                restrictToPilot={true}
                onlocationchange={(loc) => { location = loc; }}
                ontopicchange={(t) => { topic = t; }}
              />
            </div>
          {/if}

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
        {:else if uploadState === 'review' || uploadState === 'finalizing'}
          <Button variant="ghost" onclick={cancelReview} disabled={uploadState === 'finalizing'}>
            Abbrechen
          </Button>
          <Button
            onclick={confirmReview}
            disabled={selectedUids.size === 0 || uploadState === 'finalizing'}
            loading={uploadState === 'finalizing'}
          >
            {selectedUids.size} von {reviewUnits.length} speichern
          </Button>
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
    /* Flex column so the review list scrolls inside a fixed-height panel
       while header and footer stay pinned. Matters for PDFs with 40+ units. */
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface, white);
    z-index: 1;
    border-radius: var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0;
    flex: 0 0 auto;
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
    flex: 0 0 auto;
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
    flex: 1 1 auto;
    overflow: hidden;
    min-height: 0;
  }

  .success-stack {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    overflow-y: auto;
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
    flex: 0 0 auto;
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

  .review-header-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .review-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .review-subtitle {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
</style>
