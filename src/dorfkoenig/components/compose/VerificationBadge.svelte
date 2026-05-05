<script lang="ts">
  // Status badge for draft verification, including machine-withheld drafts.
  import { Clock, CheckCircle, XCircle, ShieldAlert } from 'lucide-svelte';
  import type { VerificationStatus } from '../../bajour/types';

  interface Props {
    status: VerificationStatus;
  }

  let { status }: Props = $props();

  const labelMap: Record<VerificationStatus, string> = {
    ausstehend: 'Ausstehend',
    'bestätigt': 'Bestätigt',
    abgelehnt: 'Abgelehnt',
    withheld: 'Zurückgehalten',
  };

  let label = $derived(labelMap[status]);
</script>

<span
  class="badge"
  class:badge-pending={status === 'ausstehend'}
  class:badge-confirmed={status === 'bestätigt'}
  class:badge-rejected={status === 'abgelehnt'}
  class:badge-withheld={status === 'withheld'}
>
  {#if status === 'ausstehend'}
    <Clock size={12} />
  {:else if status === 'bestätigt'}
    <CheckCircle size={12} />
  {:else if status === 'withheld'}
    <ShieldAlert size={12} />
  {:else}
    <XCircle size={12} />
  {/if}
  {label}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem 0.75rem;
    font-size: var(--text-base-sm);
    font-weight: 600;
    border-radius: var(--radius-full);
    white-space: nowrap;
    line-height: 1.4;
  }

  .badge-pending {
    background: var(--color-badge-event-bg);
    color: var(--color-badge-event-text);
  }

  .badge-confirmed {
    background: var(--color-badge-entity-bg);
    color: var(--color-badge-entity-text);
  }

  .badge-rejected {
    background: var(--color-status-error-bg);
    color: var(--color-status-error-text);
  }

  .badge-withheld {
    background: #fffbeb;
    color: #92400e;
  }
</style>
