<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { focusTrap } from '../../lib/actions/focus-trap';
  import DraftContent from './DraftContent.svelte';
  import DraftGenerating from './DraftGenerating.svelte';
  import DraftError from './DraftError.svelte';
  import DraftActions from './DraftActions.svelte';
  import DraftListPanel from './DraftListPanel.svelte';
  import VerificationBadge from './VerificationBadge.svelte';
  import LocationAutocomplete from '../ui/LocationAutocomplete.svelte';
  import DraftList from './DraftList.svelte';
  import { bajourDrafts } from '../../bajour/store';
  import { bajourApi } from '../../bajour/api';
  import { supabase } from '../../lib/supabase';
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
    initialSavedDraft?: BajourDraft | null;
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
    initialSavedDraft = null,
    onClose,
    onRetry,
    onRegenerate,
  }: Props = $props();

  // --- Helpers ---

  function draftToMarkdown(d: Draft): string {
    const parts: string[] = [];
    if (d.headline) parts.push(d.headline);
    for (const section of d.sections) {
      parts.push(`## ${section.heading}\n${section.content}`);
    }
    return parts.join('\n\n');
  }

  function parseSavedDraftBody(sd: BajourDraft): Draft {
    const lines = sd.body.split('\n');
    let headline = '';
    const sections: { heading: string; content: string }[] = [];
    let currentHeading = '';
    let currentLines: string[] = [];

    function flush() {
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
        flush();
        currentHeading = headingMatch[1];
        currentLines = [];
      } else if (trimmed) {
        currentLines.push(trimmed);
      }
    }
    flush();

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

  // --- State ---

  let savedDraft = $state<BajourDraft | null>(null);
  let sendLoading = $state(false);
  let deleteLoading = $state(false);
  let statusLoading = $state(false);
  let actionError = $state('');
  let actionSuccess = $state<string | null>(null);

  let showDraftList = $state(false);
  let showRegenPrompt = $state(false);
  let regenPrompt = $state('');
  let locationFilter = $state('');
  let publicationDate = $state(new Date().toISOString().split('T')[0]);

  let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  // Derived: whether we have draft content to show actions for
  let hasContent = $derived(!!(draft || savedDraft));
  let canSave = $derived(!!(villageId && villageName));

  // Zero state: no draft content and not generating/erroring
  let isZeroState = $derived(!savedDraft && !draft && !isGenerating && !generationError);

  // Drafts filtered by location
  let filteredDrafts = $derived(
    locationFilter
      ? $bajourDrafts.drafts.filter((d) =>
          d.village_name.toLowerCase().startsWith(locationFilter.toLowerCase())
        )
      : $bajourDrafts.drafts
  );

  // --- Realtime subscription ---

  function subscribeToUpdates(draftId: string): void {
    unsubscribeFromUpdates();
    realtimeChannel = supabase
      .channel(`draft-${draftId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bajour_drafts',
        filter: `id=eq.${draftId}`,
      }, (payload) => {
        savedDraft = payload.new as BajourDraft;
      })
      .subscribe();
  }

  function unsubscribeFromUpdates(): void {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  onDestroy(unsubscribeFromUpdates);

  // --- Effects ---

  // Load drafts and reset list visibility when panel opens
  $effect(() => {
    if (open) {
      bajourDrafts.load();
      showDraftList = initialShowDraftList;
      // Admin deep-link: adopt the pre-fetched draft as the selected one.
      // Do NOT call subscribeToUpdates — Realtime respects bajour_drafts RLS,
      // so an admin who isn't the draft owner would get a silent no-op.
      if (initialSavedDraft && !savedDraft) {
        savedDraft = initialSavedDraft;
      }
    }
  });

  // Reset all state when panel closes
  $effect(() => {
    if (!open) {
      savedDraft = null;
      showDraftList = false;
      showRegenPrompt = false;
      regenPrompt = '';
      locationFilter = '';
      publicationDate = new Date().toISOString().split('T')[0];
      sendLoading = false;
      deleteLoading = false;
      statusLoading = false;
      actionError = '';
      actionSuccess = null;
      unsubscribeFromUpdates();
    }
  });

  // Sync savedDraft with store updates (from background polling fallback)
  $effect(() => {
    if (!savedDraft) return;
    const storeDraft = $bajourDrafts.drafts.find((d) => d.id === savedDraft!.id);
    if (storeDraft && storeDraft.updated_at !== savedDraft.updated_at) {
      savedDraft = storeDraft;
    }
  });

  // Sync publicationDate when a saved draft is loaded
  $effect(() => {
    if (savedDraft?.publication_date) {
      publicationDate = savedDraft.publication_date;
    }
  });

  // --- Action handlers ---

  async function handleStatusOverride(status: VerificationStatus): Promise<void> {
    if (statusLoading) return;
    statusLoading = true;
    actionError = '';
    try {
      if (!savedDraft) {
        if (!draft || !villageId || !villageName) return;
        savedDraft = await bajourDrafts.create({
          village_id: villageId,
          village_name: villageName,
          title: draft.title,
          body: draftToMarkdown(draft),
          selected_unit_ids: unitIds,
          custom_system_prompt: _customPrompt || null,
          publication_date: publicationDate,
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
        publication_date: publicationDate,
      });

      try {
        await bajourDrafts.sendVerification(created.id);
      } catch (verifyErr) {
        savedDraft = created;
        actionError = `Entwurf gespeichert, aber Verifizierung fehlgeschlagen: ${(verifyErr as Error).message}`;
        return;
      }

      savedDraft = created;
      actionSuccess = 'Entwurf gespeichert und an Dorfkönige gesendet.';
      subscribeToUpdates(created.id);
      bajourDrafts.startPolling();
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      sendLoading = false;
    }
  }

  async function handleResendVerification(): Promise<void> {
    if (!savedDraft) return;
    sendLoading = true;
    actionError = '';
    actionSuccess = null;

    try {
      await bajourDrafts.sendVerification(savedDraft.id);
      actionSuccess = 'Verifizierung erneut gesendet.';
      subscribeToUpdates(savedDraft.id);
      bajourDrafts.startPolling();
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      sendLoading = false;
    }
  }

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

  function handleExport(): void {
    if (!savedDraft && !draft) return;
    actionError = '';
    actionSuccess = null;

    const text = savedDraft
      ? savedDraft.body
      : (draft!.title ? `# ${draft!.title}\n\n` : '') + draftToMarkdown(draft!);

    const title = savedDraft?.title || draft?.title || 'entwurf';
    const filename = `${title.replace(/[^a-zA-Z0-9äöüÄÖÜß\- ]/g, '').replace(/\s+/g, '-').toLowerCase()}.md`;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    actionSuccess = 'Markdown heruntergeladen.';
  }

  function handleRegenerate(): void {
    const prompt = regenPrompt.trim() || null;
    onRegenerate(prompt);
  }

  async function handlePublicationDateChange(newDate: string): Promise<void> {
    publicationDate = newDate;
    if (savedDraft) {
      try {
        const updated = await bajourApi.updateDraft(savedDraft.id, { publication_date: newDate });
        savedDraft = updated;
      } catch (err) {
        actionError = (err as Error).message;
      }
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div class="backdrop" transition:fade={{ duration: 200 }} onclick={onClose} role="presentation"></div>

  <!-- Panel -->
  <div class="slide-over" transition:fly={{ x: 400, duration: 300 }} use:focusTrap role="dialog" aria-modal="true" aria-label="Entwurf">
    {#if isZeroState}
      <!-- ═══ ZERO STATE: full-panel draft list with filter ═══ -->
      <div class="zero-state-header">
        <LocationAutocomplete
          value={locationFilter}
          onselect={(loc) => { locationFilter = loc.city; }}
          placeholder="Entwürfe filtern..."
        />
        {#if locationFilter}
          <button class="clear-filter" onclick={() => { locationFilter = ''; }} type="button">
            Alle anzeigen
          </button>
        {/if}
      </div>
      <div class="zero-state-body">
        <DraftList
          drafts={filteredDrafts}
          onselect={(selectedDraft) => { savedDraft = selectedDraft; showDraftList = false; actionError = ''; actionSuccess = null; }}
        />
      </div>
    {:else}
      <!-- ═══ DRAFT STATE: toggle overlay + content ═══ -->
      <DraftListPanel
        drafts={$bajourDrafts.drafts}
        activeDraftId={savedDraft?.id ?? null}
        show={showDraftList}
        ontoggle={() => showDraftList = !showDraftList}
        onselect={(selectedDraft) => {
          savedDraft = selectedDraft;
          showDraftList = false;
          actionError = '';
          actionSuccess = null;
        }}
      />

      <!-- Body: content-first layout -->
      <div class="panel-body">
        {#if isGenerating}
          <DraftGenerating
            {isGenerating}
            {generationError}
            {progressMessage}
            {selectedCount}
          />
        {:else if generationError}
          <DraftError error={generationError} onretry={onRetry} />
        {:else if savedDraft}
          <div class="meta-line">
            <span class="village-pill">{savedDraft.village_name}</span>
            <VerificationBadge status={savedDraft.verification_status} />
            <input
              type="date"
              class="publication-date"
              value={publicationDate}
              onchange={(e) => handlePublicationDateChange(e.currentTarget.value)}
              aria-label="Erscheinungsdatum"
            />
          </div>
          <DraftContent draft={parseSavedDraftBody(savedDraft)} />
        {:else if draft}
          {#if villageName}
            <div class="meta-line">
              <span class="village-pill">{villageName}</span>
              <input
                type="date"
                class="publication-date"
                value={publicationDate}
                onchange={(e) => { publicationDate = e.currentTarget.value; }}
                aria-label="Erscheinungsdatum"
              />
            </div>
          {/if}
          <DraftContent {draft} />
        {/if}
      </div>

      <!-- Sticky action footer -->
      {#if hasContent && !isGenerating && !generationError}
        <DraftActions
          {savedDraft}
          hasUnsavedDraft={!!draft}
          {canSave}
          {sendLoading}
          {deleteLoading}
          {statusLoading}
          {actionError}
          {actionSuccess}
          {showRegenPrompt}
          {regenPrompt}
          onsavesend={handleSaveSend}
          onresendverification={handleResendVerification}
          ondelete={handleDelete}
          onexport={handleExport}
          onstatusoverride={handleStatusOverride}
          ontogglregen={() => showRegenPrompt = !showRegenPrompt}
          onregenpromptchange={(v) => { regenPrompt = v; }}
          onregenreset={() => { regenPrompt = ''; }}
          onregenerate={handleRegenerate}
        />
      {/if}
    {/if}
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

  /* ── ZERO STATE ── */
  .zero-state-header {
    flex-shrink: 0;
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .clear-filter {
    align-self: flex-start;
    background: none;
    border: none;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .clear-filter:hover {
    color: var(--color-text);
  }

  .zero-state-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm) var(--spacing-lg) var(--spacing-lg);
  }

  /* ── DRAFT STATE ── */
  .panel-body {
    flex: 1;
    overflow-y: auto;
  }

  .meta-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: var(--spacing-md) 2.5rem 0;
  }

  .village-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.1875rem 0.75rem;
    font-size: var(--text-base-sm);
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
  }

  .publication-date {
    margin-left: auto;
    padding: 0.1875rem 0.5rem;
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 768px) {
    .slide-over {
      width: 100%;
      min-width: unset;
    }
  }
</style>
