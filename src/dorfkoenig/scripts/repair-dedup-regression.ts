#!/usr/bin/env node
/**
 * Repair the April 2026 canonical dedup regression.
 *
 * Default is dry-run:
 *   npm run repair:dedup
 *
 * Apply after deploying the schema/function fix:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *     npm run repair:dedup -- --apply
 */

const BAD_UNIT_ID = 'f3646f30-97ee-453e-a93f-912bfd72fd4c';
const PDF_JOB_IDS = [
  '9c11bc3c-3d95-4905-861b-15bc37675ab4',
  'af1d3d07-add6-4316-aca1-6eb2f32fbe08',
];

interface Args {
  apply: boolean;
  pdfs: boolean;
  web: boolean;
}

interface RestRow {
  [key: string]: unknown;
}

interface NewspaperJob extends RestRow {
  id: string;
  user_id: string;
  storage_path: string;
  label: string | null;
  publication_date: string | null;
}

interface Occurrence extends RestRow {
  id: string;
  unit_id: string;
  user_id: string;
  scout_id: string | null;
  source_url: string;
  normalized_source_url: string;
  source_domain: string;
  source_title: string | null;
  source_type: string;
  file_path: string | null;
  context_excerpt: string | null;
  entities: string[] | null;
  event_date: string | null;
  extracted_at: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, pdfs: true, web: true };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--pdfs-only') {
      args.pdfs = true;
      args.web = false;
    } else if (arg === '--web-only') {
      args.pdfs = false;
      args.web = true;
    }
  }
  return args;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(2);
  }
  return value;
}

const args = parseArgs(process.argv.slice(2));
const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = process.env.SUPABASE_ANON_KEY ?? serviceRoleKey;

function restHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...restHeaders(),
      ...init.headers,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function inList(values: string[]): string {
  return `(${values.join(',')})`;
}

async function deleteRows(table: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await rest(`${table}?id=in.${inList(chunk)}`, { method: 'DELETE' });
  }
}

async function getJobs(): Promise<NewspaperJob[]> {
  return rest<NewspaperJob[]>(
    `newspaper_jobs?select=id,user_id,storage_path,label,publication_date,status,units_created&` +
      `id=in.${inList(PDF_JOB_IDS)}`,
  );
}

async function getBadPdfOccurrences(jobs: NewspaperJob[]): Promise<Occurrence[]> {
  const paths = jobs.map((job) => job.storage_path).filter(Boolean);
  if (paths.length === 0) return [];
  return rest<Occurrence[]>(
    `unit_occurrences?select=*&unit_id=eq.${BAD_UNIT_ID}&file_path=in.${inList(paths)}&order=created_at.asc`,
  );
}

async function getBadWebOccurrences(): Promise<Occurrence[]> {
  return rest<Occurrence[]>(
    `unit_occurrences?select=*&unit_id=eq.${BAD_UNIT_ID}&source_type=eq.scout&order=created_at.asc&limit=500`,
  );
}

async function getAffectedScouts(occurrences: Occurrence[]): Promise<RestRow[]> {
  const ids = [...new Set(occurrences.map((row) => row.scout_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return [];
  return rest<RestRow[]>(
    `scouts?select=id,user_id,name,is_active,scout_type,url,last_run_at&id=in.${inList(ids)}`,
  );
}

async function recalculateUnitRollup(unitId: string): Promise<void> {
  const rows = await rest<Occurrence[]>(
    `unit_occurrences?select=*&unit_id=eq.${unitId}&order=extracted_at.asc`,
  );

  if (rows.length === 0) {
    const units = await rest<Array<{ id: string; statement: string }>>(
      `information_units?select=id,statement&id=eq.${unitId}`,
    );
    if (units[0]?.statement.startsWith('[DEBUG]')) {
      await rest(`information_units?id=eq.${unitId}`, { method: 'DELETE' });
      console.log(`Deleted empty debug canonical unit ${unitId}`);
    }
    return;
  }

  const entities = [...new Set(rows.flatMap((row) => row.entities ?? []).filter(Boolean))];
  const sources = new Set(rows.map((row) => row.normalized_source_url));
  const first = rows[0];
  const last = rows[rows.length - 1];

  await rest(`information_units?id=eq.${unitId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      first_seen_at: first.extracted_at,
      last_seen_at: last.extracted_at,
      occurrence_count: rows.length,
      source_count: sources.size,
      entities,
      event_date: first.event_date,
      context_excerpt: first.context_excerpt,
      source_url: first.source_url,
      source_domain: first.source_domain,
      source_title: first.source_title,
      source_type: first.source_type,
      file_path: first.file_path,
    }),
  });
}

async function resetAndReprocessPdfJobs(jobs: NewspaperJob[]): Promise<void> {
  for (const job of jobs) {
    console.log(`Resetting and reprocessing PDF job ${job.id} (${job.label ?? 'no label'})`);
    await rest(`newspaper_jobs?id=eq.${job.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status: 'processing',
        stage: 'parsing_pdf',
        chunks_total: 0,
        chunks_processed: 0,
        units_created: 0,
        units_merged: 0,
        skipped_items: [],
        error_message: null,
        extracted_units: null,
        completed_at: null,
      }),
    });

    const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-newspaper`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: job.id,
        storage_path: job.storage_path,
        user_id: job.user_id,
        publication_date: job.publication_date,
        label: job.label,
      }),
    });

    if (!processResponse.ok) {
      throw new Error(`process-newspaper failed for ${job.id}: ${processResponse.status} ${await processResponse.text()}`);
    }

    const staged = await rest<Array<{ id: string; extracted_units: Array<{ uid: string; date_confidence?: string | null }> | null }>>(
      `newspaper_jobs?select=id,extracted_units&id=eq.${job.id}`,
    );
    const selectedUids = staged[0]?.extracted_units
      ?.filter((unit) => unit.date_confidence !== 'unanchored')
      .map((unit) => unit.uid) ?? [];
    if (selectedUids.length === 0) {
      console.log(`Job ${job.id} staged no units; leaving status as returned by process-newspaper`);
      continue;
    }

    const finalizeResponse = await fetch(`${supabaseUrl}/functions/v1/manual-upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'x-user-id': job.user_id,
      },
      body: JSON.stringify({
        content_type: 'pdf_finalize',
        job_id: job.id,
        selected_uids: selectedUids,
      }),
    });

    if (!finalizeResponse.ok) {
      throw new Error(`manual-upload finalize failed for ${job.id}: ${finalizeResponse.status} ${await finalizeResponse.text()}`);
    }

    console.log(`Finalized ${job.id}: ${await finalizeResponse.text()}`);
  }
}

async function rerunScouts(scouts: RestRow[]): Promise<void> {
  for (const scout of scouts) {
    if (scout.is_active !== true) continue;
    console.log(`Rerunning scout ${scout.id} (${scout.name})`);
    const response = await fetch(`${supabaseUrl}/functions/v1/scouts/${scout.id}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'x-user-id': String(scout.user_id),
      },
      body: JSON.stringify({
        skip_notification: true,
        extract_units: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Scout rerun failed for ${scout.id}: ${response.status} ${await response.text()}`);
    }
    console.log(`Dispatched scout ${scout.id}: ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  console.log(args.apply ? 'APPLY mode' : 'DRY-RUN mode');
  console.log(`Bad canonical unit: ${BAD_UNIT_ID}`);

  const jobs = args.pdfs ? await getJobs() : [];
  const badPdfOccurrences = args.pdfs ? await getBadPdfOccurrences(jobs) : [];
  const badWebOccurrences = args.web ? await getBadWebOccurrences() : [];
  const affectedScouts = args.web ? await getAffectedScouts(badWebOccurrences) : [];

  console.log('\nAffected PDF jobs:');
  for (const job of jobs) {
    const count = badPdfOccurrences.filter((row) => row.file_path === job.storage_path).length;
    console.log(`  ${job.id} ${job.label ?? '(no label)'}: ${count} bad occurrence(s)`);
  }

  console.log('\nAffected web scouts:');
  const byScout = new Map<string, number>();
  for (const row of badWebOccurrences) {
    if (row.scout_id) byScout.set(row.scout_id, (byScout.get(row.scout_id) ?? 0) + 1);
  }
  for (const scout of affectedScouts) {
    console.log(`  ${scout.id} ${scout.name}: ${byScout.get(String(scout.id)) ?? 0} bad occurrence(s)`);
  }

  console.log(`\nBad PDF occurrences: ${badPdfOccurrences.length}`);
  console.log(`Bad web occurrences: ${badWebOccurrences.length}`);

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply after deploying the dedup migration and edge functions.');
    return;
  }

  await deleteRows('unit_occurrences', [...badPdfOccurrences, ...badWebOccurrences].map((row) => row.id));
  await recalculateUnitRollup(BAD_UNIT_ID);

  if (args.pdfs) await resetAndReprocessPdfJobs(jobs);
  if (args.web) await rerunScouts(affectedScouts);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
