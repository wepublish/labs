<script lang="ts">
  import { Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { FREQUENCY_OPTIONS } from '../../lib/constants';
  import type { Scout, ScoutCreateInput, ScoutUpdateInput } from '../../lib/types';

  interface Props {
    scout?: Scout;
    onsubmit?: () => void;
    oncancel?: () => void;
  }

  let { scout: initialScout, onsubmit, oncancel }: Props = $props();

  const isEdit = !!initialScout;

  // Form state
  let name = $state(initialScout?.name || '');
  let url = $state(initialScout?.url || '');
  let criteria = $state(initialScout?.criteria || '');
  let frequency = $state<'daily' | 'weekly' | 'monthly'>(initialScout?.frequency || 'daily');
  let notificationEmail = $state(initialScout?.notification_email || '');
  let locationCity = $state(initialScout?.location?.city || '');
  let isActive = $state(initialScout?.is_active ?? true);

  let saving = $state(false);
  let error = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    // Validation
    if (!name.trim()) {
      error = 'Name ist erforderlich';
      return;
    }
    if (!url.trim()) {
      error = 'URL ist erforderlich';
      return;
    }
    if (!criteria.trim()) {
      error = 'Kriterien sind erforderlich';
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      error = 'Ungültige URL';
      return;
    }

    saving = true;

    try {
      const location = locationCity.trim()
        ? { city: locationCity.trim(), country: 'Germany' }
        : null;

      if (isEdit && initialScout) {
        const updates: ScoutUpdateInput = {
          name: name.trim(),
          url: url.trim(),
          criteria: criteria.trim(),
          frequency,
          notification_email: notificationEmail.trim() || null,
          location,
          is_active: isActive,
        };
        await scouts.update(initialScout.id, updates);
      } else {
        const input: ScoutCreateInput = {
          name: name.trim(),
          url: url.trim(),
          criteria: criteria.trim(),
          frequency,
          notification_email: notificationEmail.trim() || null,
          location,
          is_active: isActive,
        };
        await scouts.create(input);
      }

      onsubmit?.();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="scout-form">
  <h2>{isEdit ? 'Scout bearbeiten' : 'Neuer Scout'}</h2>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="form-group">
    <label for="name">Name</label>
    <input
      id="name"
      type="text"
      bind:value={name}
      placeholder="z.B. Berlin News Monitor"
      required
    />
  </div>

  <div class="form-group">
    <label for="url">URL</label>
    <input
      id="url"
      type="url"
      bind:value={url}
      placeholder="https://example.com/news"
      required
    />
  </div>

  <div class="form-group">
    <label for="criteria">Kriterien</label>
    <textarea
      id="criteria"
      bind:value={criteria}
      placeholder="Welche Informationen sollen gefunden werden?"
      rows="3"
      required
    ></textarea>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="frequency">Häufigkeit</label>
      <select id="frequency" bind:value={frequency}>
        {#each FREQUENCY_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label for="location">Ort (optional)</label>
      <input
        id="location"
        type="text"
        bind:value={locationCity}
        placeholder="z.B. Berlin"
      />
    </div>
  </div>

  <div class="form-group">
    <label for="email">Benachrichtigungs-E-Mail (optional)</label>
    <input
      id="email"
      type="email"
      bind:value={notificationEmail}
      placeholder="email@example.com"
    />
  </div>

  <div class="form-group checkbox-group">
    <label>
      <input type="checkbox" bind:checked={isActive} />
      <span>Scout aktiv</span>
    </label>
  </div>

  <div class="form-actions">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel}>Abbrechen</Button>
    {/if}
    <Button type="submit" variant="primary" loading={saving}>
      {isEdit ? 'Speichern' : 'Erstellen'}
    </Button>
  </div>
</form>

<style>
  h2 {
    margin: 0 0 var(--spacing-lg);
  }

  .checkbox-group {
    flex-direction: row !important;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox-group input[type='checkbox'] {
    width: auto;
  }
</style>
