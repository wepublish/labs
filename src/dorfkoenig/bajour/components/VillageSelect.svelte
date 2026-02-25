<script lang="ts">
  import type { Village } from '../types';
  import villagesData from '../villages.json';

  interface Props {
    selectedVillageId: string | null;
    onselect: (village: Village) => void;
  }

  let { selectedVillageId, onselect }: Props = $props();

  const villages = villagesData as Village[];

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const village = villages.find(v => v.id === target.value);
    if (village) onselect(village);
  }
</script>

<div class="form-group">
  <label for="village-select">Gemeinde wählen</label>
  <select id="village-select" value={selectedVillageId || ''} onchange={handleChange}>
    <option value="" disabled>— Gemeinde auswählen —</option>
    {#each villages as village}
      <option value={village.id}>{village.name} ({village.canton})</option>
    {/each}
  </select>
</div>

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
  }

  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }
</style>
