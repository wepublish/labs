<script lang="ts">
  import { MapPin, Tag } from 'lucide-svelte';

  interface Props {
    mode: 'location' | 'topic';
    compact?: boolean;
    onchange: (mode: 'location' | 'topic') => void;
  }

  let { mode, compact = true, onchange }: Props = $props();
</script>

<div class="mode-toggle" class:compact>
  <button
    type="button"
    class="mode-btn"
    class:active={mode === 'location'}
    onclick={() => onchange('location')}
  >
    <MapPin size={14} />
    {#if !compact}<span>Ort</span>{/if}
  </button>
  <button
    type="button"
    class="mode-btn"
    class:active={mode === 'topic'}
    onclick={() => onchange('topic')}
  >
    <Tag size={14} />
    {#if !compact}<span>Thema</span>{/if}
  </button>
</div>

<style>
  .mode-toggle {
    display: inline-flex;
    border-radius: 0.375rem;
    border: 1px solid var(--color-border, #e5e7eb);
    overflow: hidden;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: transparent;
    border: none;
    color: var(--color-text-muted, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:not(:last-child) {
    border-right: 1px solid var(--color-border, #e5e7eb);
  }

  .mode-btn.active {
    background: rgba(234, 114, 110, 0.12);
    color: var(--color-primary);
  }

  .mode-btn:hover:not(.active) {
    background: var(--color-background, #f9fafb);
  }
</style>
