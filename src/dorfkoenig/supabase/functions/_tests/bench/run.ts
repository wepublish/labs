#!/usr/bin/env node
/**
 * Dorfkönig draft-quality benchmark runner (specs/DRAFT_QUALITY.md §4).
 *
 * Run from labs repo root:
 *   npm run bench:dorfkoenig
 *   npm run bench:dorfkoenig -- --fixture arlesheim-2026-04-20
 *   npm run bench:dorfkoenig -- --model anthropic/claude-sonnet-4-5
 *   npm run bench:dorfkoenig -- --output ./report.json
 *   npm run bench:dorfkoenig -- --schema v1      # legacy composer compatibility
 *   BENCH_CONCURRENCY=4 npm run bench:dorfkoenig   # parallel fixture execution
 *
 * Requires OPENROUTER_API_KEY in env (same as production). For CI use a low-budget key.
 *
 * Hard cap: BENCH_MAX_TOKENS_PER_RUN (default 10000). Runner aborts if a fixture exceeds it.
 *
 * PR comments should log SCORES ONLY, never prompts/responses — avoid leaking fixture text
 * that might include non-public unit content (CI workflow enforces this).
 */

// Shim: compose-draft.ts → openrouter.ts reads `Deno.env.get(...)` at module load.
// Under Node (tsx) we polyfill before any dynamic import resolves that chain.
// Placed before other imports so it runs first regardless of bundler reordering.
if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => process.env[key] },
    serve: () => { throw new Error('Deno.serve not available in Node'); },
  };
}

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  BenchOutput,
  BenchReport,
  Fixture,
  FixtureReport,
  MetricResult,
} from './types.ts';
import { aggregate, scoreFixture } from './metrics.ts';
import { adaptBulletDraft, adaptV1Draft } from './adapter.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures', 'drafts');
const BENCH_MAX_TOKENS_PER_RUN = Number(process.env.BENCH_MAX_TOKENS_PER_RUN ?? 10000);

// --- CLI args ----------------------------------------------------------------

interface Args {
  fixture?: string;
  model?: string;
  output?: string;
  promptOverride?: string;
  temperature: number;
  schema: 'v1' | 'v2';
}

function parseArgs(argv: string[]): Args {
  const args: Args = { temperature: 0, schema: 'v2' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixture') args.fixture = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--prompt-override') args.promptOverride = argv[++i];
    else if (a === '--temperature') args.temperature = Number(argv[++i]);
    else if (a === '--schema') {
      const schema = argv[++i];
      if (schema !== 'v1' && schema !== 'v2') throw new Error('--schema must be v1 or v2');
      args.schema = schema;
    }
  }
  return args;
}

// --- Fixture loading ---------------------------------------------------------

function loadFixtures(filter?: string): Fixture[] {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !filter || f.replace(/\.json$/, '') === filter);
  if (files.length === 0) {
    throw new Error(
      filter
        ? `No fixture matches "${filter}" in ${FIXTURES_DIR}`
        : `No fixtures found in ${FIXTURES_DIR}`,
    );
  }
  return files.map((f) => {
    const raw = readFileSync(join(FIXTURES_DIR, f), 'utf8');
    return JSON.parse(raw) as Fixture;
  });
}

// --- Pipeline invocation -----------------------------------------------------

/**
 * Call the pure compose function with the fixture units. Default to the v2
 * bullet schema because that is where production draft-quality rules and
 * feedback few-shots live; keep v1 available for compatibility checks.
 */
async function runFixture(fixture: Fixture, args: Args): Promise<FixtureReport> {
  const baseReport: Omit<FixtureReport, 'metrics' | 'aggregate_score' | 'pass'> = {
    fixture_id: fixture.fixture_id,
    village_id: fixture.village_id,
    edition_date: fixture.edition_date,
  };

  // Empty-fixture short-circuit: don't spend LLM tokens, just score against empty output.
  if (fixture.units.length === 0) {
    const output: BenchOutput = {
      bullets: [],
      notes_for_editor: ['Keine Einheiten vorhanden'],
      body_text: '',
    };
    const metrics = await scoreFixture(fixture, output);
    const aggregateScore = aggregate(metrics);
    return {
      ...baseReport,
      metrics,
      aggregate_score: aggregateScore,
      pass: aggregateScore >= 70 && metrics.every((m) => m.pass),
    };
  }

  // Load pure compose functions lazily (so empty-fixture path doesn't need them).
  const { composeDraftFromUnits, composeDraftFromUnitsV2 } = await import(
    '../../_shared/compose-draft.ts'
  );

  let promptOverride: string | undefined;
  if (args.promptOverride) {
    promptOverride = readFileSync(resolve(process.cwd(), args.promptOverride), 'utf8');
  }

  try {
    if (args.schema === 'v2') {
      const result = await composeDraftFromUnitsV2({
        village_id: fixture.village_id,
        village_name: fixture.village_name,
        selected_units: fixture.units.map((u) => ({
          id: u.id,
          statement: u.statement,
          unit_type: u.unit_type,
          source_domain: u.source_domain,
          source_url: u.source_url,
          article_url: u.article_url,
          is_listing_page: u.is_listing_page,
          quality_score: u.quality_score,
          sensitivity: u.sensitivity,
          event_date: u.event_date,
          publication_date: u.publication_date,
          created_at: u.created_at,
          location: u.location,
        })),
        compose_layer2: promptOverride,
        model: args.model,
        temperature: args.temperature,
        max_tokens: BENCH_MAX_TOKENS_PER_RUN,
        currentDate: fixture.edition_date,
        publicationDate: fixture.edition_date,
      });

      if (result.usage.total_tokens > BENCH_MAX_TOKENS_PER_RUN) {
        throw new Error(
          `Token cap exceeded: ${result.usage.total_tokens} > ${BENCH_MAX_TOKENS_PER_RUN}`,
        );
      }

      const output = adaptBulletDraft(result.draft);
      const metrics = await scoreFixture(fixture, output);
      const aggregateScore = aggregate(metrics);

      return {
        ...baseReport,
        metrics,
        aggregate_score: aggregateScore,
        pass: aggregateScore >= 70 && metrics.every((m) => m.pass),
        usage: result.usage,
      };
    }

    const result = await composeDraftFromUnits({
      village_id: fixture.village_id,
      village_name: fixture.village_name,
      selected_units: fixture.units.map((u) => ({
        id: u.id,
        statement: u.statement,
        unit_type: u.unit_type,
        source_domain: u.source_domain,
        source_url: u.source_url,
        article_url: u.article_url,
        is_listing_page: u.is_listing_page,
        quality_score: u.quality_score,
        sensitivity: u.sensitivity,
        event_date: u.event_date,
        publication_date: u.publication_date,
        created_at: u.created_at,
        location: u.location,
      })),
      compose_layer2: promptOverride,
      model: args.model,
      temperature: args.temperature,
      max_tokens: BENCH_MAX_TOKENS_PER_RUN,
    });

    if (result.usage.total_tokens > BENCH_MAX_TOKENS_PER_RUN) {
      throw new Error(
        `Token cap exceeded: ${result.usage.total_tokens} > ${BENCH_MAX_TOKENS_PER_RUN}`,
      );
    }

    const output = adaptV1Draft(result.draft, result.body_md);
    const metrics = await scoreFixture(fixture, output);
    const aggregateScore = aggregate(metrics);

    return {
      ...baseReport,
      metrics,
      aggregate_score: aggregateScore,
      pass: aggregateScore >= 70 && metrics.every((m) => m.pass),
      usage: result.usage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...baseReport,
      metrics: [],
      aggregate_score: 0,
      pass: false,
      error: message,
    };
  }
}

// --- Reporting ---------------------------------------------------------------

function formatMetric(m: MetricResult): string {
  const mark = m.pass ? '✓' : '✗';
  return `  ${mark} ${m.name.padEnd(22)} ${String(m.score).padStart(3)}/100  ${m.detail}`;
}

function formatFixtureReport(r: FixtureReport): string {
  const mark = r.pass ? '✓' : '✗';
  const lines: string[] = [`${mark} ${r.fixture_id} — aggregate ${r.aggregate_score}/100`];
  if (r.error) {
    lines.push(`  ERROR: ${r.error}`);
    return lines.join('\n');
  }
  for (const m of r.metrics) lines.push(formatMetric(m));
  if (r.usage) {
    lines.push(
      `  tokens: ${r.usage.prompt_tokens} in / ${r.usage.completion_tokens} out / ${r.usage.total_tokens} total`,
    );
  }
  return lines.join('\n');
}

function formatBenchReport(report: BenchReport): string {
  const header =
    `Dorfkönig bench — model=${report.config.model ?? 'default'}, ` +
    `temperature=${report.config.temperature}, schema=${report.config.schema ?? 'v2'}`;
  const lines = [header, '='.repeat(header.length)];
  for (const r of report.runs) {
    lines.push('');
    lines.push(formatFixtureReport(r));
  }
  lines.push('');
  lines.push('─'.repeat(header.length));
  lines.push(`Aggregate: ${report.aggregate_score}/100 ${report.pass ? '(PASS)' : '(FAIL)'}`);
  return lines.join('\n');
}

// --- Entry point -------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures(args.fixture);

  // Bounded concurrency: fixture runs are I/O-bound (OpenRouter). Capped low to respect rate limits.
  const concurrency = Math.max(1, Number(process.env.BENCH_CONCURRENCY ?? 3));
  const runs: FixtureReport[] = new Array(fixtures.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, fixtures.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= fixtures.length) return;
        runs[i] = await runFixture(fixtures[i], args);
      }
    }),
  );

  const aggregateScore = Math.round(
    runs.reduce((sum, r) => sum + r.aggregate_score, 0) / Math.max(1, runs.length),
  );
  const pass = aggregateScore >= 75 && runs.every((r) => r.pass);

  const report: BenchReport = {
    runs,
    aggregate_score: aggregateScore,
    pass,
    config: {
      model: args.model,
      temperature: args.temperature,
      prompt_override: args.promptOverride,
      schema: args.schema,
    },
  };

  // stdout = human report
  console.log(formatBenchReport(report));

  // JSON to file if requested
  if (args.output) {
    writeFileSync(resolve(process.cwd(), args.output), JSON.stringify(report, null, 2));
  }

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('bench:dorfkoenig fatal error:', err);
  process.exit(2);
});
