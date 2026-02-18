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
  let criteriaMode = $state<'any' | 'specific'>(initialScout?.criteria ? 'specific' : 'any');
  let frequency = $state<'daily' | 'weekly' | 'monthly'>(initialScout?.frequency || 'daily');
  let notificationEmail = $state(initialScout?.notification_email || '');
  let locationCity = $state(initialScout?.location?.city || '');
  let topic = $state('');
  let isActive = $state(initialScout?.is_active ?? true);
  let extractBaseline = $state(false);

  let saving = $state(false);
  let runningInitial = $state(false);
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
      const location = locationCity.trim()
        ? { city: locationCity.trim(), country: 'Germany' }
        : null;

      const effectiveCriteria = criteriaMode === 'any' ? '' : criteria.trim();

      if (isEdit && initialScout) {
        const updates: ScoutUpdateInput = {
          name: name.trim(),
          url: url.trim(),
          criteria: effectiveCriteria,
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
          criteria: effectiveCriteria,
          frequency,
          notification_email: notificationEmail.trim() || null,
          location,
          is_active: isActive,
        };
        const newScout = await scouts.create(input);

        // Trigger initial run
        runningInitial = true;
        try {
          await scouts.run(newScout.id, { extract_units: extractBaseline });
        } catch (runErr) {
          console.warn('Initial run failed (scout was created):', runErr);
        } finally {
          runningInitial = false;
        }
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
    <input id="name" type="text" bind:value={name} placeholder="z.B. Berlin News Monitor" required />
  </div>

  <div class="form-group">
    <label for="url">URL</label>
    <input id="url" type="url" bind:value={url} placeholder="https://example.com/news" required />
  </div>

  <!-- Criteria Mode Toggle -->
  <div class="form-group">
    <label>Benachrichtigung bei</label>
    <div class="criteria-toggle-wrapper">
      <div class="criteria-toggle">
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'any'}
          onclick={() => { criteriaMode = 'any'; }}
        >
          🔔 Jede Änderung
        </button>
        <button
          type="button"
          class="criteria-track"
          class:specific={criteriaMode === 'specific'}
          onclick={() => { criteriaMode = criteriaMode === 'any' ? 'specific' : 'any'; }}
        >
          <span class="criteria-thumb"></span>
        </button>
        <button
          type="button"
          class="criteria-label"
          class:active={criteriaMode === 'specific'}
          onclick={() => { criteriaMode = 'specific'; }}
        >
          🎯 Bestimmte Kriterien
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
    <div class="form-group">
      <label for="location">Ort (optional)</label>
      <input id="location" type="text" bind:value={locationCity} placeholder="z.B. Berlin" />
    </div>
  </div>

  <div class="form-group">
    <label for="topic">Thema (optional)</label>
    <input id="topic" type="text" bind:value={topic} placeholder="z.B. Stadtentwicklung" />
  </div>

  <div class="form-group">
    <label for="email">Benachrichtigungs-E-Mail (optional)</label>
    <input id="email" type="email" bind:value={notificationEmail} placeholder="email@example.com" />
  </div>

  <div class="form-group checkbox-group">
    <label>
      <input type="checkbox" bind:checked={isActive} />
      <span>Scout aktiv</span>
    </label>
  </div>

  {#if !isEdit}
    <!-- Extract Baseline Toggle -->
    <div class="form-group">
      <div class="criteria-toggle-wrapper">
        <div class="criteria-toggle">
          <button
            type="button"
            class="criteria-track"
            class:specific={extractBaseline}
            onclick={() => { extractBaseline = !extractBaseline; }}
          >
            <span class="criteria-thumb"></span>
          </button>
          <button
            type="button"
            class="criteria-label"
            class:active={extractBaseline}
            onclick={() => { extractBaseline = !extractBaseline; }}
          >
            Aktuelle Seiteninhalte importieren
          </button>
        </div>
      </div>
      <p class="hint-text">
        Wenn aktiviert, werden vorhandene Inhalte der Seite beim ersten Lauf als Informationseinheiten gespeichert.
      </p>
    </div>
  {/if}

  <div class="form-actions">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel}>Abbrechen</Button>
    {/if}
    <Button type="submit" variant="primary" loading={saving || runningInitial}>
      {#if runningInitial}
        Erster Lauf...
      {:else if saving}
        Speichern...
      {:else}
        {isEdit ? 'Speichern' : 'Erstellen & Ausführen'}
      {/if}
    </Button>
  </div>
</form>

<style>
  h2 { margin: 0 0 var(--spacing-lg); }

  .checkbox-group { flex-direction: row !important; }
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }
  .checkbox-group input[type='checkbox'] { width: auto; }

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

  .hint-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin-top: 0.375rem;
    line-height: 1.4;
  }
</style>
