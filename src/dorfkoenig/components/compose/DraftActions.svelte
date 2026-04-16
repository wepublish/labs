<script lang="ts">
  import { PenTool, Download, Trash2, Loader2, Check, MessageCircle } from 'lucide-svelte';
  import VerificationToggle from './VerificationToggle.svelte';
  import DraftPromptEditor from './DraftPromptEditor.svelte';
  import type { VerificationStatus } from '../../bajour/types';
  import type { BajourDraft } from '../../bajour/types';

  interface Props {
    savedDraft: BajourDraft | null;
    hasUnsavedDraft: boolean;
    canSave: boolean;
    sendLoading: boolean;
    deleteLoading: boolean;
    statusLoading: boolean;
    actionError: string;
    actionSuccess: string | null;
    showRegenPrompt: boolean;
    regenPrompt: string;
    onsavesend: () => void;
    onresendverification: () => void;
    ondelete: () => void;
    onexport: () => void;
    onstatusoverride: (status: VerificationStatus) => void;
    ontogglregen: () => void;
    onregenpromptchange: (prompt: string) => void;
    onregenreset: () => void;
    onregenerate: () => void;
  }

  let {
    savedDraft,
    hasUnsavedDraft,
    canSave,
    sendLoading,
    deleteLoading,
    statusLoading,
    actionError,
    actionSuccess,
    showRegenPrompt,
    regenPrompt,
    onsavesend,
    onresendverification,
    ondelete,
    onexport,
    onstatusoverride,
    ontogglregen,
    onregenpromptchange,
    onregenreset,
    onregenerate,
  }: Props = $props();

  let whatsappSent = $derived(
    savedDraft?.verification_sent_at != null
  );
  let whatsappConfirmed = $derived(
    savedDraft?.verification_status === 'bestätigt'
  );
  let whatsappPending = $derived(
    savedDraft?.verification_status === 'ausstehend' && whatsappSent
  );
</script>

<div class="draft-actions-footer">
  {#if actionError}
    <div class="action-banner action-banner-error">{actionError}</div>
  {/if}
  {#if actionSuccess}
    <div class="action-banner action-banner-success">{actionSuccess}</div>
  {/if}

  <!-- Regen drawer (between body and footer actions) -->
  {#if showRegenPrompt && hasUnsavedDraft}
    <div class="regen-drawer">
      <DraftPromptEditor
        {regenPrompt}
        onpromptchange={onregenpromptchange}
        onreset={onregenreset}
        onregenerate={onregenerate}
      />
    </div>
  {/if}

  <!-- Controls row: verification + regen + WhatsApp + utility actions -->
  <div class="controls-row">
    <div class="controls-left">
      <VerificationToggle
        status={savedDraft?.verification_status ?? null}
        loading={statusLoading}
        disabled={!savedDraft && !canSave}
        onchange={onstatusoverride}
      />
      {#if hasUnsavedDraft}
        <button
          class="ctrl-btn regen-btn"
          class:active={showRegenPrompt}
          onclick={ontogglregen}
          type="button"
        >
          <PenTool size={14} />
          Neu generieren
        </button>
      {/if}
    </div>
    <div class="controls-right">
      {#if savedDraft}
        <button
          class="ctrl-btn"
          onclick={ondelete}
          disabled={deleteLoading}
          type="button"
          title="Entwurf löschen"
        >
          {#if deleteLoading}
            <Loader2 size={14} class="spin" />
          {:else}
            <Trash2 size={14} />
          {/if}
        </button>
      {/if}
      <button
        class="ctrl-btn"
        onclick={onexport}
        type="button"
        title="Als Markdown herunterladen"
      >
        <Download size={14} />
      </button>
    </div>
  </div>

  <!-- WhatsApp verification -->
  <div class="whatsapp-row">
    {#if whatsappConfirmed}
      <span class="whatsapp-status confirmed"><Check size={14} strokeWidth={3} /> Bestätigt durch Dorfkönige</span>
    {:else if whatsappPending}
      <span class="whatsapp-status pending"><Loader2 size={14} class="spin" /> Gesendet — warte auf Antwort</span>
      <button
        class="step-btn step-btn-resend"
        onclick={onresendverification}
        disabled={sendLoading}
        type="button"
      >
        {#if sendLoading}
          <Loader2 size={14} class="spin" />
        {:else}
          <MessageCircle size={14} />
        {/if}
        Erneut senden
      </button>
    {:else if whatsappSent}
      <button
        class="step-btn step-btn-resend"
        onclick={onresendverification}
        disabled={sendLoading}
        type="button"
      >
        {#if sendLoading}
          <Loader2 size={14} class="spin" />
        {:else}
          <MessageCircle size={14} />
        {/if}
        Erneut senden
      </button>
    {:else if savedDraft}
      <button
        class="step-btn step-btn-whatsapp"
        onclick={onresendverification}
        disabled={sendLoading}
        type="button"
      >
        {#if sendLoading}
          <Loader2 size={14} class="spin" />
        {:else}
          <MessageCircle size={14} />
        {/if}
        An Dorfkönige senden
      </button>
    {:else}
      <button
        class="step-btn step-btn-whatsapp"
        onclick={onsavesend}
        disabled={sendLoading || !canSave}
        type="button"
      >
        {#if sendLoading}
          <Loader2 size={14} class="spin" />
        {:else}
          <MessageCircle size={14} />
        {/if}
        An Dorfkönige senden
      </button>
    {/if}
  </div>
</div>

<style>
  .draft-actions-footer {
    flex-shrink: 0;
    border-top: 1px solid var(--color-border);
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  .regen-drawer {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  /* Controls row */
  .controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .controls-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .controls-right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .ctrl-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .ctrl-btn:hover:not(:disabled) {
    background: var(--color-background);
    color: var(--color-text);
  }

  .ctrl-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .regen-btn:hover,
  .regen-btn.active {
    background: rgba(234, 114, 110, 0.08);
    border-color: rgba(234, 114, 110, 0.3);
    color: var(--color-primary);
  }

  /* WhatsApp row */
  .whatsapp-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .whatsapp-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .whatsapp-status.confirmed {
    color: #16a34a;
    font-weight: 600;
  }

  .whatsapp-status.pending {
    color: var(--color-text-muted);
  }

  .step-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem;
    font-size: var(--text-base-sm);
    font-weight: 600;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .step-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .step-btn-whatsapp {
    color: white;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    box-shadow: 0 1px 3px rgba(234, 114, 110, 0.3);
  }

  .step-btn-whatsapp:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(234, 114, 110, 0.35);
  }

  .step-btn-resend {
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .step-btn-resend:hover:not(:disabled) {
    color: var(--color-text);
    background: var(--color-background);
  }

  @media (max-width: 768px) {
    .controls-row {
      flex-direction: column;
      align-items: stretch;
    }

    .controls-left,
    .controls-right {
      justify-content: center;
    }
  }
</style>
