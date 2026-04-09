<script lang="ts">
  import { untrack } from 'svelte';
  import { Search, Loader2 } from 'lucide-svelte';
  import FilterSelect from './FilterSelect.svelte';

  interface Option {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    locationOptions: Option[];
    topicOptions: Option[];
    selectedLocation: string | null;
    selectedTopic: string | null;
    onLocationChange: (value: string | null) => void;
    onTopicChange: (value: string | null) => void;
    scoutOptions?: Option[];
    selectedScout?: string | null;
    onScoutChange?: (value: string | null) => void;
    loading?: boolean;
    showSearch?: boolean;
    searchQuery?: string;
    searchPlaceholder?: string;
    onSearch?: (query: string) => void;
    isSearching?: boolean;
    dateFrom?: string;
    dateTo?: string;
    onDateChange?: (from: string, to: string) => void;
  }

  let {
    locationOptions,
    topicOptions,
    selectedLocation,
    selectedTopic,
    onLocationChange,
    onTopicChange,
    scoutOptions,
    selectedScout,
    onScoutChange,
    loading = false,
    showSearch = false,
    searchQuery = '',
    searchPlaceholder = 'Suchen...',
    onSearch,
    isSearching = false,
    dateFrom = '',
    dateTo = '',
    onDateChange,
  }: Props = $props();

  let searchInput = $state(untrack(() => searchQuery));
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    searchInput = searchQuery;
  });

  $effect(() => {
    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  });

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchInput = value;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onSearch?.(value);
    }, 300);
  }

  function handleSearchClear() {
    searchInput = '';
    onSearch?.('');
  }
</script>

<div class="panel-filter-bar">
  <div class="filter-row">
    {#if loading}
      <div class="loading-inline">
        <Loader2 size={14} class="spin" />
        <span>Laden...</span>
      </div>
    {:else}
      <FilterSelect
        options={locationOptions}
        value={selectedLocation || ''}
        onchange={(v) => onLocationChange(v || null)}
      />

      <div class="filter-divider"></div>

      <FilterSelect
        options={topicOptions}
        value={selectedTopic || ''}
        onchange={(v) => onTopicChange(v || null)}
      />

      {#if scoutOptions && scoutOptions.length > 1}
        <div class="filter-divider"></div>
        <FilterSelect
          options={scoutOptions}
          value={selectedScout || ''}
          onchange={(v) => onScoutChange?.(v || null)}
        />
      {/if}

      {#if showSearch}
        <div class="filter-divider"></div>
        <div class="search-input-wrapper">
          <Search size={14} />
          <input
            type="text"
            value={searchInput}
            oninput={handleSearchInput}
            placeholder={searchPlaceholder}
          />
          {#if isSearching}
            <Loader2 size={14} class="spin" />
          {:else if searchInput}
            <button class="search-clear" onclick={handleSearchClear}>&times;</button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
  {#if onDateChange}
    <div class="date-filter">
      <input
        type="date"
        value={dateFrom}
        oninput={(e) => onDateChange?.(e.currentTarget.value, dateTo)}
        class="date-input"
        placeholder="Von"
      />
      <span class="date-separator">–</span>
      <input
        type="date"
        value={dateTo}
        oninput={(e) => onDateChange?.(dateFrom, e.currentTarget.value)}
        class="date-input"
        placeholder="Bis"
      />
    </div>
  {/if}
</div>

<style>
  .panel-filter-bar {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-divider {
    width: 1px;
    height: 20px;
    background: var(--color-border);
    margin: 0 0.125rem;
    flex-shrink: 0;
  }

  .loading-inline {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--text-base-sm);
    color: var(--color-text-muted);
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text-muted);
  }

  .search-input-wrapper input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: var(--text-base-sm);
    color: var(--color-text);
    outline: none;
  }

  .search-input-wrapper input::placeholder {
    color: var(--color-text-light);
  }

  .search-clear {
    background: none;
    border: none;
    font-size: var(--text-lg);
    color: var(--color-text-light);
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .search-clear:hover {
    color: var(--color-text);
  }

  .date-filter {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0 0.75rem 0.75rem;
  }

  .date-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm, 0.375rem);
    background: var(--color-background, #f9fafb);
    color: var(--color-text);
    font-family: inherit;
  }

  .date-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .date-separator {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }
</style>
