<script lang="ts">
  import { RefreshCw, Send, Mail, Loader2 } from 'lucide-svelte';
  import { Button } from '@shared/components';
  import { bajourDrafts } from '../store';
  import { unitsApi } from '../../lib/api';
  import DraftPreview from './DraftPreview.svelte';
  import VerificationBadge from './VerificationBadge.svelte';
  import SuccessBanner from './SuccessBanner.svelte';
  import type { Village, BajourDraft, BajourDraftGenerated, VerificationStatus } from '../types';
  import { renderMarkdownBody } from '../utils';

  interface Props {
    generatedDraft: BajourDraftGenerated | null;
    existingDraft: BajourDraft | null;
    village: Village | null;
    selectedUnitIds: string[];
    generationPrompt: string;
    onregenerate: () => void;
  }

  let { generatedDraft, existingDraft, village, selectedUnitIds, generationPrompt, onregenerate }: Props = $props();

  let loading = $state(false);
  let error = $state('');
  let statusLoading = $state(false);
  let mailchimpLoading = $state(false);
  let successBanner = $state<{ variant: 'sent' | 'mailchimp'; villageCount?: number } | null>(null);

  // Track existingDraft internally so we can update it after status override
  let currentExistingDraft = $state<BajourDraft | null>(null);

  // Keep in sync with prop changes
  $effect(() => {
    currentExistingDraft = existingDraft;
  });

  let hasVerifiedDraft = $derived(
    currentExistingDraft?.verification_status === 'bestätigt'
  );

  // Send draft to Dorfkonige
  async function handleSend() {
    if (!village || !generatedDraft) return;

    loading = true;
    error = '';

    try {
      const bodyParts: string[] = [];
      if (generatedDraft.greeting) bodyParts.push(generatedDraft.greeting);
      for (const section of generatedDraft.sections) {
        bodyParts.push(`## ${section.heading}\n${section.body}`);
      }
      if (generatedDraft.outlook) bodyParts.push(generatedDraft.outlook);
      if (generatedDraft.sign_off) bodyParts.push(generatedDraft.sign_off);

      const draft = await bajourDrafts.create({
        village_id: village.id,
        village_name: village.name,
        title: generatedDraft.title,
        body: bodyParts.join('\n\n'),
        selected_unit_ids: selectedUnitIds,
        custom_system_prompt: generationPrompt.trim() || null,
      });

      await bajourDrafts.sendVerification(draft.id);
      if (selectedUnitIds.length > 0) {
        await unitsApi.markUsed(selectedUnitIds);
      }
      currentExistingDraft = draft;
      successBanner = { variant: 'sent' };
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  // Manual verification override
  async function handleStatusOverride(status: VerificationStatus) {
    if (!currentExistingDraft || statusLoading) return;
    statusLoading = true;
    error = '';
    try {
      const updated = await bajourDrafts.updateVerificationStatus(currentExistingDraft.id, status);
      currentExistingDraft = updated;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      statusLoading = false;
    }
  }

  // Send to Mailchimp
  async function handleSendToMailchimp() {
    if (mailchimpLoading) return;
    mailchimpLoading = true;
    error = '';
    try {
      const result = await bajourDrafts.sendToMailchimp();
      const unitIds = selectedUnitIds.length > 0
        ? selectedUnitIds
        : currentExistingDraft?.selected_unit_ids ?? [];
      if (unitIds.length > 0) {
        await unitsApi.markUsed(unitIds);
      }
      successBanner = { variant: 'mailchimp', villageCount: result.village_count };
    } catch (err) {
      error = (err as Error).message;
    } finally {
      mailchimpLoading = false;
    }
  }
</script>

<div class="step-preview-send">
  {#if successBanner}
    <SuccessBanner
      variant={successBanner.variant}
      villageCount={successBanner.villageCount}
      ondismiss={() => { successBanner = null; }}
    />
  {/if}

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if currentExistingDraft}
    <!-- Existing draft view -->
    <div class="existing-draft-header">
      <VerificationBadge status={currentExistingDraft.verification_status} />
      {#if currentExistingDraft.title}
        <h3 class="existing-draft-title">{currentExistingDraft.title}</h3>
      {/if}
      <span class="existing-draft-village">{currentExistingDraft.village_name}</span>
    </div>

    <div class="status-override">
      <span class="status-override-hint">Status manuell überschreiben</span>
      <div class="status-toggle">
        <button
          class="toggle-btn toggle-confirm"
          class:active={currentExistingDraft.verification_status === 'bestätigt'}
          disabled={statusLoading}
          onclick={() => handleStatusOverride('bestätigt')}
        >
          {#if statusLoading && currentExistingDraft.verification_status !== 'bestätigt'}
            <Loader2 size={12} class="spin" />
          {/if}
          Bestätigt
        </button>
        <button
          class="toggle-btn toggle-reject"
          class:active={currentExistingDraft.verification_status === 'abgelehnt'}
          disabled={statusLoading}
          onclick={() => handleStatusOverride('abgelehnt')}
        >
          {#if statusLoading && currentExistingDraft.verification_status !== 'abgelehnt'}
            <Loader2 size={12} class="spin" />
          {/if}
          Abgelehnt
        </button>
      </div>
    </div>

    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via renderMarkdownBody -->
    <div class="existing-draft-body">{@html renderMarkdownBody(currentExistingDraft.body)}</div>

  {:else if generatedDraft}
    <DraftPreview draft={generatedDraft} />
  {/if}

  {#if !successBanner}
    <div class="step-actions">
      <Button variant="ghost" onclick={onregenerate} disabled={loading}>
        <RefreshCw size={14} />
        {currentExistingDraft ? 'Neuer Entwurf' : 'Neu generieren'}
      </Button>

      {#if generatedDraft && !currentExistingDraft}
        <Button onclick={handleSend} loading={loading} disabled={!generatedDraft}>
          <Send size={14} />
          An Dorfkönige senden
        </Button>
      {/if}

      <span class="mailchimp-wrapper" title={hasVerifiedDraft ? '' : 'Mindestens ein bestätigter Entwurf nötig'}>
        <Button onclick={handleSendToMailchimp} loading={mailchimpLoading} disabled={!hasVerifiedDraft}>
          <Mail size={14} />
          An Mailchimp senden
        </Button>
      </span>
    </div>
  {/if}
</div>

<style>
  .step-preview-send {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .error-message {
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
  }

  .existing-draft-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    align-items: flex-start;
  }

  .existing-draft-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text, #111827);
    margin: 0;
  }

  .existing-draft-village {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
  }

  .existing-draft-body {
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    line-height: 1.6;
  }

  .existing-draft-body :global(h3) {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text, #111827);
    margin: 0.75rem 0 0.25rem 0;
  }

  .existing-draft-body :global(h3:first-child) {
    margin-top: 0;
  }

  .existing-draft-body :global(p) {
    margin: 0 0 0.375rem 0;
  }

  .existing-draft-body :global(strong) {
    font-weight: 600;
  }

  .existing-draft-body :global(.source-ref) {
    font-size: 0.6875rem;
    color: var(--color-text-muted, #6b7280);
  }

  /* Status override toggle */
  .status-override {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .status-override-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
  }

  .status-toggle {
    display: flex;
    gap: 0;
    border-radius: 0.375rem;
    overflow: hidden;
    border: 1px solid var(--color-border, #e5e7eb);
    width: fit-content;
  }

  .toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: none;
    background: var(--color-surface, white);
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .toggle-btn:not(:last-child) {
    border-right: 1px solid var(--color-border, #e5e7eb);
  }

  .toggle-btn:hover:not(.active):not(:disabled) {
    background: var(--color-surface-muted, #f3f4f6);
  }

  .toggle-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-confirm.active {
    background: #d1fae5;
    color: #065f46;
  }

  .toggle-reject.active {
    background: #fee2e2;
    color: #991b1b;
  }

  .step-preview-send :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .mailchimp-wrapper {
    display: inline-flex;
  }
</style>
