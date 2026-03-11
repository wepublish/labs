<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { AlertCircle, RefreshCw, PenTool, ChevronDown, ChevronUp, Download, Send, Mail, Trash2, Loader2, FileText } from 'lucide-svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import ProgressIndicator from '../ui/ProgressIndicator.svelte';
  import DraftContent from './DraftContent.svelte';
  import DraftPromptEditor from './DraftPromptEditor.svelte';
  import DraftList from '../../bajour/components/DraftList.svelte';
  import { bajourDrafts } from '../../bajour/store';
  import { bajourApi } from '../../bajour/api';
  import type { Draft } from '../../lib/types';
  import type { BajourDraft, VerificationStatus } from '../../bajour/types';

  interface Props {
    open: boolean;
    draft: Draft | null;
    isGenerating: boolean;
    generationError: string | null;
    selectedCount: number;
    customPrompt: string | null;
    progressMessage?: string;
    villageName?: string;
    villageId?: string;
    unitIds?: string[];
    initialShowDraftList?: boolean;
    onClose: () => void;
    onRetry: () => void;
    onRegenerate: (customPrompt: string | null) => void;
  }

  let {
    open,
    draft,
    isGenerating,
    generationError,
    selectedCount,
    customPrompt: _customPrompt,
    progressMessage = 'Entwurf wird erstellt...',
    villageName,
    villageId,
    unitIds = [],
    initialShowDraftList = false,
    onClose,
    onRetry,
    onRegenerate,
  }: Props = $props();

  // Serialize a Draft's body sections into markdown for saving
  function draftToMarkdown(d: Draft): string {
    const parts: string[] = [];
    if (d.headline) parts.push(d.headline);
    for (const section of d.sections) {
      parts.push(`## ${section.heading}\n${section.content}`);
    }
    return parts.join('\n\n');
  }

  // Convert savedDraft markdown body into a Draft shape for DraftContent
  function parseSavedDraftBody(sd: BajourDraft): Draft {
    const lines = sd.body.split('\n');
    let headline = '';
    const sections: { heading: string; content: string }[] = [];
    let currentHeading = '';
    let currentLines: string[] = [];

    function flushAccumulated() {
      if (!currentHeading && currentLines.length > 0 && sections.length === 0) {
        headline = currentLines.join(' ').trim();
      } else if (currentHeading || currentLines.length > 0) {
        sections.push({ heading: currentHeading, content: currentLines.join(' ').trim() });
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^##\s+(.+)$/);
      if (headingMatch) {
        flushAccumulated();
        currentHeading = headingMatch[1];
        currentLines = [];
      } else if (trimmed) {
        currentLines.push(trimmed);
      }
    }
    flushAccumulated();

    return {
      title: sd.title || '',
      headline,
      sections,
      gaps: [],
      sources: [],
      word_count: 0,
      units_used: 0,
    };
  }

  // Action state
  let savedDraft = $state<BajourDraft | null>(null);
  let sendLoading = $state(false);
  let deleteLoading = $state(false);
  let mailchimpLoading = $state(false);
  let actionError = $state('');
  let actionSuccess = $state<string | null>(null);
  let statusLoading = $state(false);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let showDraftList = $state(false);
  let showRegenPrompt = $state(false);
  let regenPrompt = $state('');
  let generateProgress = $state(0);
  let generateProgressState = $state<'loading' | 'success' | 'error'>('loading');

  let progressInterval: ReturnType<typeof setInterval> | null = null;

  function startProgressSimulation(): void {
    stopProgressInterval();
    generateProgress = 0;
    generateProgressState = 'loading';
    progressInterval = setInterval(() => {
      if (generateProgress < 30) {
        generateProgress += Math.random() * 8 + 2;
      } else if (generateProgress < 60) {
        generateProgress += Math.random() * 4 + 1;
      } else if (generateProgress < 85) {
        generateProgress += Math.random() * 2 + 0.5;
      } else if (generateProgress < 90) {
        generateProgress += Math.random() * 0.5;
      }
      generateProgress = Math.min(generateProgress, 90);
    }, 500);
  }

  function stopProgressSimulation(success: boolean): void {
    stopProgressInterval();
    if (success) {
      generateProgress = 100;
      generateProgressState = 'success';
    } else {
      generateProgressState = 'error';
    }
  }

  function stopProgressInterval(): void {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  let wasGenerating = false;

  $effect(() => {
    if (isGenerating && !wasGenerating) {
      startProgressSimulation();
    } else if (!isGenerating && wasGenerating) {
      stopProgressSimulation(!generationError);
    }
    wasGenerating = isGenerating;
  });

  onDestroy(() => {
    stopProgressInterval();
    stopStatusPoll();
  });

  // Poll for verification status updates (every 10s)
  function startStatusPoll(draftId: string): void {
    stopStatusPoll();
    pollTimer = setInterval(async () => {
      try {
        const drafts = await bajourApi.listDrafts();
        const updated = drafts.find((d) => d.id === draftId);
        if (!updated) return;
        savedDraft = updated;
        if (updated.verification_status !== 'ausstehend') {
          stopStatusPoll();
        }
      } catch { /* ignore poll errors */ }
    }, 10_000);
  }

  function stopStatusPoll(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Manual verification status override (auto-saves draft if needed)
  async function handleStatusOverride(status: VerificationStatus): Promise<void> {
    if (statusLoading) return;
    statusLoading = true;
    actionError = '';
    try {
      // Save draft first if not yet saved
      if (!savedDraft) {
        if (!draft || !villageId || !villageName) return;
        savedDraft = await bajourDrafts.create({
          village_id: villageId,
          village_name: villageName,
          title: draft.title,
          body: draftToMarkdown(draft),
          selected_unit_ids: unitIds,
          custom_system_prompt: _customPrompt || null,
        });
      }
      const updated = await bajourDrafts.updateVerificationStatus(savedDraft.id, status);
      savedDraft = updated;
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      statusLoading = false;
    }
  }

  function saveAndRegenerate(): void {
    const prompt = regenPrompt.trim() || null;
    onRegenerate(prompt);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      onClose();
    }
  }

  // Load drafts when slide-over opens
  $effect(() => {
    if (open) {
      bajourDrafts.load();
      showDraftList = initialShowDraftList;
    }
  });

  // Reset action state when slide-over closes
  $effect(() => {
    if (!open) {
      savedDraft = null;
      showDraftList = false;
      sendLoading = false;
      deleteLoading = false;
      mailchimpLoading = false;
      statusLoading = false;
      actionError = '';
      actionSuccess = null;
      stopStatusPoll();
    }
  });

  // Auto-poll when savedDraft is ausstehend with verification sent
  $effect(() => {
    if (savedDraft?.verification_status === 'ausstehend' && savedDraft.verification_sent_at) {
      startStatusPoll(savedDraft.id);
    }
    return () => stopStatusPoll();
  });

  // Save draft + send to Dorfkönige
  async function handleSaveSend(): Promise<void> {
    if (!draft || !villageId || !villageName) return;
    sendLoading = true;
    actionError = '';
    actionSuccess = null;

    try {
      const created = await bajourDrafts.create({
        village_id: villageId,
        village_name: villageName,
        title: draft.title,
        body: draftToMarkdown(draft),
        selected_unit_ids: unitIds,
        custom_system_prompt: _customPrompt || null,
      });

      try {
        await bajourDrafts.sendVerification(created.id);
      } catch (verifyErr) {
        // Draft saved but verification failed
        savedDraft = created;
        actionError = `Entwurf gespeichert, aber Verifizierung fehlgeschlagen: ${(verifyErr as Error).message}`;
        return;
      }

      savedDraft = created;
      actionSuccess = 'Entwurf gespeichert und an Dorfkönige gesendet.';
      startStatusPoll(created.id);
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      sendLoading = false;
    }
  }

  // Delete saved draft
  async function handleDelete(): Promise<void> {
    if (!savedDraft) return;
    deleteLoading = true;
    actionError = '';
    actionSuccess = null;

    try {
      await bajourDrafts.delete(savedDraft.id);
      savedDraft = null;
      actionSuccess = 'Entwurf gelöscht.';
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      deleteLoading = false;
    }
  }

  // Re-send verification on existing draft
  async function handleResendVerification(): Promise<void> {
    if (!savedDraft) return;
    sendLoading = true;
    actionError = '';
    actionSuccess = null;

    try {
      await bajourDrafts.sendVerification(savedDraft.id);
      actionSuccess = 'Verifizierung erneut gesendet.';
      startStatusPoll(savedDraft.id);
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      sendLoading = false;
    }
  }

  // Export draft as markdown to clipboard
  async function handleExport(): Promise<void> {
    if (!savedDraft && !draft) return;
    actionError = '';
    actionSuccess = null;

    const text = savedDraft
      ? savedDraft.body
      : (draft!.title ? `# ${draft!.title}\n\n` : '') + draftToMarkdown(draft!);

    try {
      await navigator.clipboard.writeText(text);
      actionSuccess = 'In Zwischenablage kopiert.';
    } catch {
      actionError = 'Kopieren fehlgeschlagen.';
    }
  }

  // Send to Mailchimp
  async function handleSendToMailchimp(): Promise<void> {
    mailchimpLoading = true;
    actionError = '';
    actionSuccess = null;

    try {
      const result = await bajourDrafts.sendToMailchimp();
      actionSuccess = `An Mailchimp gesendet (${result.village_count} Dörfer).`;
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      mailchimpLoading = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div class="backdrop" transition:fade={{ duration: 200 }} onclick={onClose} role="presentation"></div>

  <!-- Panel -->
  <div class="slide-over" transition:fly={{ x: 400, duration: 300 }} use:focusTrap role="dialog" aria-modal="true" aria-label="Entwurf">
    <!-- Header: drafts toggle + actions -->
    <div class="panel-header">
      <button
        class="draft-list-toggle"
        class:active={showDraftList}
        onclick={() => showDraftList = !showDraftList}
        type="button"
      >
        <FileText size={16} />
        Entwürfe
        {#if $bajourDrafts.drafts.length > 0}
          <span class="draft-count-badge">{$bajourDrafts.drafts.length}</span>
        {/if}
        {#if showDraftList}
          <ChevronUp size={14} />
        {:else}
          <ChevronDown size={14} />
        {/if}
      </button>
    </div>

    <!-- Draft list (collapsible below header) -->
    {#if showDraftList}
      <div class="draft-list-section">
        <DraftList
          drafts={$bajourDrafts.drafts}
          onselect={(selectedDraft) => {
            savedDraft = selectedDraft;
            showDraftList = false;
          }}
        />
      </div>
    {/if}

    <!-- Actions bar -->
    {#if (draft || savedDraft) && !isGenerating && !generationError}
      <div class="draft-actions">
        {#if actionError}
          <div class="action-banner action-banner-error">{actionError}</div>
        {/if}
        {#if actionSuccess}
          <div class="action-banner action-banner-success">{actionSuccess}</div>
        {/if}

        <div class="draft-actions-bar">
          <div class="draft-actions-left">
            <div class="status-toggle">
              <button
                class="toggle-btn toggle-confirm"
                class:active={savedDraft?.verification_status === 'bestätigt'}
                disabled={statusLoading || (!savedDraft && (!villageId || !villageName))}
                onclick={() => handleStatusOverride('bestätigt')}
                type="button"
              >
                {#if statusLoading && savedDraft?.verification_status !== 'bestätigt'}
                  <Loader2 size={12} class="spin" />
                {/if}
                Bestätigt
              </button>
              <button
                class="toggle-btn toggle-reject"
                class:active={savedDraft?.verification_status === 'abgelehnt'}
                disabled={statusLoading || (!savedDraft && (!villageId || !villageName))}
                onclick={() => handleStatusOverride('abgelehnt')}
                type="button"
              >
                {#if statusLoading && savedDraft?.verification_status !== 'abgelehnt'}
                  <Loader2 size={12} class="spin" />
                {/if}
                Abgelehnt
              </button>
            </div>
            {#if draft}
              <button
                class="action-btn regen-btn"
                class:active={showRegenPrompt}
                onclick={() => showRegenPrompt = !showRegenPrompt}
                type="button"
              >
                <PenTool size={14} />
                Neu generieren
              </button>
            {/if}
            {#if savedDraft}
              <button
                class="action-btn delete-btn"
                onclick={handleDelete}
                disabled={deleteLoading}
                type="button"
              >
                {#if deleteLoading}
                  <Loader2 size={14} class="spin" />
                {:else}
                  <Trash2 size={14} />
                {/if}
                Löschen
              </button>
            {/if}
          </div>

          <div class="draft-actions-right">
            {#if !savedDraft}
              <button
                class="action-btn send-btn"
                onclick={handleSaveSend}
                disabled={sendLoading || !villageId || !villageName}
                title={!villageId || !villageName ? 'Bitte zuerst einen Ort auswählen' : ''}
                type="button"
              >
                {#if sendLoading}
                  <Loader2 size={14} class="spin" />
                {:else}
                  <Send size={14} />
                {/if}
                An Dorfkönige senden
              </button>
            {:else}
              <button
                class="action-btn send-btn"
                onclick={handleResendVerification}
                disabled={sendLoading || !!savedDraft.verification_sent_at}
                type="button"
              >
                {#if sendLoading}
                  <Loader2 size={14} class="spin" />
                {:else}
                  <Send size={14} />
                {/if}
                An Dorfkönige senden
              </button>
            {/if}

            <button
              class="action-btn export-btn"
              onclick={handleExport}
              type="button"
            >
              <Download size={14} />
              Export
            </button>

            <button
              class="action-btn mailchimp-btn"
              onclick={handleSendToMailchimp}
              disabled={mailchimpLoading || savedDraft?.verification_status !== 'bestätigt'}
              title={savedDraft?.verification_status !== 'bestätigt' ? 'Mindestens ein bestätigter Entwurf nötig' : ''}
              type="button"
            >
              {#if mailchimpLoading}
                <Loader2 size={14} class="spin" />
              {:else}
                <Mail size={14} />
              {/if}
              An Mailchimp senden
            </button>
          </div>
        </div>
      </div>

      {#if showRegenPrompt && draft && !isGenerating}
        <div class="regen-drawer">
          <DraftPromptEditor
            {regenPrompt}
            onpromptchange={(v) => { regenPrompt = v; }}
            onreset={() => { regenPrompt = ''; }}
            onregenerate={saveAndRegenerate}
          />
        </div>
      {/if}
    {/if}

    <!-- Body -->
    <div class="panel-body">
      {#if isGenerating}
        <div class="progress-container">
          <ProgressIndicator
            progress={Math.round(generateProgress)}
            message={progressMessage}
            state={generateProgressState}
            hintText={selectedCount !== 1
              ? `${selectedCount} Quellen werden analysiert...`
              : '1 Quelle wird analysiert...'}
          />
        </div>
      {:else if generationError}
        <div class="state-centered error">
          <AlertCircle size={24} />
          <h3>Erstellung fehlgeschlagen</h3>
          <p>{generationError}</p>
          <button class="retry-btn" onclick={onRetry}>
            <RefreshCw size={14} />
            Erneut versuchen
          </button>
        </div>
      {:else if savedDraft}
        <DraftContent draft={parseSavedDraftBody(savedDraft)} />
      {:else if draft}
        <DraftContent {draft} />
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-backdrop);
    z-index: var(--z-modal);
  }

  .slide-over {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 65%;
    min-width: 500px;
    max-width: 900px;
    background: var(--color-surface);
    z-index: calc(var(--z-modal) + 1);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  /* Draft list toggle */
  .draft-list-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    background: none;
    border: none;
    cursor: pointer;
    transition: color var(--transition-base);
  }

  .draft-list-toggle:hover,
  .draft-list-toggle.active {
    color: var(--color-primary);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
  }

  .state-centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    text-align: center;
    padding: 1.5rem;
  }

  .progress-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 300px;
    padding: 2rem 2.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .state-centered.error { color: var(--color-danger-dark); }
  .state-centered.error h3 { color: var(--color-danger-dark); margin-top: 0.75rem; font-size: var(--text-lg); font-weight: 600; }
  .state-centered.error p { margin: 0.25rem 0 1rem 0; font-size: var(--text-base); color: var(--color-text-muted); }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-danger-dark);
    background: var(--color-danger-surface);
    border: 1px solid var(--color-danger-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .retry-btn:hover { background: var(--color-status-error-bg); }

  /* Actions bar */
  .draft-actions {
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border);
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .action-banner {
    padding: 0.375rem 0.625rem;
    font-size: var(--text-sm);
    border-radius: var(--radius-sm);
  }

  .action-banner-error {
    background: var(--color-danger-surface);
    color: var(--color-danger-dark);
    border: 1px solid var(--color-danger-border);
  }

  .action-banner-success {
    background: var(--color-badge-entity-bg);
    color: var(--color-badge-entity-text);
    border: 1px solid var(--color-badge-entity-bg);
  }

  .draft-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .draft-actions-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .draft-actions-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .regen-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .regen-btn:hover,
  .regen-btn.active {
    background: rgba(234, 114, 110, 0.08);
    border-color: rgba(234, 114, 110, 0.3);
    color: var(--color-primary);
  }

  .regen-drawer {
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
  }

  .export-btn,
  .delete-btn,
  .mailchimp-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .export-btn:hover:not(:disabled),
  .mailchimp-btn:hover:not(:disabled) {
    background: var(--color-background);
    color: var(--color-text);
  }

  .delete-btn:hover:not(:disabled) {
    background: var(--color-status-error-bg);
    border-color: var(--color-danger-light);
    color: var(--color-danger-dark);
  }

  .send-btn {
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    border: none;
    color: white;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(234, 114, 110, 0.3);
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(234, 114, 110, 0.35);
  }

  .draft-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1;
    color: white;
    background: var(--color-primary);
    border-radius: 999px;
  }

  /* Draft list section */
  .draft-list-section {
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border);
    padding: var(--spacing-md) var(--spacing-lg);
    max-height: 300px;
    overflow-y: auto;
    background: var(--color-background);
  }

  .status-toggle {
    display: flex;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--color-border);
    width: fit-content;
  }

  .toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    font-size: var(--text-base-sm);
    font-weight: 500;
    border: none;
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .toggle-btn:not(:last-child) {
    border-right: 1px solid var(--color-border);
  }

  .toggle-btn:hover:not(.active):not(:disabled) {
    background: var(--color-surface-muted);
  }

  .toggle-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-confirm.active {
    background: var(--color-badge-entity-bg);
    color: var(--color-badge-entity-text);
  }

  .toggle-reject.active {
    background: var(--color-status-error-bg);
    color: var(--color-status-error-text);
  }

  @media (max-width: 768px) {
    .slide-over {
      width: 100%;
      min-width: unset;
    }

    .draft-actions-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .draft-actions-left,
    .draft-actions-right {
      justify-content: center;
    }
  }
</style>
