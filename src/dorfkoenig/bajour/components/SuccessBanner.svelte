<script lang="ts">
  // Dismissible success banner for verification-sent and Mailchimp-campaign-created events.
  import { CheckCircle, Mail, X } from 'lucide-svelte';
  import { fly } from 'svelte/transition';

  interface Props {
    variant: 'sent' | 'mailchimp';
    villageCount?: number;
    ondismiss: () => void;
  }

  let { variant, villageCount = 0, ondismiss }: Props = $props();

  let title = $derived(variant === 'mailchimp' ? 'Newsletter-Kampagne erstellt' : 'Entwurf gesendet');
  let message = $derived(
    variant === 'mailchimp'
      ? `${villageCount} Dörfer wurden eingefügt. Bitte in Mailchimp überprüfen und senden.`
      : 'Entwurf wurde an die Dorfkönige gesendet. Die Verifizierung läuft.'
  );
</script>

<div class="success-banner" transition:fly={{ y: -10, duration: 300 }}>
  <div class="banner-icon">
    {#if variant === 'mailchimp'}
      <Mail size={20} />
    {:else}
      <CheckCircle size={20} />
    {/if}
  </div>
  <div class="banner-content">
    <span class="banner-title">{title}</span>
    <span class="banner-message">{message}</span>
  </div>
  <button class="banner-dismiss" onclick={ondismiss} aria-label="Schliessen">
    <X size={14} />
  </button>
</div>

<style>
  .success-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.12) 100%);
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: var(--radius-lg);
  }

  .banner-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-success-dark);
    padding-top: 0.0625rem;
  }

  .banner-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1;
    min-width: 0;
  }

  .banner-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-badge-entity-text);
  }

  .banner-message {
    font-size: var(--text-base-sm);
    color: var(--color-success-dark);
    line-height: 1.5;
  }

  .banner-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-success-dark);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .banner-dismiss:hover {
    background: rgba(5, 150, 105, 0.12);
  }
</style>
