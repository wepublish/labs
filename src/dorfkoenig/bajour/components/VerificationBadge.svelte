<script lang="ts">
  import { Clock, CheckCircle, XCircle } from 'lucide-svelte';
  import type { VerificationStatus } from '../types';

  interface Props {
    status: VerificationStatus;
  }

  let { status }: Props = $props();

  const labelMap: Record<VerificationStatus, string> = {
    ausstehend: 'Ausstehend',
    'bestätigt': 'Bestätigt',
    abgelehnt: 'Abgelehnt',
  };

  let label = $derived(labelMap[status]);
</script>

<span
  class="badge"
  class:badge-pending={status === 'ausstehend'}
  class:badge-confirmed={status === 'bestätigt'}
  class:badge-rejected={status === 'abgelehnt'}
>
  {#if status === 'ausstehend'}
    <Clock size={12} />
  {:else if status === 'bestätigt'}
    <CheckCircle size={12} />
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
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 9999px;
    white-space: nowrap;
    line-height: 1.4;
  }

  .badge-pending {
    background: #fef3c7;
    color: #92400e;
  }

  .badge-confirmed {
    background: #d1fae5;
    color: #065f46;
  }

  .badge-rejected {
    background: #fee2e2;
    color: #991b1b;
  }
</style>
