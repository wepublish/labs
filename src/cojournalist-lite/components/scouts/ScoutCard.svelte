<script lang="ts">
  import { Card, Button } from '@shared/components';
  import { scouts } from '../../stores/scouts';
  import { formatDate, FREQUENCY_OPTIONS } from '../../lib/constants';
  import type { Scout } from '../../lib/types';

  interface Props {
    scout: Scout;
  }

  let { scout }: Props = $props();

  let running = $state(false);
  let testing = $state(false);

  async function handleRun() {
    running = true;
    try {
      await scouts.run(scout.id);
      // Refresh scouts list to get updated last_run_at
      await scouts.load();
    } catch (error) {
      console.error('Run failed:', error);
    } finally {
      running = false;
    }
  }

  async function handleTest() {
    testing = true;
    try {
      const result = await scouts.test(scout.id);
      // TODO: Show result in modal
      console.log('Test result:', result);
      alert(
        result.criteria_analysis
          ? `Kriterien erfüllt: ${result.criteria_analysis.matches ? 'Ja' : 'Nein'}\n\n${result.criteria_analysis.summary}`
          : 'Test fehlgeschlagen'
      );
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      testing = false;
    }
  }

  function getFrequencyLabel(value: string): string {
    return FREQUENCY_OPTIONS.find((f) => f.value === value)?.label || value;
  }
</script>

<Card shadow="sm" padding="md">
  <div class="scout-card">
    <div class="scout-card-header">
      <h3>{scout.name}</h3>
      <span class="status-badge" class:active={scout.is_active} class:inactive={!scout.is_active}>
        {scout.is_active ? 'Aktiv' : 'Inaktiv'}
      </span>
    </div>

    <p class="scout-url">{scout.url}</p>

    <div class="scout-meta">
      {#if scout.location?.city}
        <span>{scout.location.city}</span>
      {/if}
      <span>{getFrequencyLabel(scout.frequency)}</span>
      {#if scout.consecutive_failures > 0}
        <span class="failures">{scout.consecutive_failures} Fehler</span>
      {/if}
    </div>

    <p class="scout-criteria">{scout.criteria}</p>

    <div class="scout-footer">
      <span class="last-run">
        Letzter Lauf: {formatDate(scout.last_run_at)}
      </span>
      <div class="scout-actions">
        <Button size="sm" variant="ghost" onclick={handleTest} loading={testing}>
          Testen
        </Button>
        <Button size="sm" onclick={handleRun} loading={running}>
          Ausführen
        </Button>
        <Button size="sm" variant="ghost" onclick={() => (location.hash = `#/scout/${scout.id}`)}>
          Bearbeiten
        </Button>
      </div>
    </div>
  </div>
</Card>

<style>
  .failures {
    background: rgba(239, 68, 68, 0.1) !important;
    color: var(--color-danger) !important;
  }
</style>
