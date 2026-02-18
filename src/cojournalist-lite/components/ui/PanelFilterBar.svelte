<script lang="ts">
  import { MapPin, Tag, Filter, Search, Loader2 } from 'lucide-svelte';
  import ModeToggle from './ModeToggle.svelte';
  import FilterSelect from './FilterSelect.svelte';
  import type { Snippet } from 'svelte';

  interface Option {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    filterMode: 'location' | 'topic';
    onModeChange: (mode: 'location' | 'topic') => void;
    locationOptions: Option[];
    topicOptions: Option[];
    selectedLocation: string | null;
    selectedTopic: string | null;
    onLocationChange: (value: string | null) => void;
    onTopicChange: (value: string | null) => void;
    typeFilter: string;
    typeOptions: Option[];
    onTypeChange: (value: string) => void;
    loading?: boolean;
    showSearch?: boolean;
    searchQuery?: string;
    searchPlaceholder?: string;
    onSearch?: (query: string) => void;
    isSearching?: boolean;
    toolbar?: Snippet;
  }

  let {
    filterMode,
    onModeChange,
    locationOptions,
    topicOptions,
    selectedLocation,
    selectedTopic,
    onLocationChange,
    onTopicChange,
    typeFilter,
    typeOptions,
    onTypeChange,
    loading = false,
    showSearch = false,
    searchQuery = '',
    searchPlaceholder = 'Suchen...',
    onSearch,
    isSearching = false,
    toolbar,
  }: Props = $props();

  let searchInput = $state(searchQuery);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

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
      <ModeToggle mode={filterMode} onchange={onModeChange} />

      <FilterSelect
        icon={filterMode === 'location' ? MapPin : Tag}
        options={filterMode === 'location' ? locationOptions : topicOptions}
        value={filterMode === 'location' ? (selectedLocation || '') : (selectedTopic || '')}
        onchange={(v) => filterMode === 'location' ? onLocationChange(v || null) : onTopicChange(v || null)}
      />

      <div class="filter-divider"></div>

      <FilterSelect
        icon={Filter}
        options={typeOptions}
        value={typeFilter}
        onchange={(v) => onTypeChange(v)}
      />
    {/if}
  </div>

  {#if showSearch}
    <div class="search-row">
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
    </div>
  {/if}

  {#if toolbar}
    <div class="toolbar-row">
      {@render toolbar()}
    </div>
  {/if}
</div>

<style>
  .panel-filter-bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-surface, white);
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
    background: var(--color-border, #d1d5db);
    margin: 0 0.25rem;
    flex-shrink: 0;
  }

  .loading-inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #6b7280);
  }

  .search-row {
    display: flex;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text-muted, #6b7280);
  }

  .search-input-wrapper input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--color-text, #111827);
    outline: none;
  }

  .search-input-wrapper input::placeholder {
    color: var(--color-text-muted, #9ca3af);
  }

  .search-clear {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--color-text-muted, #9ca3af);
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .search-clear:hover {
    color: var(--color-text, #374151);
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
