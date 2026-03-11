<script lang="ts">
  import { onDestroy } from 'svelte';
  import ProgressIndicator from '../ui/ProgressIndicator.svelte';

  interface Props {
    isGenerating: boolean;
    generationError: string | null;
    progressMessage: string;
    selectedCount: number;
  }

  let { isGenerating, generationError, progressMessage, selectedCount }: Props = $props();

  let progress = $state(0);
  let progressState = $state<'loading' | 'success' | 'error'>('loading');
  let interval: ReturnType<typeof setInterval> | null = null;

  function start(): void {
    stop();
    progress = 0;
    progressState = 'loading';
    interval = setInterval(() => {
      if (progress < 30) {
        progress += Math.random() * 8 + 2;
      } else if (progress < 60) {
        progress += Math.random() * 4 + 1;
      } else if (progress < 85) {
        progress += Math.random() * 2 + 0.5;
      } else if (progress < 90) {
        progress += Math.random() * 0.5;
      }
      progress = Math.min(progress, 90);
    }, 500);
  }

  function finish(success: boolean): void {
    stop();
    if (success) {
      progress = 100;
      progressState = 'success';
    } else {
      progressState = 'error';
    }
  }

  function stop(): void {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  let wasGenerating = false;

  $effect(() => {
    if (isGenerating && !wasGenerating) {
      start();
    } else if (!isGenerating && wasGenerating) {
      finish(!generationError);
    }
    wasGenerating = isGenerating;
  });

  onDestroy(stop);
</script>

<div class="progress-container">
  <ProgressIndicator
    progress={Math.round(progress)}
    message={progressMessage}
    state={progressState}
    hintText={selectedCount !== 1
      ? `${selectedCount} Quellen werden analysiert...`
      : '1 Quelle wird analysiert...'}
  />
</div>

<style>
  .progress-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 300px;
    padding: 2rem 2.5rem;
    width: 100%;
    box-sizing: border-box;
  }
</style>
