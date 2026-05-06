#!/usr/bin/env node
/**
 * Non-mutating auto-draft evaluation. Writes local reports only; never updates
 * bajour_drafts, information_units.used_in_article, or WhatsApp state.
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
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ANTI_PATTERNS,
  AGNOSTIC_POSITIVE_SEEDS,
} from '../supabase/functions/_shared/draft-quality.ts';
import {
  composeDraftFromUnitsV2,
  renderDraftV2ToMarkdown,
  type UnitForCompose,
} from '../supabase/functions/_shared/compose-draft.ts';
import {
  addDaysIso,
  buildInformationSelectPrompt,
  formatUnitsForSelection,
  INFORMATION_SELECT_PROMPT,
  UNIT_FOR_COMPOSE_COLUMNS,
} from '../supabase/functions/_shared/prompts.ts';
import {
  assessDraftQuality,
  resolveDraftRunContext,
} from '../supabase/functions/_shared/auto-draft-quality.ts';
import {
  dedupeSelectionCandidates,
  enforceMandatorySelection,
  rankSelectionCandidates,
  buildSelectionDiagnostics,
  refineSelectionForCompose,
} from '../supabase/functions/_shared/selection-ranking.ts';
import { openrouter } from '../supabase/functions/_shared/openrouter.ts';
import { prepareUnitsForCompose } from '../supabase/functions/_shared/story-candidates.ts';

interface Args {
  from: string;
  to: string;
  villageIds: string[];
  ignoreUsed: boolean;
  outDir: string;
  maxUnits: number;
}

interface DraftRow {
  id: string;
  user_id: string;
  village_id: string;
  village_name: string;
  publication_date: string;
}

interface CandidateUnit extends UnitForCompose {
  id: string;
  location?: { city?: string | null } | null;
  village_confidence?: string | null;
  used_in_article?: boolean | null;
}

function selectedUnitDiagnostics(
  selected: CandidateUnit[],
  ranked: ReturnType<typeof rankSelectionCandidates<CandidateUnit>>,
): Array<Record<string, unknown>> {
  const rankById = new Map(ranked.map((row) => [row.unit.id, row]));
  return selected.map((unit) => {
    const rank = rankById.get(unit.id);
    return {
      id: unit.id,
      score: rank?.score ?? null,
      reasons: rank?.reasons ?? [],
      mandatory: rank?.mandatory ?? false,
      statement: unit.statement,
      unit_type: unit.unit_type,
      event_date: unit.event_date ?? null,
      publication_date: unit.publication_date ?? null,
      source_domain: unit.source_domain ?? null,
      article_url: unit.article_url ?? null,
      quality_score: unit.quality_score ?? null,
      village_confidence: unit.village_confidence ?? null,
    };
  });
}

function compositionCoverage(
  selected: CandidateUnit[],
  draft: Awaited<ReturnType<typeof composeDraftFromUnitsV2>>['draft'],
): Array<Record<string, unknown>> {
  return selected.map((unit) => {
    const bullets = draft.bullets
      .map((bullet, index) => ({ bullet, index: index + 1 }))
      .filter(({ bullet }) => bullet.source_unit_ids.includes(unit.id));
    return {
      id: unit.id,
      statement: unit.statement,
      covered: bullets.length > 0,
      bullet_indexes: bullets.map(({ index }) => index),
      bullet_texts: bullets.map(({ bullet }) => bullet.text),
    };
  });
}

function markdownListSection(title: string, rows: string[]): string[] {
  return [
    `## ${title}`,
    '',
    ...(rows.length ? rows.map((row) => `- ${row}`) : ['- none']),
    '',
  ];
}

function classifyEvalVerdicts(args: {
  selectedDiagnostics: Array<Record<string, unknown>>;
  coverage: Array<Record<string, unknown>>;
  warnings: Array<{ reason: string; severity: string; message: string }>;
}): string[] {
  const verdicts = new Set<string>();
  const selectedCount = args.selectedDiagnostics.length;
  const omittedCount = args.coverage.filter((row) => row.covered === false).length;
  const staticCount = args.selectedDiagnostics.filter((row) =>
    Array.isArray(row.reasons) && row.reasons.includes('static_directory_fact')
  ).length;

  if (selectedCount === 0) verdicts.add('selection_empty');
  if (staticCount >= Math.max(2, Math.ceil(selectedCount / 2))) verdicts.add('too_many_static_units');
  if (omittedCount > 0) verdicts.add('composition_omitted_selected_units');
  if (args.warnings.some((w) => w.reason === 'weak_sources')) verdicts.add('source_link_missing');
  if (args.warnings.some((w) => w.severity === 'blocker')) verdicts.add('quality_gate_blocked');
  if (verdicts.size === 0) verdicts.add('selection_and_composition_passed');
  return [...verdicts];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    from: '',
    to: '',
    villageIds: [],
    ignoreUsed: false,
    outDir: 'exports/dorfkoenig-draft-evals',
    maxUnits: 8,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') {
      args.from = argv[++i];
      args.to = args.from;
    } else if (a === '--from') args.from = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--village') args.villageIds.push(...argv[++i].split(',').map((v) => v.trim()).filter(Boolean));
    else if (a === '--ignore-used') args.ignoreUsed = true;
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--max-units') args.maxUnits = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from) || !/^\d{4}-\d{2}-\d{2}$/.test(args.to)) {
    throw new Error('--date or --from/--to is required');
  }
  return args;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createSupabase(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchDrafts(supabase: SupabaseClient, args: Args): Promise<DraftRow[]> {
  let query = supabase
    .from('bajour_drafts')
    .select('id,user_id,village_id,village_name,publication_date')
    .gte('publication_date', args.from)
    .lte('publication_date', args.to)
    .order('publication_date', { ascending: true })
    .order('village_id', { ascending: true });
  if (args.villageIds.length > 0) query = query.in('village_id', args.villageIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DraftRow[];
}

async function loadCandidateUnits(supabase: SupabaseClient, draft: DraftRow, ignoreUsed: boolean): Promise<CandidateUnit[]> {
  const context = resolveDraftRunContext({
    requestedPublicationDate: draft.publication_date,
    zurichToday: draft.publication_date,
  });
  if (!context.publicationDate) return [];
  const publicationDate = context.publicationDate;
  const news7d = `${addDaysIso(publicationDate, -7)}T00:00:00Z`;
  const backstop30d = `${addDaysIso(publicationDate, -30)}T00:00:00Z`;
  const eventStart = publicationDate;
  const eventEnd = addDaysIso(publicationDate, 7);

  let query = supabase
    .from('information_units')
    .select(`${UNIT_FOR_COMPOSE_COLUMNS}, location, village_confidence, used_in_article`)
    .eq('user_id', draft.user_id)
    .eq('location->>city', draft.village_id)
    .not('statement', 'ilike', '[DEBUG]%')
    .not('source_domain', 'eq', 'example.invalid')
    .gte('created_at', backstop30d)
    .or([
      `and(unit_type.eq.event,event_date.gte.${eventStart},event_date.lte.${eventEnd})`,
      `and(unit_type.neq.event,publication_date.gte.${addDaysIso(publicationDate, -14)})`,
      `and(unit_type.neq.event,publication_date.is.null,created_at.gte.${news7d})`,
    ].join(','))
    .gte('quality_score', 40)
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(120);
  if (!ignoreUsed) query = query.eq('used_in_article', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CandidateUnit[];
}

async function selectUnitIds(draft: DraftRow, rankedRows: CandidateUnit[], maxUnits: number): Promise<string[]> {
  if (rankedRows.length === 0) return [];
  const context = resolveDraftRunContext({
    requestedPublicationDate: draft.publication_date,
    zurichToday: draft.publication_date,
  });
  if (!context.publicationDate) return [];
  const publicationDate = context.publicationDate;
  const ranked = rankSelectionCandidates(rankedRows, {
    currentDate: context.runDate,
    publicationDate,
    maxCandidates: 80,
    villageId: draft.village_id,
  });
  const formatted = formatUnitsForSelection(ranked.map((row) => row.unit));
  const response = await openrouter.chat({
    messages: [
      {
        role: 'system',
        content: buildInformationSelectPrompt(context.runDate, 2, INFORMATION_SELECT_PROMPT, publicationDate),
      },
      {
        role: 'user',
        content: `Hier sind die verfügbaren Informationseinheiten:\n\n${formatted}\n\nWähle die relevantesten Einheiten für den Newsletter aus.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });
  const valid = new Set(ranked.map((row) => row.unit.id));
  const parsed = JSON.parse(response.choices[0].message.content ?? '{}') as { selected_unit_ids?: unknown };
  const ids = Array.isArray(parsed.selected_unit_ids)
    ? parsed.selected_unit_ids.filter((id): id is string => typeof id === 'string' && valid.has(id))
    : [];
  const enforced = enforceMandatorySelection(ids, ranked, maxUnits);
  return refineSelectionForCompose(enforced, ranked, maxUnits);
}

async function evalDraft(supabase: SupabaseClient, draft: DraftRow, args: Args): Promise<void> {
  const context = resolveDraftRunContext({
    requestedPublicationDate: draft.publication_date,
    zurichToday: draft.publication_date,
  });
  if (!context.publicationDate) {
    console.warn(`[skip] ${draft.village_id} ${draft.publication_date}: non-publication day`);
    return;
  }
  const publicationDate = context.publicationDate;
  const candidates = await loadCandidateUnits(supabase, draft, args.ignoreUsed);
  const deduped = dedupeSelectionCandidates(candidates, {
    currentDate: context.runDate,
    publicationDate,
  });
  const ranked = rankSelectionCandidates(deduped.units, {
    currentDate: context.runDate,
    publicationDate,
    maxCandidates: 80,
    villageId: draft.village_id,
  });
  let selectedIds = await selectUnitIds(draft, deduped.units, args.maxUnits);
  const selectedById = new Map(deduped.units.map((u) => [u.id, u]));
  const selected = prepareUnitsForCompose(
    selectedIds.map((id) => selectedById.get(id)).filter((u): u is CandidateUnit => Boolean(u)),
    ranked,
  ) as CandidateUnit[];
  selectedIds = selected.map((u) => u.id);
  const composeResult = selected.length > 0
    ? await composeDraftFromUnitsV2({
      village_id: draft.village_id,
      village_name: draft.village_name,
      selected_units: selected,
      positiveExamples: AGNOSTIC_POSITIVE_SEEDS,
      antiPatterns: ANTI_PATTERNS,
      currentDate: context.runDate,
      publicationDate,
      ctx: { village_id: draft.village_id, run_id: draft.id },
    })
    : {
      draft: {
        title: `${draft.village_name} — ${draft.publication_date}`,
        bullets: [],
        notes_for_editor: ['Keine auswählbaren Einheiten nach Ranking-, Verfügbarkeits- und Qualitätsfiltern.'],
      },
      usage: null,
    };
  const generated = composeResult.draft;
  const usage = composeResult.usage;
  const quality = assessDraftQuality({
    draft: generated,
    selectedUnits: selected,
    rankedSelection: ranked,
    selectedIds,
    context,
  });
  const diagnostics = buildSelectionDiagnostics(ranked, selectedIds);
  const selectedDiagnostics = selectedUnitDiagnostics(selected, ranked);
  const coverage = compositionCoverage(selected, generated);
  const omittedSelected = coverage.filter((row) => !row.covered);
  const evalVerdicts = classifyEvalVerdicts({
    selectedDiagnostics,
    coverage,
    warnings: quality.warnings,
  });
  const base = `${draft.publication_date}-${draft.village_id}-${draft.id.slice(0, 8)}`;
  const outDir = resolve(process.cwd(), args.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${base}.json`), JSON.stringify({
    draft_id: draft.id,
    village_id: draft.village_id,
    publication_date: draft.publication_date,
    candidate_count: candidates.length,
    deduped_candidate_count: deduped.units.length,
    rejected_duplicates: deduped.rejected,
    selected_unit_ids: selectedIds,
    decision: quality.decision,
    eval_verdicts: evalVerdicts,
    warnings: quality.warnings,
    usage,
    diagnostics: {
      ...diagnostics,
      selected_units: selectedDiagnostics,
      composition_coverage: coverage,
      selected_but_omitted: omittedSelected,
    },
    draft: generated,
  }, null, 2), 'utf8');
  writeFileSync(join(outDir, `${base}.md`), [
    `# ${generated.title}`,
    '',
    renderDraftV2ToMarkdown(generated).trim(),
    '',
    `Decision: ${quality.decision}`,
    `Eval verdicts: ${evalVerdicts.join(', ')}`,
    '',
    'Warnings:',
    ...(quality.warnings.length ? quality.warnings.map((w) => `- [${w.severity}] ${w.reason}: ${w.message}`) : ['- none']),
    '',
    ...markdownListSection(
      'Selected Units',
      selectedDiagnostics.map((row) =>
        `${row.id} | score=${row.score} | reasons=${Array.isArray(row.reasons) ? row.reasons.join(',') : ''} | ${row.statement}`
      ),
    ),
    ...markdownListSection(
      'Selected But Omitted',
      omittedSelected.map((row) => `${row.id} | ${row.statement}`),
    ),
  ].join('\n'), 'utf8');
  console.log(`${draft.publication_date} ${draft.village_id}: ${quality.decision}, candidates=${candidates.length}, selected=${selectedIds.length}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  requireEnv('OPENROUTER_API_KEY');
  const supabase = createSupabase();
  const drafts = await fetchDrafts(supabase, args);
  console.log(`Found ${drafts.length} draft(s).`);
  for (const draft of drafts) await evalDraft(supabase, draft, args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
