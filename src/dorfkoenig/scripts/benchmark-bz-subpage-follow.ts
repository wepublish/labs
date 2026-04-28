#!/usr/bin/env node
/**
 * Regression benchmark for the BZ Basel village-listing failure:
 * /gemeinde/arlesheim-4144 must keep same-host CH Media article routes under
 * /.../ld.NNN and extract from the article body, not from the listing headline.
 *
 * Requires FIRECRAWL_API_KEY and OPENROUTER_API_KEY. Does not touch Supabase.
 */

if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

const LISTING_URL = 'https://www.bzbasel.ch/gemeinde/arlesheim-4144';
const TARGET_URL = 'https://www.bzbasel.ch/aargau/fricktal/zeiningen-steiner-logistic-ag-wird-uebernommen-ld.4158147';
const VILLAGE_IDS = [
  'aesch', 'allschwil', 'arlesheim', 'binningen', 'bottmingen',
  'muenchenstein', 'muttenz', 'pratteln', 'reinach', 'riehen',
];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assertEnv() {
  const missing = ['FIRECRAWL_API_KEY', 'OPENROUTER_API_KEY'].filter((key) => !process.env[key]);
  if (missing.length > 0) fail(`missing env vars: ${missing.join(', ')}`);
}

async function main() {
  assertEnv();
  const [
    { extractLinksFromHtml },
    { filterSubpageUrls },
    { firecrawl },
    { openrouter },
    { buildWebExtractionPrompt },
    { extractBodySupportedLocationFacts },
  ] = await Promise.all([
    import('../supabase/functions/_shared/civic-utils.ts'),
    import('../supabase/functions/_shared/subpage-filter.ts'),
    import('../supabase/functions/_shared/firecrawl.ts'),
    import('../supabase/functions/_shared/openrouter.ts'),
    import('../supabase/functions/_shared/web-extraction-prompt.ts'),
    import('../supabase/functions/_shared/location-body-fallback.ts'),
  ]);

  const listing = await firecrawl.scrape({
    url: LISTING_URL,
    formats: ['markdown', 'rawHtml'],
    timeout: 60_000,
  });
  if (!listing.success || !listing.rawHtml) fail(`listing scrape failed: ${listing.error ?? 'no rawHtml'}`);

  const links = extractLinksFromHtml(listing.rawHtml, LISTING_URL);
  const candidates = filterSubpageUrls(links.map(([url]: [string, string]) => url), LISTING_URL);
  if (!candidates.includes(TARGET_URL)) {
    fail(`target BZ article missing from candidates (${candidates.length} candidates)`);
  }

  const article = await firecrawl.scrape({
    url: TARGET_URL,
    formats: ['markdown'],
    timeout: 60_000,
  });
  if (!article.success || !article.markdown) fail(`article scrape failed: ${article.error ?? 'no markdown'}`);
  if (!/Arlesheim/i.test(article.markdown)) fail('article body does not contain Arlesheim');

  const scrapeDate = new Date().toISOString().slice(0, 10);
  const { system, buildUserMessage } = buildWebExtractionPrompt({
    villageIds: VILLAGE_IDS,
    criteria: null,
    scrapeDate,
  });
  const response = await openrouter.chat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: buildUserMessage(article.markdown.slice(0, 12_000)) },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content ?? '{}') as {
    units?: Array<{ statement?: string; village?: string | null; articleUrl?: string | null }>;
    isListingPage?: boolean;
  };
  if (parsed.isListingPage) fail('target article was classified as a listing page');
  const arlesheimUnits = (parsed.units ?? []).filter((unit) =>
    unit.village?.toLowerCase() === 'arlesheim' || /Arlesheim/i.test(unit.statement ?? '')
  );
  const fallbackUnits = arlesheimUnits.length > 0
    ? []
    : extractBodySupportedLocationFacts(article.markdown, 'Arlesheim');
  if (arlesheimUnits.length === 0 && fallbackUnits.length === 0) {
    fail('article extraction produced no Arlesheim body unit');
  }

  console.log(
    `PASS: BZ listing kept target article and extracted ${arlesheimUnits.length + fallbackUnits.length} Arlesheim unit(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
