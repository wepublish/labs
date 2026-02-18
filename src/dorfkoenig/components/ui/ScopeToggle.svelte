<script lang="ts">
  import ModeToggle from './ModeToggle.svelte';
  import LocationAutocomplete from './LocationAutocomplete.svelte';
  import type { Location } from '../../lib/types';

  interface Props {
    mode: 'location' | 'topic';
    location: Location | null;
    topic: string;
    existingTopics?: string[];
    onmodechange: (mode: 'location' | 'topic') => void;
    onlocationchange: (loc: Location | null) => void;
    ontopicchange: (topic: string) => void;
  }

  let {
    mode,
    location: loc,
    topic,
    existingTopics = [],
    onmodechange,
    onlocationchange,
    ontopicchange,
  }: Props = $props();

  // Parse comma-separated topic string into array
  let topicChips = $derived(
    topic
      ? topic.split(',').map(t => t.trim()).filter(Boolean)
      : []
  );

  let topicInput = $state('');
  let showSuggestions = $state(false);

  let filteredSuggestions = $derived(
    existingTopics
      .filter(t =>
        t.toLowerCase().includes(topicInput.toLowerCase()) &&
        !topicChips.some(c => c.toLowerCase() === t.toLowerCase())
      )
      .slice(0, 5)
  );

  function addTopic(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (topicChips.length >= 3) return;
    if (topicChips.some(c => c.toLowerCase() === trimmed.toLowerCase())) return;

    const newChips = [...topicChips, trimmed];
    ontopicchange(newChips.join(', '));
    topicInput = '';
    showSuggestions = false;
  }

  function removeTopicAt(index: number) {
    const newChips = topicChips.filter((_, i) => i !== index);
    ontopicchange(newChips.join(', '));
  }

  function handleTopicKeydown(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === 'Tab' || e.key === ',') && topicInput.trim()) {
      e.preventDefault();
      addTopic(topicInput);
    } else if (e.key === 'Backspace' && !topicInput && topicChips.length > 0) {
      removeTopicAt(topicChips.length - 1);
    } else if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }

  function handleTopicInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    if (value.includes(',')) {
      const parts = value.split(',');
      for (const part of parts.slice(0, -1)) {
        addTopic(part);
      }
      topicInput = parts[parts.length - 1];
    } else {
      topicInput = value;
    }
    showSuggestions = topicInput.trim().length > 0;
  }

  function handleSuggestionClick(suggestion: string) {
    addTopic(suggestion);
  }

  function handleFocus() {
    if (topicInput.trim().length > 0) {
      showSuggestions = true;
    }
  }

  function handleBlur() {
    setTimeout(() => {
      showSuggestions = false;
    }, 150);
  }

  function handleLocationSelect(result: { city: string; country: string; latitude?: number; longitude?: number }) {
    onlocationchange({
      city: result.city,
      country: result.country,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  }
</script>

<div class="scope-toggle">
  <div class="scope-header">
    <ModeToggle {mode} compact={false} onchange={onmodechange} />
  </div>

  {#if mode === 'location'}
    <LocationAutocomplete
      value={loc?.city || ''}
      onselect={handleLocationSelect}
      placeholder="z.B. Berlin"
    />
  {:else}
    <div class="scope-input topic-input-container">
      <div class="topic-field">
        {#each topicChips as chip, i}
          <span class="topic-chip">
            {chip}
            <button
              type="button"
              class="chip-remove"
              onclick={() => removeTopicAt(i)}
              aria-label="Thema entfernen: {chip}"
            >&times;</button>
          </span>
        {/each}
        {#if topicChips.length < 3}
          <input
            class="topic-inline-input"
            type="text"
            value={topicInput}
            oninput={handleTopicInput}
            onkeydown={handleTopicKeydown}
            onfocus={handleFocus}
            onblur={handleBlur}
            placeholder={topicChips.length === 0 ? 'z.B. Stadtentwicklung' : 'Weiteres Thema...'}
          />
        {/if}
      </div>
      <span class="topic-hint">{topicChips.length}/3</span>
      {#if showSuggestions && filteredSuggestions.length > 0}
        <div class="suggestions">
          {#each filteredSuggestions as suggestion}
            <button
              type="button"
              class="suggestion-item"
              onmousedown={() => handleSuggestionClick(suggestion)}
            >{suggestion}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .scope-toggle {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .scope-header {
    display: flex;
    align-items: center;
  }

  .topic-input-container {
    position: relative;
  }

  .topic-field {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    min-height: 2.25rem;
  }

  .topic-field:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .topic-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    background: rgba(234, 114, 110, 0.12);
    color: var(--color-primary);
    border-radius: 9999px;
    white-space: nowrap;
  }

  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border: none;
    background: transparent;
    color: var(--color-primary);
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1;
    padding: 0;
    border-radius: 9999px;
    transition: background 0.15s ease;
  }

  .chip-remove:hover {
    background: rgba(234, 114, 110, 0.2);
  }

  .topic-inline-input {
    flex: 1;
    min-width: 120px;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--color-text, #111827);
    outline: none;
    padding: 0.125rem 0;
  }

  .topic-hint {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.6875rem;
    color: var(--color-text-muted, #9ca3af);
    pointer-events: none;
  }

  .suggestions {
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

  .suggestion-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    border: none;
    background: transparent;
    color: var(--color-text, #374151);
    cursor: pointer;
  }

  .suggestion-item:hover {
    background: rgba(234, 114, 110, 0.08);
    color: var(--color-primary);
  }
</style>
