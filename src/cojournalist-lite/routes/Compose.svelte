<script lang="ts">
  import ComposePanel from '../components/compose/ComposePanel.svelte';
</script>

<div class="compose-page">
  <header class="page-header">
    <h1>Komponieren</h1>
  </header>

  <ComposePanel />
</div>

<style>
  .compose-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    height: calc(100vh - 80px);
  }
</style>
