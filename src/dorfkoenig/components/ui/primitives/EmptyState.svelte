<script lang="ts">
  import type { Snippet, Component } from 'svelte';

  interface Props {
    icon?: Component;
    title: string;
    description?: string;
    action?: Snippet;
  }

  let { icon, title, description, action }: Props = $props();
</script>

<div class="empty">
  {#if icon}
    {@const Icon = icon}
    <div class="empty-icon">
      <Icon size={32} strokeWidth={1.5} />
    </div>
  {/if}
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {#if action}
    <div class="empty-action">
      {@render action()}
    </div>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-2xl);
    text-align: center;
  }

  .empty-icon {
    color: var(--color-text-light);
    margin-bottom: var(--spacing-xs);
  }

  .empty-title {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .empty-desc {
    font-size: var(--text-base-sm);
    color: var(--color-text-muted);
    margin: 0;
    max-width: 28ch;
  }

  .empty-action {
    margin-top: var(--spacing-sm);
  }
</style>
