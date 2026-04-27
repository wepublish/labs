#!/usr/bin/env node
/**
 * Manually regenerate historical Dorfkönig drafts with the current hardened
 * v2 compose prompt.
 *
 * Default mode exports Markdown files only and does not modify the database:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENROUTER_API_KEY=... \
 *     npm run regenerate:past-drafts -- --from 2026-04-20 --to 2026-04-24 --village arlesheim
 *
 * Safer comparison mode:
 *   --unit-mode same    Reuse each draft's selected_unit_ids (default).
 *   --unit-mode better  Re-select from historical candidate units for that date.
 *
 * Destructive mode is opt-in:
 *   --replace-db        Replace title/body/schema_version/bullets_json/selected_unit_ids
 *                       on the existing bajour_drafts rows.
 */

if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => process.env[key] },
    serve: () => {
      throw new Error('Deno.serve not available in Node');
    },
  };
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import gemeindenJson from '../lib/gemeinden.json' with { type: 'json' };
import {
  ANTI_PATTERNS,
  AGNOSTIC_POSITIVE_SEEDS,
  type AntiPattern,
  type DraftV2,
  type PositiveSeed,
} from '../supabase/functions/_shared/draft-quality.ts';
import {
  composeDraftFromUnitsV2,
  renderDraftV2ToMarkdown,
  type UnitForCompose,
} from '../supabase/functions/_shared/compose-draft.ts';
import { openrouter } from '../supabase/functions/_shared/openrouter.ts';
import {
  addDaysIso,
  buildInformationSelectPrompt,
  formatUnitsForSelection,
  INFORMATION_SELECT_PROMPT,
  UNIT_FOR_COMPOSE_COLUMNS,
} from '../supabase/functions/_shared/prompts.ts';

export type UnitMode = 'same' | 'better';

export interface Args {
  from: string;
  to: string;
  villageIds: string[];
  unitMode: UnitMode;
  outDir: string;
  exportMd: boolean;
  replaceDb: boolean;
  dryRun: boolean;
  userId?: string;
  minQuality: number;
  useDbPrompt: boolean;
  maxUnits: number;
}

interface Village {
  id: string;
  name: string;
}

export interface DraftRow {
  id: string;
  user_id: string;
  village_id: string;
  village_name: string;
  title: string | null;
  body: string;
  selected_unit_ids: string[] | null;
  publication_date: string;
  verification_status: string;
  schema_version: number | null;
  bullets_json: unknown | null;
  provider: string | null;
  published_at: string | null;
  created_at: string;
}

export interface CandidateUnit extends UnitForCompose {
  id: string;
  location?: { city?: string | null } | null;
  village_confidence?: string | null;
  publication_date?: string | null;
  used_in_article?: boolean | null;
}

interface FeedbackRow {
  kind: 'positive' | 'negative';
  bullet_text: string;
  editor_reason: string | null;
  created_at: string;
}

interface ComposeExamples {
  positiveExamples: PositiveSeed[];
  antiPatterns: AntiPattern[];
}

export interface RegeneratedDraft {
  title: string;
  body: string;
  draft: DraftV2;
  selectedUnitIds: string[];
  units: CandidateUnit[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const villages = gemeindenJson as Village[];
const UUID_LIST_MAX = 80;

function usage(): string {
  return `Usage:
  npm run regenerate:past-drafts -- --date <YYYY-MM-DD> [--village arlesheim]
  npm run regenerate:past-drafts -- --from <YYYY-MM-DD> --to <YYYY-MM-DD> [options]

Options:
  --village <id[,id]>       Limit to one or more villages. Defaults to all.
  --user-id <id>            Limit to one user_id.
  --unit-mode same|better   Reuse old unit ids or re-select candidates. Default: same.
  --out-dir <path>          Markdown export dir. Default: exports/dorfkoenig-regenerated-drafts.
  --no-export               Do not write Markdown files.
  --replace-db              Update existing bajour_drafts rows in place.
  --dry-run                 List matching drafts and unit counts; no LLM, files, or DB writes.
  --min-quality <n>         Minimum quality_score for --unit-mode better when present. Default: 40.
  --max-units <n>           Cap re-selected units for --unit-mode better. Default: 20.
  --use-db-prompt           Use saved draft_compose_layer2 override when present.
  --help                    Show this message.`;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    from: '',
    to: '',
    villageIds: [],
    unitMode: 'same',
    outDir: 'exports/dorfkoenig-regenerated-drafts',
    exportMd: true,
    replaceDb: false,
    dryRun: false,
    minQuality: 40,
    useDbPrompt: false,
    maxUnits: 20,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (a === '--date') {
      args.from = argv[++i];
      args.to = args.from;
    } else if (a === '--from') args.from = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--village') args.villageIds.push(...argv[++i].split(',').map((v) => v.trim()).filter(Boolean));
    else if (a === '--user-id') args.userId = argv[++i];
    else if (a === '--unit-mode') args.unitMode = parseUnitMode(argv[++i]);
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--no-export') args.exportMd = false;
    else if (a === '--replace-db') args.replaceDb = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--min-quality') args.minQuality = Number(argv[++i]);
    else if (a === '--max-units') args.maxUnits = Number(argv[++i]);
    else if (a === '--use-db-prompt') args.useDbPrompt = true;
    else {
      throw new Error(`Unknown argument "${a}"\n\n${usage()}`);
    }
  }

  if (!isIsoDate(args.from) || !isIsoDate(args.to)) {
    throw new Error(`--date or --from/--to with YYYY-MM-DD is required\n\n${usage()}`);
  }
  if (args.from > args.to) throw new Error('--from must be <= --to');
  if (!Number.isFinite(args.minQuality)) throw new Error('--min-quality must be a number');
  if (!Number.isInteger(args.maxUnits) || args.maxUnits < 1 || args.maxUnits > 50) {
    throw new Error('--max-units must be an integer between 1 and 50');
  }
  if (!args.exportMd && !args.replaceDb && !args.dryRun) {
    throw new Error('Nothing to do: use --replace-db, omit --no-export, or pass --dry-run');
  }

  const validVillageIds = new Set(villages.map((v) => v.id));
  for (const villageId of args.villageIds) {
    if (!validVillageIds.has(villageId)) {
      throw new Error(`Unknown village id "${villageId}"`);
    }
  }

  return args;
}

function parseUnitMode(raw: string): UnitMode {
  if (raw === 'same' || raw === 'better') return raw;
  throw new Error('--unit-mode must be "same" or "better"');
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createSupabase(): SupabaseClient {
  const url = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchDrafts(supabase: SupabaseClient, args: Args): Promise<DraftRow[]> {
  let query = supabase
    .from('bajour_drafts')
    .select('id,user_id,village_id,village_name,title,body,selected_unit_ids,publication_date,verification_status,schema_version,bullets_json,provider,published_at,created_at')
    .gte('publication_date', args.from)
    .lte('publication_date', args.to)
    .order('publication_date', { ascending: true })
    .order('village_id', { ascending: true });

  if (args.userId) query = query.eq('user_id', args.userId);
  if (args.villageIds.length > 0) query = query.in('village_id', args.villageIds);

  const { data, error } = await query;
  if (error) throw new Error(`Draft query failed: ${error.message}`);
  return (data ?? []) as DraftRow[];
}

async function loadUnitsByIds(
  supabase: SupabaseClient,
  draft: DraftRow,
  ids: string[],
): Promise<CandidateUnit[]> {
  if (ids.length === 0) return [];
  if (ids.length > UUID_LIST_MAX) {
    throw new Error(`Draft ${draft.id} has ${ids.length} unit ids; refusing a huge in() query`);
  }

  const { data, error } = await supabase
    .from('information_units')
    .select(`${UNIT_FOR_COMPOSE_COLUMNS}, location, village_confidence, publication_date, used_in_article`)
    .eq('user_id', draft.user_id)
    .in('id', ids);

  if (error) throw new Error(`Unit fetch failed for ${draft.id}: ${error.message}`);

  const byId = new Map((data ?? []).map((u) => [u.id as string, u as CandidateUnit]));
  return ids
    .map((id) => byId.get(id))
    .filter((u): u is CandidateUnit => Boolean(u))
    .filter((u) => belongsToVillage(u, draft.village_id));
}

async function loadCandidateUnits(
  supabase: SupabaseClient,
  draft: DraftRow,
  minQuality: number,
): Promise<CandidateUnit[]> {
  const publicationDate = draft.publication_date;
  const createdBackstop = `${addDaysIso(publicationDate, -30)}T00:00:00Z`;

  const { data, error } = await supabase
    .from('information_units')
    .select(`${UNIT_FOR_COMPOSE_COLUMNS}, location, village_confidence, publication_date, used_in_article`)
    .eq('user_id', draft.user_id)
    .eq('location->>city', draft.village_id)
    .gte('created_at', createdBackstop)
    .order('event_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(`Candidate unit query failed for ${draft.id}: ${error.message}`);

  return ((data ?? []) as CandidateUnit[])
    .filter((u) => belongsToVillage(u, draft.village_id))
    .filter((u) => isHistoricallyRelevant(u, publicationDate, minQuality));
}

function belongsToVillage(unit: CandidateUnit, villageId: string): boolean {
  return unit.location?.city === villageId;
}

export function isHistoricallyRelevant(unit: CandidateUnit, publicationDate: string, minQuality: number): boolean {
  if (unit.village_confidence === 'low') return false;
  if (unit.quality_score != null && unit.quality_score < minQuality) return false;

  if (unit.sensitivity && unit.sensitivity !== 'none') {
    if (!unit.publication_date) return false;
    const age = daysBetween(unit.publication_date, publicationDate);
    if (age < 0 || age > 3) return false;
  }

  if (unit.event_date) {
    return unit.event_date >= addDaysIso(publicationDate, -1) &&
      unit.event_date <= addDaysIso(publicationDate, 7);
  }

  const createdDate = unit.created_at?.slice(0, 10);
  if (!createdDate) return false;
  return createdDate >= addDaysIso(publicationDate, -7) && createdDate <= publicationDate;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000);
}

async function selectBetterUnitIds(
  draft: DraftRow,
  candidates: CandidateUnit[],
  maxUnits: number,
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const currentDate = addDaysIso(draft.publication_date, -1);
  const formatted = formatUnitsForSelection(candidates);
  const response = await openrouter.chat({
    messages: [
      {
        role: 'system',
        content: buildInformationSelectPrompt(
          currentDate,
          2,
          INFORMATION_SELECT_PROMPT,
          draft.publication_date,
        ),
      },
      {
        role: 'user',
        content: `Hier sind die historischen Informationseinheiten für ${draft.village_name}:\n\n${formatted}\n\nWähle die relevantesten Einheiten für den damaligen Newsletter aus.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const validIds = new Set(candidates.map((u) => u.id));
  try {
    const parsed = JSON.parse(response.choices[0].message.content ?? '{}') as {
      selected_unit_ids?: unknown;
    };
    const selected = Array.isArray(parsed.selected_unit_ids)
      ? parsed.selected_unit_ids.filter((id): id is string => typeof id === 'string' && validIds.has(id))
      : [];
    return selected.length > 0 ? selected.slice(0, maxUnits) : candidates.slice(0, maxUnits).map((u) => u.id);
  } catch {
    return candidates.slice(0, maxUnits).map((u) => u.id);
  }
}

async function loadDbPromptOverride(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('user_prompts')
    .select('content')
    .eq('user_id', userId)
    .eq('prompt_key', 'draft_compose_layer2')
    .maybeSingle();

  if (error) throw new Error(`Prompt override lookup failed: ${error.message}`);
  return typeof data?.content === 'string' ? data.content : undefined;
}

async function loadFeedbackExamples(
  supabase: SupabaseClient,
  villageId: string,
): Promise<ComposeExamples> {
  const { data, error } = await supabase
    .from('bajour_feedback_examples')
    .select('kind, bullet_text, editor_reason, created_at')
    .eq('village_id', villageId)
    .in('kind', ['positive', 'negative'])
    .order('created_at', { ascending: false })
    .limit(16);

  if (error) throw new Error(`Feedback lookup failed: ${error.message}`);
  return mergeFeedbackExamples((data ?? []) as FeedbackRow[]);
}

export function mergeFeedbackExamples(rows: FeedbackRow[]): ComposeExamples {
  const positiveExamples: PositiveSeed[] = [];
  const antiPatterns: AntiPattern[] = [];
  const seenPositive = new Set<string>();
  const seenNegative = new Set<string>();

  for (const row of rows.filter((r) => r.kind === 'positive')) {
    const bullet = row.bullet_text.trim();
    if (!bullet || seenPositive.has(bullet)) continue;
    seenPositive.add(bullet);
    positiveExamples.push({ bullet, source_domain: 'Redaktionsbeispiel' });
    if (positiveExamples.length >= 6) break;
  }

  for (const seed of AGNOSTIC_POSITIVE_SEEDS) {
    if (positiveExamples.length >= 6) break;
    if (seenPositive.has(seed.bullet)) continue;
    seenPositive.add(seed.bullet);
    positiveExamples.push({ ...seed });
  }

  for (const row of rows.filter((r) => r.kind === 'negative')) {
    const bullet = row.bullet_text.trim();
    if (!bullet || seenNegative.has(bullet)) continue;
    seenNegative.add(bullet);
    antiPatterns.push({
      bullet,
      reason: row.editor_reason?.trim() || 'Redaktionsfeedback',
    });
    if (antiPatterns.length >= 4) break;
  }

  for (const seed of ANTI_PATTERNS) {
    if (antiPatterns.length >= 4) break;
    if (seenNegative.has(seed.bullet)) continue;
    seenNegative.add(seed.bullet);
    antiPatterns.push({ ...seed });
  }

  return { positiveExamples, antiPatterns };
}

async function regenerateDraft(
  supabase: SupabaseClient,
  draft: DraftRow,
  args: Args,
): Promise<RegeneratedDraft> {
  const originalIds = draft.selected_unit_ids ?? [];
  const candidateUnits = args.unitMode === 'same'
    ? await loadUnitsByIds(supabase, draft, originalIds)
    : await loadCandidateUnits(supabase, draft, args.minQuality);

  const selectedUnitIds = args.unitMode === 'same'
    ? candidateUnits.map((u) => u.id)
    : await selectBetterUnitIds(draft, candidateUnits, args.maxUnits);

  const selectedUnits = args.unitMode === 'same'
    ? candidateUnits
    : await loadUnitsByIds(supabase, draft, selectedUnitIds);

  if (selectedUnits.length === 0) {
    throw new Error(`Draft ${draft.id} has no usable units after ${args.unitMode} selection`);
  }

  const examples = await loadFeedbackExamples(supabase, draft.village_id);
  const composeLayer2 = args.useDbPrompt
    ? await loadDbPromptOverride(supabase, draft.user_id)
    : undefined;

  const { draft: v2, usage: tokenUsage } = await composeDraftFromUnitsV2({
    village_id: draft.village_id,
    village_name: draft.village_name,
    selected_units: selectedUnits,
    compose_layer2: composeLayer2,
    positiveExamples: examples.positiveExamples,
    antiPatterns: examples.antiPatterns,
    currentDate: addDaysIso(draft.publication_date, -1),
    publicationDate: draft.publication_date,
    ctx: { village_id: draft.village_id, run_id: draft.id },
  });

  return {
    title: v2.title,
    body: renderDraftV2ToMarkdown(v2).trim(),
    draft: v2,
    selectedUnitIds: selectedUnits.map((u) => u.id),
    units: selectedUnits,
    usage: tokenUsage,
  };
}

function exportMarkdown(outDir: string, source: DraftRow, regenerated: RegeneratedDraft): string {
  mkdirSync(outDir, { recursive: true });
  const file = join(
    outDir,
    `${source.publication_date}-${source.village_id}-${source.id.slice(0, 8)}.md`,
  );
  writeFileSync(file, renderExportMarkdown(source, regenerated), 'utf8');
  return file;
}

export function renderExportMarkdown(source: DraftRow, regenerated: RegeneratedDraft): string {
  const units = regenerated.units
    .map((u) => `- ${u.id}: ${u.statement}`)
    .join('\n');
  const notes = regenerated.draft.notes_for_editor.length > 0
    ? regenerated.draft.notes_for_editor.map((n) => `- ${n}`).join('\n')
    : '- (none)';

  return `---
source_draft_id: ${source.id}
village_id: ${source.village_id}
village_name: ${source.village_name}
publication_date: ${source.publication_date}
original_schema_version: ${source.schema_version ?? 1}
original_verification_status: ${source.verification_status}
original_provider: ${source.provider ?? 'auto'}
regenerated_schema_version: 2
selected_unit_ids: [${regenerated.selectedUnitIds.join(', ')}]
generated_at: ${new Date().toISOString()}
---

# ${regenerated.title}

${regenerated.body}

## Notes For Editor

${notes}

## Units

${units}
`;
}

async function replaceDraftInDb(
  supabase: SupabaseClient,
  source: DraftRow,
  regenerated: RegeneratedDraft,
): Promise<void> {
  const { error } = await supabase
    .from('bajour_drafts')
    .update({
      title: regenerated.title,
      body: regenerated.body,
      schema_version: 2,
      bullets_json: regenerated.draft,
      selected_unit_ids: regenerated.selectedUnitIds,
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id);

  if (error) throw new Error(`DB update failed for ${source.id}: ${error.message}`);
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createSupabase();
  if (!args.dryRun) requireEnv('OPENROUTER_API_KEY');

  const drafts = await fetchDrafts(supabase, args);
  console.log(`Found ${drafts.length} draft(s) from ${args.from} to ${args.to}.`);
  if (drafts.length === 0) return;

  if (args.replaceDb) {
    console.warn('WARNING: --replace-db updates existing bajour_drafts rows in place.');
  }

  const outDir = resolve(process.cwd(), args.outDir);
  let exported = 0;
  let replaced = 0;
  let failed = 0;

  for (const draft of drafts) {
    const label = `${draft.publication_date} ${draft.village_id} ${draft.id}`;
    try {
      if (args.dryRun) {
        const count = args.unitMode === 'same'
          ? (draft.selected_unit_ids ?? []).length
          : (await loadCandidateUnits(supabase, draft, args.minQuality)).length;
        console.log(`[dry-run] ${label}: ${count} ${args.unitMode === 'same' ? 'stored' : 'candidate'} unit(s)`);
        continue;
      }

      const regenerated = await regenerateDraft(supabase, draft, args);
      if (args.exportMd) {
        const file = exportMarkdown(outDir, draft, regenerated);
        exported += 1;
        console.log(`exported ${file}`);
      }
      if (args.replaceDb) {
        await replaceDraftInDb(supabase, draft, regenerated);
        replaced += 1;
        console.log(`updated draft ${draft.id}`);
      }
      console.log(
        `${label}: ${regenerated.draft.bullets.length} bullet(s), ${regenerated.selectedUnitIds.length} unit(s), ${regenerated.usage.total_tokens} tokens`,
      );
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAILED ${label}: ${message}`);
    }
  }

  console.log(`Done. exported=${exported} replaced=${replaced} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

export function isCliEntrypoint(
  metaUrl = import.meta.url,
  argv = process.argv,
): boolean {
  const entrypoint = argv[1];
  return Boolean(entrypoint && metaUrl === pathToFileURL(entrypoint).href);
}

if (isCliEntrypoint()) {
  main().catch((err) => {
    console.error('fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
