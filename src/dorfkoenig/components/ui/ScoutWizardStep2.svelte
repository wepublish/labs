<script lang="ts">
  import { Button } from '@shared/components';
  import { FREQUENCY_OPTIONS_EXTENDED, DAY_OF_WEEK_OPTIONS } from '../../lib/constants';

  interface Props {
    name: string;
    frequency: string;
    dayOfWeek: string;
    timeHour: string;
    timeMinute: string;
    extractOnFirstPass: boolean;
    submitting: boolean;
    submitError: string;
    onnamechange: (name: string) => void;
    onfrequencychange: (frequency: string) => void;
    ondayofweekchange: (day: string) => void;
    ontimehourchange: (hour: string) => void;
    ontimeminutechange: (minute: string) => void;
    onextractonfirstpasschange: (enabled: boolean) => void;
    onback: () => void;
    onsubmit: () => void;
  }

  let {
    name,
    frequency,
    dayOfWeek,
    timeHour,
    timeMinute,
    extractOnFirstPass,
    submitting,
    submitError,
    onnamechange,
    onfrequencychange,
    ondayofweekchange,
    ontimehourchange,
    ontimeminutechange,
    onextractonfirstpasschange,
    onback,
    onsubmit,
  }: Props = $props();

  let showDayPicker = $derived(frequency === 'weekly' || frequency === 'biweekly');

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minuteOptions = ['00', '15', '30', '45'];
</script>

<div class="modal-body">
  {#if submitError}
    <div class="error-message">{submitError}</div>
  {/if}

  <!-- Name -->
  <div class="form-group">
    <label for="scout-name">Name</label>
    <input
      id="scout-name"
      type="text"
      value={name}
      oninput={(e) => onnamechange(e.currentTarget.value)}
      placeholder="z.B. Berlin News Monitor"
      aria-required="true"
    />
  </div>

  <!-- Frequency -->
  <div class="form-group">
    <label for="scout-frequency">Häufigkeit</label>
    <select id="scout-frequency" value={frequency} onchange={(e) => onfrequencychange(e.currentTarget.value)}>
      {#each FREQUENCY_OPTIONS_EXTENDED as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

  <!-- Day of week (conditional) -->
  {#if showDayPicker}
    <div class="form-group">
      <label for="scout-day">Wochentag</label>
      <select id="scout-day" value={dayOfWeek} onchange={(e) => ondayofweekchange(e.currentTarget.value)}>
        {#each DAY_OF_WEEK_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Time -->
  <div class="form-group">
    <span class="form-label">Uhrzeit</span>
    <div class="time-selects">
      <select value={timeHour} onchange={(e) => ontimehourchange(e.currentTarget.value)} aria-label="Stunde">
        {#each hourOptions as h}
          <option value={h}>{h}</option>
        {/each}
      </select>
      <span class="time-separator">:</span>
      <select value={timeMinute} onchange={(e) => ontimeminutechange(e.currentTarget.value)} aria-label="Minute">
        {#each minuteOptions as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="extraction-option">
    <label class="toggle-row">
      <input
        type="checkbox"
        checked={extractOnFirstPass}
        onchange={(e) => onextractonfirstpasschange(e.currentTarget.checked)}
      />
      <span class="toggle-track" aria-hidden="true">
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-copy">
        <span class="toggle-title">Beim Erstellen Informationen extrahieren</span>
        <span class="toggle-hint">
          Startet nach dem Speichern einen ersten Lauf ohne Benachrichtigung und speichert passende Informationseinheiten.
        </span>
      </span>
    </label>
  </div>
</div>

<div class="modal-footer">
  <Button variant="ghost" onclick={onback}>Zurück</Button>
  <Button onclick={onsubmit} loading={submitting}>Scout erstellen</Button>
</div>

<style>
  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label,
  .form-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-group input[type="text"],
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .error-message {
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
  }

  .time-selects {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .time-selects select {
    width: auto;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
  }

  .time-selects select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .time-separator {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .extraction-option {
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--color-background, #f9fafb);
  }

  .toggle-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: start;
    cursor: pointer;
  }

  .toggle-row input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .toggle-track {
    position: relative;
    width: 2.25rem;
    height: 1.25rem;
    margin-top: 0.125rem;
    border: 1px solid #c7d2fe;
    border-radius: 999px;
    background: #e5e7eb;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .toggle-thumb {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 999px;
    background: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
    transition: transform 0.2s ease;
  }

  .toggle-row input:checked + .toggle-track {
    border-color: var(--color-primary);
    background: var(--color-primary);
  }

  .toggle-row input:checked + .toggle-track .toggle-thumb {
    transform: translateX(1rem);
  }

  .toggle-row input:focus-visible + .toggle-track {
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.18);
  }

  .toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    min-width: 0;
  }

  .toggle-title {
    font-size: 0.8125rem;
    font-weight: 650;
    color: var(--color-text);
  }

  .toggle-hint {
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--color-text-muted);
  }
</style>
