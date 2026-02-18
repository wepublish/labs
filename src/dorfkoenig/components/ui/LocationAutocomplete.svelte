<script lang="ts">
  import { MapPin } from 'lucide-svelte';

  interface LocationResult {
    city: string;
    country: string;
    latitude?: number;
    longitude?: number;
  }

  interface Props {
    value: string;
    onselect: (location: LocationResult) => void;
    placeholder?: string;
  }

  let { value, onselect, placeholder = 'z.B. Berlin' }: Props = $props();

  const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

  interface MapTilerFeature {
    place_name: string;
    text: string;
    center: [number, number];
    context?: Array<{ id: string; text: string }>;
    properties?: Record<string, unknown>;
  }

  let inputValue = $state('');
  let results = $state<MapTilerFeature[]>([]);
  let showDropdown = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Sync external value changes
  $effect(() => {
    inputValue = value;
  });

  function handleInput(e: Event) {
    const query = (e.target as HTMLInputElement).value;
    inputValue = query;

    if (debounceTimer) clearTimeout(debounceTimer);

    if (!query.trim() || query.trim().length < 2) {
      results = [];
      showDropdown = false;
      return;
    }

    debounceTimer = setTimeout(() => fetchResults(query.trim()), 300);
  }

  async function fetchResults(query: string) {
    if (!MAPTILER_KEY) return;

    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&types=municipality,place&language=de&limit=5`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      results = data.features || [];
      showDropdown = results.length > 0;
    } catch {
      results = [];
      showDropdown = false;
    }
  }

  function getCountry(feature: MapTilerFeature): string {
    const ctx = feature.context;
    if (!ctx) return '';
    const country = ctx.find((c) => c.id.startsWith('country'));
    return country?.text || '';
  }

  function handleSelect(feature: MapTilerFeature) {
    const city = feature.text;
    const country = getCountry(feature);
    const [longitude, latitude] = feature.center;

    inputValue = city;
    showDropdown = false;
    results = [];

    onselect({ city, country, latitude, longitude });
  }

  function handleBlur() {
    setTimeout(() => {
      showDropdown = false;
    }, 150);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showDropdown = false;
    }
  }
</script>

<div class="location-autocomplete">
  <div class="location-input-wrapper">
    <MapPin size={14} class="location-icon" />
    <input
      type="text"
      value={inputValue}
      oninput={handleInput}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      {placeholder}
    />
  </div>
  {#if showDropdown && results.length > 0}
    <div class="location-dropdown">
      {#each results as feature}
        <button
          type="button"
          class="location-result"
          onmousedown={() => handleSelect(feature)}
        >
          <span class="result-city">{feature.text}</span>
          {#if getCountry(feature)}
            <span class="result-country">{getCountry(feature)}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .location-autocomplete {
    position: relative;
  }

  .location-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .location-input-wrapper :global(.location-icon) {
    position: absolute;
    left: 0.625rem;
    color: var(--color-text-muted, #9ca3af);
    pointer-events: none;
  }

  .location-input-wrapper input {
    width: 100%;
    padding: 0.5rem 0.75rem 0.5rem 2rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
  }

  .location-input-wrapper input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .location-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    margin-top: 0.25rem;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .location-result {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    border: none;
    background: transparent;
    color: var(--color-text, #374151);
    cursor: pointer;
  }

  .location-result:hover {
    background: rgba(234, 114, 110, 0.08);
  }

  .result-city {
    font-weight: 500;
  }

  .result-country {
    color: var(--color-text-muted, #9ca3af);
    font-size: 0.75rem;
  }
</style>
