#!/usr/bin/env node
/**
 * Backfill manual newspaper PDF uploads that predate newspaper_jobs.source_url.
 *
 * Dry-run by default:
 *   npm run backfill:manual-pdf-sources
 *
 * Apply:
 *   npm run backfill:manual-pdf-sources -- --apply
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeQualityScore, type Sensitivity } from '../supabase/functions/_shared/quality-scoring.ts';

interface UnitRow {
  id: string;
  statement: string;
  source_title: string | null;
  source_url: string;
  source_domain: string | null;
  article_url: string | null;
  is_listing_page: boolean | null;
  event_date: string | null;
  publication_date: string | null;
  village_confidence: string | null;
  sensitivity: string | null;
  file_path: string | null;
}

const SOURCE_MAP: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /wochenblatt|allschwiler wochenblatt/i, url: 'https://www.wochenblatt.ch/' },
  { pattern: /\bbibo\b|birsigtal[-\s]?bote/i, url: 'https://bibo.ch/' },
  { pattern: /muttenzer|prattler/i, url: 'https://www.muttenzeranzeiger.ch/' },
  { pattern: /^bz\b|basellandschaftliche/i, url: 'https://www.bzbasel.ch/' },
  { pattern: /^baz\b|basler zeitung/i, url: 'https://www.baz.ch/' },
];

function sourceUrlForTitle(title: string | null): string | null {
  if (!title) return null;
  return SOURCE_MAP.find((entry) => entry.pattern.test(title))?.url ?? null;
}

function normalizeSourceUrl(url: string): string {
  if (url.startsWith('manual://')) return url.trim().toLowerCase();
  return url.trim().toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
}

function sourceDomainFromUrl(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase
    .from('information_units')
    .select('id, statement, source_title, source_url, source_domain, article_url, is_listing_page, event_date, publication_date, village_confidence, sensitivity, file_path')
    .eq('source_type', 'manual_pdf')
    .eq('source_url', 'manual://pdf')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const rows = (data ?? []) as UnitRow[];
  let mapped = 0;
  let unknown = 0;
  const unknownLabels = new Set<string>();

  for (const row of rows) {
    const sourceUrl = sourceUrlForTitle(row.source_title);
    if (!sourceUrl) {
      unknown += 1;
      unknownLabels.add(row.source_title ?? '(ohne Quellenangabe)');
      continue;
    }

    mapped += 1;
    const sourceDomain = sourceDomainFromUrl(sourceUrl);
    const qualityScore = computeQualityScore({
      statement: row.statement,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      article_url: sourceUrl,
      is_listing_page: false,
      event_date: row.event_date,
      publication_date: row.publication_date,
      village_confidence: asVillageConfidence(row.village_confidence),
      sensitivity: asSensitivity(row.sensitivity),
    });

    if (!apply) {
      console.log(`[dry-run] ${row.id} ${row.source_title} -> ${sourceUrl} quality=${qualityScore}`);
      continue;
    }

    const { error: unitErr } = await supabase
      .from('information_units')
      .update({
        source_url: sourceUrl,
        source_domain: sourceDomain,
        article_url: sourceUrl,
        is_listing_page: false,
        quality_score: qualityScore,
      })
      .eq('id', row.id);
    if (unitErr) throw unitErr;

    const { error: occurrenceErr } = await supabase
      .from('unit_occurrences')
      .update({
        source_url: sourceUrl,
        normalized_source_url: normalizeSourceUrl(sourceUrl),
        source_domain: sourceDomain,
        article_url: sourceUrl,
      })
      .eq('unit_id', row.id)
      .eq('source_type', 'manual_pdf')
      .eq('source_url', 'manual://pdf');
    if (occurrenceErr) throw occurrenceErr;
  }

  console.log(`${apply ? 'Applied' : 'Dry run'}: mapped=${mapped} unknown=${unknown}`);
  if (unknownLabels.size > 0) {
    console.log('Unknown labels:');
    for (const label of [...unknownLabels].sort()) console.log(`- ${label}`);
  }

  await backfillJobs(supabase, apply);
}

async function backfillJobs(
  supabase: SupabaseClient,
  apply: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from('newspaper_jobs')
    .select('id, label')
    .eq('source_type', 'manual_pdf')
    .limit(1000);
  if (error) throw error;

  let mapped = 0;
  for (const job of (data ?? []) as Array<{ id: string; label: string | null }>) {
    const sourceUrl = sourceUrlForTitle(job.label);
    if (!sourceUrl) continue;
    mapped += 1;
    if (!apply) {
      console.log(`[dry-run job] ${job.id} ${job.label} -> ${sourceUrl}`);
      continue;
    }
    const { error: updateErr } = await supabase
      .from('newspaper_jobs')
      .update({ source_url: sourceUrl })
      .eq('id', job.id);
    if (updateErr) throw updateErr;
  }
  console.log(`${apply ? 'Applied' : 'Dry run'} jobs: mapped=${mapped}`);
}

function asVillageConfidence(value: string | null): 'high' | 'medium' | 'low' | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

function asSensitivity(value: string | null): Sensitivity {
  return value === 'death' || value === 'accident' || value === 'crime' || value === 'minor_safety'
    ? value
    : 'none';
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
