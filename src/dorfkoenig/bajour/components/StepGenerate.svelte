<script lang="ts">
  import { Button } from '@shared/components';
  import { bajourApi } from '../api';
  import ProgressIndicator from '../../components/ui/ProgressIndicator.svelte';
  import type { Village, BajourDraftGenerated } from '../types';

  // Village → Scout ID mapping
  const VILLAGE_SCOUT_IDS: Record<string, string> = {
    riehen: 'ba000000-0001-4000-a000-000000000001',
    bettingen: 'ba000000-0002-4000-a000-000000000002',
    allschwil: 'ba000000-0003-4000-a000-000000000003',
    binningen: 'ba000000-0004-4000-a000-000000000004',
    arlesheim: 'ba000000-0005-4000-a000-000000000005',
    muttenz: 'ba000000-0006-4000-a000-000000000006',
    muenchenstein: 'ba000000-0007-4000-a000-000000000007',
    reinach: 'ba000000-0008-4000-a000-000000000008',
    oberwil: 'ba000000-0009-4000-a000-000000000009',
    birsfelden: 'ba000000-000a-4000-a000-00000000000a',
  };

  interface Props {
    village: Village;
    selectionPrompt: string;
    generationPrompt: string;
    recencyDays: number;
    oncomplete: (draft: BajourDraftGenerated, unitIds: string[]) => void;
    onback: () => void;
  }

  let { village, selectionPrompt, generationPrompt, recencyDays, oncomplete, onback }: Props = $props();

  let phase = $state<'units' | 'draft'>('units');
  let loading = $state(true);
  let error = $state('');
  let progress = $state(0);

  // Progress simulation for two phases
  function simulateProgress(phaseType: 'units' | 'draft'): () => void {
    const baseOffset = phaseType === 'units' ? 0 : 45;
    const scale = phaseType === 'units' ? 0.45 : 0.55;
    progress = baseOffset;

    const steps = [
      { target: baseOffset + Math.round(30 * scale), delay: 300 },
      { target: baseOffset + Math.round(60 * scale), delay: 1500 },
      { target: baseOffset + Math.round(85 * scale), delay: 3000 },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const s of steps) {
      timers.push(setTimeout(() => { if (loading) progress = s.target; }, s.delay));
    }
    return () => timers.forEach(clearTimeout);
  }

  async function runPipeline() {
    const scoutId = VILLAGE_SCOUT_IDS[village.id];
    if (!scoutId) {
      error = `Kein Scout für ${village.name} konfiguriert.`;
      loading = false;
      return;
    }

    // Phase 1: Select units
    phase = 'units';
    loading = true;
    error = '';
    let stopProgress = simulateProgress('units');

    let unitIds: string[];
    try {
      const result = await bajourApi.selectUnits({
        village_id: village.id,
        scout_id: scoutId,
        recency_days: recencyDays,
        selection_prompt: selectionPrompt.trim() || undefined,
      });
      unitIds = result.selected_unit_ids;
      progress = 45;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
      stopProgress();
      return;
    }
    stopProgress();

    // Phase 2: Generate draft
    phase = 'draft';
    stopProgress = simulateProgress('draft');

    try {
      const draft = await bajourApi.generateDraft({
        village_id: village.id,
        village_name: village.name,
        unit_ids: unitIds,
        custom_system_prompt: generationPrompt.trim() || undefined,
      });
      progress = 100;
      loading = false;
      stopProgress();
      oncomplete(draft, unitIds);
    } catch (err) {
      error = (err as Error).message;
      loading = false;
      stopProgress();
    }
  }

  function handleRetry() {
    error = '';
    runPipeline();
  }

  // Auto-run on mount
  runPipeline();
</script>

<div class="step-generate">
  {#if error}
    <ProgressIndicator
      state="error"
      progress={progress}
      errorTitle={phase === 'units' ? 'Fehler bei der Auswahl' : 'Fehler bei der Generierung'}
      errorMessage={error}
    />
    <div class="step-actions">
      <Button variant="ghost" onclick={onback}>Zurück</Button>
      <Button onclick={handleRetry}>Erneut versuchen</Button>
    </div>
  {:else}
    <ProgressIndicator
      state="loading"
      progress={progress}
      message={phase === 'units' ? 'Informationen auswählen...' : 'Entwurf erstellen...'}
      hintText={phase === 'units' ? 'KI wählt relevante Informationen' : 'Der Text wird generiert'}
    />
  {/if}
</div>

<style>
  .step-generate {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }
</style>
