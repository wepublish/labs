import { createServiceClient } from './supabase-client.ts';

export type NewspaperJobStatus =
  | 'processing'
  | 'review_pending'
  | 'storing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type NewspaperJobStage =
  | 'parsing_pdf'
  | 'chunking'
  | 'extracting'
  | 'storing';

export interface NewspaperJobUpdate {
  status?: NewspaperJobStatus;
  stage?: NewspaperJobStage | null;
  error_message?: string | null;
  chunks_total?: number;
  chunks_processed?: number;
  units_created?: number;
  units_merged?: number;
  skipped_items?: string[];
  extracted_units?: unknown[] | null;
  completed_at?: string | null;
  last_heartbeat_at?: string;
  processing_attempts?: number;
}

export function clampProcessed(processed: number, total: number): number {
  if (!Number.isFinite(processed) || processed < 0) return 0;
  if (!Number.isFinite(total) || total <= 0) return Math.floor(processed);
  return Math.min(Math.floor(processed), Math.floor(total));
}

export function normalizeJobUpdate(updates: NewspaperJobUpdate): NewspaperJobUpdate {
  const now = new Date().toISOString();
  const next: NewspaperJobUpdate = {
    ...updates,
    last_heartbeat_at: updates.last_heartbeat_at ?? now,
  };

  if (next.chunks_processed !== undefined && next.chunks_total !== undefined) {
    next.chunks_processed = clampProcessed(next.chunks_processed, next.chunks_total);
  }

  if (next.status === 'review_pending') {
    next.stage = null;
    if (next.chunks_total !== undefined) next.chunks_processed = next.chunks_total;
  }

  if (next.status === 'completed' || next.status === 'failed' || next.status === 'cancelled') {
    next.stage = null;
    next.completed_at = next.completed_at ?? now;
  }

  return next;
}

export async function updateNewspaperJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  updates: NewspaperJobUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_jobs')
    .update(normalizeJobUpdate(updates))
    .eq('id', jobId);

  if (error) {
    console.error(`[newspaper-job-state] Failed to update job ${jobId}:`, error);
  }
}

export async function incrementProcessingAttempt(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('newspaper_jobs')
    .select('processing_attempts')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    console.error(`[newspaper-job-state] Failed to read attempts for ${jobId}:`, error);
    return;
  }

  const attempts = typeof data?.processing_attempts === 'number'
    ? data.processing_attempts + 1
    : 1;
  await updateNewspaperJob(supabase, jobId, {
    status: 'processing',
    processing_attempts: attempts,
  });
}
