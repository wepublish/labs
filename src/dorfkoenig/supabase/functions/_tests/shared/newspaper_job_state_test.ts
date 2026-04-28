import {
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  clampProcessed,
  normalizeJobUpdate,
} from '../../_shared/newspaper-job-state.ts';

Deno.test('clampProcessed keeps progress monotonic within total bounds', () => {
  assertEquals(clampProcessed(3, 9), 3);
  assertEquals(clampProcessed(12, 9), 9);
  assertEquals(clampProcessed(-1, 9), 0);
});

Deno.test('normalizeJobUpdate clears stage on review_pending and completes progress', () => {
  const update = normalizeJobUpdate({
    status: 'review_pending',
    stage: 'extracting',
    chunks_total: 9,
    chunks_processed: 7,
  });

  assertEquals(update.stage, null);
  assertEquals(update.chunks_processed, 9);
  assertEquals(typeof update.last_heartbeat_at, 'string');
});

Deno.test('normalizeJobUpdate clears stage and timestamps terminal statuses', () => {
  const update = normalizeJobUpdate({
    status: 'completed',
    stage: 'extracting',
    chunks_total: 8,
    chunks_processed: 10,
  });

  assertEquals(update.stage, null);
  assertEquals(update.chunks_processed, 8);
  assertEquals(typeof update.completed_at, 'string');
});

Deno.test('normalizeJobUpdate supports the PDF review lifecycle', () => {
  const processing = normalizeJobUpdate({
    status: 'processing',
    stage: 'extracting',
    chunks_total: 4,
    chunks_processed: 2,
  });
  assertEquals(processing.stage, 'extracting');
  assertEquals(processing.chunks_processed, 2);

  const review = normalizeJobUpdate({
    status: 'review_pending',
    stage: 'extracting',
    chunks_total: 4,
    chunks_processed: 3,
    extracted_units: [{ uid: 'u-1', statement: 'Prüfbare Einheit.' }],
  });
  assertEquals(review.stage, null);
  assertEquals(review.chunks_processed, 4);
  assertEquals(review.extracted_units, [{ uid: 'u-1', statement: 'Prüfbare Einheit.' }]);

  const storing = normalizeJobUpdate({
    status: 'storing',
    stage: 'storing',
    chunks_total: 4,
    chunks_processed: 4,
  });
  assertEquals(storing.stage, 'storing');
  assertEquals(storing.chunks_processed, 4);

  const completed = normalizeJobUpdate({
    status: 'completed',
    stage: 'storing',
    chunks_total: 4,
    chunks_processed: 4,
    units_created: 2,
  });
  assertEquals(completed.stage, null);
  assertEquals(completed.units_created, 2);
  assertEquals(typeof completed.completed_at, 'string');
});

Deno.test('normalizeJobUpdate makes trigger failures visible and terminal', () => {
  const failed = normalizeJobUpdate({
    status: 'failed',
    stage: 'extracting',
    error_message: 'process-newspaper trigger failed: 502 Bad Gateway',
  });

  assertEquals(failed.stage, null);
  assertEquals(failed.error_message, 'process-newspaper trigger failed: 502 Bad Gateway');
  assertEquals(typeof failed.completed_at, 'string');
});
