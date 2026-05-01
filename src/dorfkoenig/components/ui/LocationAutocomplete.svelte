<script lang="ts">
  import { MapPin } from 'lucide-svelte';
  import gemeindenData from '../../lib/gemeinden.json';
  import { getActivePilotVillageIds, pilotVillages } from '../../lib/villages';

  interface Gemeinde {
    id: string;
    name: string;
    canton: string;
    latitude: number;
    longitude: number;
  }

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
    /** When true, only pilot villages are shown (pilot allow-list from
     *  `bajour_pilot_villages_list`). Used by the manual-upload modal to
     *  enforce the pilot boundary. Scout creation leaves this off. */
    restrictToPilot?: boolean;
  }

  let { value, onselect, placeholder = 'z.B. Arlesheim', restrictToPilot = false }: Props = $props();

  const gemeinden = gemeindenData as Gemeinde[];

  let inputValue = $state('');
  let results = $state<Gemeinde[]>([]);
  let showDropdown = $state(false);

  // Sync external value changes
  $effect(() => {
    inputValue = value;
  });

  // Pilot scoping (opt-in via restrictToPilot): manual upload must not let
  // editors assign units to villages outside the active pilot.
  let allowedGemeinden = $derived.by(() => {
    if (!restrictToPilot) return gemeinden;
    const pilot = getActivePilotVillageIds($pilotVillages);
    return gemeinden.filter((g) => pilot.includes(g.id));
  });

  function updateResults(query: string) {
    const pool = allowedGemeinden;
    if (!query.trim()) {
      results = pool;
    } else {
      const lower = query.trim().toLowerCase();
      results = pool.filter(
        (g) => g.name.toLowerCase().startsWith(lower)
      );
    }
    showDropdown = results.length > 0;
  }

  function handleInput(e: Event) {
    const query = (e.target as HTMLInputElement).value;
    inputValue = query;
    updateResults(query);
  }

  function handleFocus() {
    updateResults(inputValue);
  }

  function handleSelect(g: Gemeinde) {
    inputValue = g.name;
    showDropdown = false;
    results = [];

    onselect({
      city: g.name,
      country: 'Schweiz',
      latitude: g.latitude,
      longitude: g.longitude,
    });
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
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      {placeholder}
    />
  </div>
  {#if showDropdown && results.length > 0}
    <div class="location-dropdown">
      {#each results as g}
        <button
          type="button"
          class="location-result"
          onmousedown={() => handleSelect(g)}
        >
          <span class="result-city">{g.name}</span>
          <span class="result-canton">{g.canton}</span>
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

  .result-canton {
    color: var(--color-text-muted, #9ca3af);
    font-size: 0.75rem;
  }
</style>
