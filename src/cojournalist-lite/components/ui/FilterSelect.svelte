<script lang="ts">
  interface Option {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    icon?: any;
    options: Option[];
    value: string;
    onchange: (value: string) => void;
    disabled?: boolean;
  }

  let { icon, options, value, onchange, disabled = false }: Props = $props();
</script>

<div class="filter-select" class:disabled>
  {#if icon}
    {@const Icon = icon}
    <span class="filter-icon">
      <Icon size={14} />
    </span>
  {/if}
  <select
    {value}
    {disabled}
    onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
  >
    {#each options as opt}
      <option value={opt.value}>
        {opt.label}{opt.count !== undefined ? ` (${opt.count})` : ''}
      </option>
    {/each}
  </select>
</div>

<style>
  .filter-select {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    position: relative;
  }

  .filter-icon {
    display: flex;
    color: var(--color-text-muted, #6b7280);
    pointer-events: none;
  }

  select {
    appearance: none;
    padding: 0.375rem 1.5rem 0.375rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 0.5rem center;
    color: var(--color-text, #111827);
    cursor: pointer;
    min-width: 0;
    max-width: 200px;
  }

  select:focus {
    outline: none;
    border-color: var(--color-primary, #6366f1);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
  }

  .disabled select {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
