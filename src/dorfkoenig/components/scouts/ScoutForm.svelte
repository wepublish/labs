<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { FREQUENCY_OPTIONS } from '../../lib/constants';
  import ScopeToggle from '../ui/ScopeToggle.svelte';
  import type { Scout, ScoutUpdateInput, Location } from '../../lib/types';

  interface Props {
    scout: Scout;
    onsubmit?: () => void;
    oncancel?: () => void;
  }

  let { scout: initialScout, onsubmit, oncancel }: Props = $props();

  // Capture initial values once (intentionally non-reactive for form fields)
  const init = untrack(() => initialScout);

  // Form state
  let name = $state(init.name || '');
  let url = $state(init.url || '');
  let criteria = $state(init.criteria || '');
  let criteriaMode = $state<'any' | 'specific'>(init.criteria ? 'specific' : 'any');
  let frequency = $state<'daily' | 'weekly' | 'biweekly' | 'monthly'>(init.frequency || 'daily');
  let location = $state<Location | null>(init.location || null);
  let topic = $state(init.topic || '');

  // Derive existing topics from all scouts for autocomplete suggestions
  let existingTopics = $derived(
    [...new Set(
      $scouts.scouts
        .filter(s => s.topic)
        .flatMap(s => s.topic!.split(',').map(t => t.trim()))
        .filter(Boolean)
    )].sort()
  );

  let saving = $state(false);
  let error = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    if (!name.trim()) { error = 'Name ist erforderlich'; return; }
    if (!url.trim()) { error = 'URL ist erforderlich'; return; }

    try { new URL(url); } catch { error = 'Ungültige URL'; return; }

    if (criteriaMode === 'specific' && !criteria.trim()) {
      error = 'Kriterien sind erforderlich im spezifischen Modus';
      return;
    }

    saving = true;

    try {
      const effectiveLocation = location;
      const effectiveTopic = topic.trim() || null;
      const effectiveCriteria = criteriaMode === 'any' ? '' : criteria.trim();

      const updates: ScoutUpdateInput = {
        name: name.trim(),
        url: url.trim(),
        criteria: effectiveCriteria,
        frequency,
        location: effectiveLocation,
        topic: effectiveTopic,
      };
      await scouts.update(init.id, updates);

      onsubmit?.();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="scout-form">
  <h2>Scout bearbeiten</h2>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="form-group">
    <label for="name">Name</label>
    <input id="name" type="text" bind:value={name} placeholder="z.B. Berlin News Monitor" required />
  </div>

  <div class="form-group">
    <label for="url">URL</label>
    <input id="url" type="url" bind:value={url} placeholder="https://example.com/news" required />
  </div>

  <!-- Criteria Mode Toggle -->
  <div class="form-group" role="group" aria-label="Benachrichtigung bei">
    <span class="form-label">Benachrichtigung bei</span>
    <div class="criteria-toggle-wrapper">
      <div class="criteria-toggle">
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'any'}
          onclick={() => { criteriaMode = 'any'; }}
        >
          Jede Änderung
        </button>
        <button
          type="button"
          class="criteria-track"
          class:specific={criteriaMode === 'specific'}
          onclick={() => { criteriaMode = criteriaMode === 'any' ? 'specific' : 'any'; }}
          aria-label="Kriterienmodus umschalten"
        >
          <span class="criteria-thumb"></span>
        </button>
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'specific'}
          onclick={() => { criteriaMode = 'specific'; }}
        >
          Bestimmte Kriterien
        </button>
      </div>
    </div>
  </div>

  {#if criteriaMode === 'specific'}
    <div class="form-group">
      <label for="criteria">Kriterien</label>
      <textarea
        id="criteria"
        bind:value={criteria}
        placeholder="Welche Informationen sollen gefunden werden?"
        rows="3"
      ></textarea>
    </div>
  {/if}

  <div class="form-row">
    <div class="form-group">
      <label for="frequency">Häufigkeit</label>
      <select id="frequency" bind:value={frequency}>
        {#each FREQUENCY_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
    <div class="form-group" role="group" aria-label="Ort und/oder Thema">
      <span class="form-label">Ort und/oder Thema (optional)</span>
      <ScopeToggle
        {location}
        {topic}
        {existingTopics}
        onlocationchange={(loc) => { location = loc; }}
        ontopicchange={(t) => { topic = t; }}
      />
    </div>
  </div>

  <div class="form-actions">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel}>Abbrechen</Button>
    {/if}
    <Button type="submit" variant="primary" loading={saving}>
      {#if saving}
        Speichern...
      {:else}
        Speichern
      {/if}
    </Button>
  </div>
</form>

<style>
  h2 { margin: 0 0 var(--spacing-lg); }

  .form-label {
    display: block;
    font-size: inherit;
    font-weight: 500;
  }

  .criteria-toggle-wrapper {
    display: flex;
    justify-content: flex-start;
  }

  .criteria-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .criteria-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    transition: color 0.2s ease;
    white-space: nowrap;
  }

  .criteria-label.active {
    color: var(--color-primary, #4f46e5);
  }

  .criteria-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: #e0e7ff;
    border: 1px solid #c7d2fe;
    border-radius: 9999px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.2s ease;
  }

  .criteria-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: var(--color-primary, #4f46e5);
    border-radius: 9999px;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .criteria-track.specific .criteria-thumb {
    transform: translateX(16px);
  }
</style>
