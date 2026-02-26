<script lang="ts">
  import DraftList from './DraftList.svelte';
  import type { BajourDraft } from '../types';

  interface Props {
    open: boolean;
    drafts: BajourDraft[];
    onselect: (draft: BajourDraft) => void;
  }

  let { open, drafts, onselect }: Props = $props();
</script>

{#if open}
  <div class="sidebar">
    <div class="sidebar-body">
      <DraftList {drafts} {onselect} />
    </div>
  </div>
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: 100%;
    border-left: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-surface, white);
    flex-shrink: 0;
    overflow: hidden;
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    padding-top: 3rem;
  }

  @media (max-width: 768px) {
    .sidebar {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 10;
      width: 100%;
    }
  }
</style>
