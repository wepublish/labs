#!/usr/bin/env node
/**
 * Benchmark the web-scout subpage-follow mechanism end-to-end against the
 * Baselland Medienmitteilungen URL — the exact failure case that motivated
 * the feature. Asserts: (a) the LLM flags the index as a listing page, and
 * (b) at least MIN_UNITS_ASSERT information units are extracted across the
 * followed subpages.
 *
 * Runs in Node via tsx, with a Deno shim so the edge-function shared modules
 * (civic-utils, openrouter, web-extraction-prompt) load unchanged. The shim
 * must be installed BEFORE any static import of the shared modules — so this
 * file uses dynamic import after the shim is in place.
 *
 * Env required (set before running):
 *   FIRECRAWL_API_KEY  — Firecrawl v2 key
 *   OPENROUTER_API_KEY — OpenRouter key
 *
 * Run:
 *   npm run benchmark:subpages
 *
 * Exits 0 on success, 1 on any assertion failure. Pure offline read + two
 * network services; does NOT touch Supabase.
 */

// ── Deno shim (must run before any `_shared/*.ts` import) ──
if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

const TARGET_URL = 'https://www.baselland.ch/politik-und-behorden/regierungsrat/medienmitteilungen/';
const SUBPAGE_FETCH_CAP = 10;
const MIN_UNITS_ASSERT = 3;

// Baselland-area villages from gemeinden.json — enough for the prompt ladder.
const VILLAGE_IDS = [
  'aesch', 'allschwil', 'arlesheim', 'binningen', 'bottmingen',
  'muenchenstein', 'muttenz', 'pratteln', 'reinach', 'riehen',
];

function fail(msg: string): never {
  console.error(`\n❌ FAIL: ${msg}`);
  process.exit(1);
}

function assertEnv() {
  const missing = ['FIRECRAWL_API_KEY', 'OPENROUTER_API_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    fail(`missing env vars: ${missing.join(', ')}. Export them or source a .env file.`);
  }
}

async function main() {
  assertEnv();

  // Dynamic imports — the Deno shim is already installed above.
  const [{ extractLinksFromHtml, firecrawlDelay }, { filterSubpageUrls }, { firecrawl }, { openrouter }, { buildWebExtractionPrompt }] = await Promise.all([
    import('../supabase/functions/_shared/civic-utils.ts'),
    import('../supabase/functions/_shared/subpage-filter.ts'),
    import('../supabase/functions/_shared/firecrawl.ts'),
    import('../supabase/functions/_shared/openrouter.ts'),
    import('../supabase/functions/_shared/web-extraction-prompt.ts'),
  ]);
  type WebExtractionResult = Awaited<ReturnType<typeof runExtraction>>;

  async function runExtraction(markdown: string, scrapeDate: string) {
    const { system, buildUserMessage } = buildWebExtractionPrompt({
      villageIds: VILLAGE_IDS,
      criteria: null,
      scrapeDate,
    });
    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: buildUserMessage(markdown.slice(0, 12000)) },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });
    try {
      return JSON.parse(response.choices[0].message.content) as {
        units?: { statement: string }[];
        skipped?: string[];
        isListingPage?: boolean;
      };
    } catch (e) {
      fail(`LLM returned non-JSON: ${(e as Error).message}`);
    }
  }
  void (null as unknown as WebExtractionResult);

  const scrapeDate = new Date().toISOString().slice(0, 10);
  console.log(`🔎 Benchmark: ${TARGET_URL}\n   Date: ${scrapeDate}\n`);

  // ── Phase A: scrape the index
  console.log('──────── Phase A: scrape index ────────');
  const indexScrape = await firecrawl.scrape({
    url: TARGET_URL,
    formats: ['markdown', 'rawHtml'],
    timeout: 60000,
  });
  if (!indexScrape.success) fail(`index scrape failed: ${indexScrape.error}`);
  const mdLen = indexScrape.markdown?.length ?? 0;
  const htmlLen = indexScrape.rawHtml?.length ?? 0;
  console.log(`  markdown: ${mdLen} chars, rawHtml: ${htmlLen} chars`);
  if (!indexScrape.markdown || !indexScrape.rawHtml) fail('scrape missing markdown or rawHtml');

  // ── Step 2: run extraction on the index, confirm listing detection
  console.log('\n──────── Step 2: LLM extraction on index ────────');
  const indexExtraction = await runExtraction(indexScrape.markdown, scrapeDate);
  const isListing = Boolean(indexExtraction.isListingPage);
  console.log(`  units: ${indexExtraction.units?.length ?? 0}`);
  console.log(`  skipped: ${JSON.stringify(indexExtraction.skipped ?? [])}`);
  console.log(`  isListingPage: ${isListing}`);
  if (!isListing) fail('LLM did not flag the index as a listing page (isListingPage must be true)');

  // ── Step 3: link extraction
  console.log('\n──────── Step 3: extract links from rawHtml ────────');
  const links = extractLinksFromHtml(indexScrape.rawHtml, TARGET_URL);
  console.log(`  total links: ${links.length}`);
  console.log('  first 5:');
  links.slice(0, 5).forEach(([u, a]: [string, string]) => console.log(`    ${u}  "${a.slice(0, 80)}"`));

  // ── Step 4: filter
  console.log('\n──────── Step 4: filter (host + path-prefix + traversal + domain) ────────');
  const filtered = filterSubpageUrls(
    links.map(([url]: [string, string]) => url),
    TARGET_URL,
  );
  console.log(`  filtered count: ${filtered.length}`);
  console.log('  first 5:');
  filtered.slice(0, 5).forEach((u: string) => console.log(`    ${u}`));

  // ── Step 5: cap
  const candidates = filtered.slice(0, SUBPAGE_FETCH_CAP);
  console.log(`\n──────── Step 5: cap to ${SUBPAGE_FETCH_CAP} (${candidates.length} to scrape) ────────`);
  if (candidates.length === 0) fail('no candidate subpages after filtering');

  // ── Step 6: scrape each subpage + extract
  console.log('\n──────── Step 6: scrape + extract per subpage ────────');
  let totalUnits = 0;
  let subpagesProcessed = 0;
  let subpagesFailed = 0;
  let nestedListings = 0;

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    if (i > 0) await firecrawlDelay();

    const sub = await firecrawl.scrape({ url, formats: ['markdown'], timeout: 60000 });
    if (!sub.success || !sub.markdown) {
      subpagesFailed++;
      console.log(`  [${i + 1}/${candidates.length}] FAIL ${url}  (${sub.error ?? 'no content'})`);
      continue;
    }

    const extraction = await runExtraction(sub.markdown, scrapeDate);
    if (extraction.isListingPage) {
      nestedListings++;
      console.log(`  [${i + 1}/${candidates.length}] NESTED-LISTING ${url}  (skipped, single-hop)`);
      continue;
    }
    const units = extraction.units ?? [];
    totalUnits += units.length;
    subpagesProcessed++;
    const firstStatement = units[0]?.statement ?? '(no units)';
    console.log(`  [${i + 1}/${candidates.length}] ${units.length} units  ${url}`);
    console.log(`       → ${firstStatement.slice(0, 120)}`);
  }

  // ── Summary + asserts
  console.log('\n──────── Summary ────────');
  console.log(`  subpages processed: ${subpagesProcessed}/${candidates.length}`);
  console.log(`  nested listings skipped: ${nestedListings}`);
  console.log(`  subpage failures: ${subpagesFailed}`);
  console.log(`  total units across subpages: ${totalUnits}`);

  if (totalUnits < MIN_UNITS_ASSERT) {
    fail(`expected ≥${MIN_UNITS_ASSERT} units across subpages, got ${totalUnits}`);
  }

  console.log(`\n✅ PASS: listing detected, ${totalUnits} units extracted from ${subpagesProcessed} subpages.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
