<script lang="ts">
  import ComposePanel from '../components/compose/ComposePanel.svelte';
</script>

<div class="feed-page">
  <header class="page-header">
    <h1>Feed</h1>
  </header>

  <ComposePanel />
</div>

<style>
  .feed-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    height: calc(100vh - 80px);
  }
</style>
