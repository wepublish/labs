import {
  anonHeaders,
  assertCondition,
  assertNoRunningExecution,
  cleanupTestUser,
  createLiveTestContext,
  createScout,
  logStep,
  runScout,
  waitForExecution,
  findValidatedCivicSource,
} from './live_test_utils.ts';

const WEB_ARTICLE_URL = Deno.env.get('SMOKE_WEB_ARTICLE_URL')
  ?? 'https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php';
const WEB_LISTING_URL = Deno.env.get('SMOKE_WEB_LISTING_URL')
  ?? 'https://www.arlesheim.ch/de/aktuelles/';
const CIVIC_ROOT_DOMAINS = (Deno.env.get('SMOKE_CIVIC_ROOT_DOMAINS')
  ?? 'allschwil.ch,arlesheim.ch,riehen.ch,reinach-bl.ch,binningen.ch')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CIVIC_ROOT_DOMAIN = Deno.env.get('SMOKE_CIVIC_ROOT_DOMAIN') ?? 'allschwil.ch';
const CIVIC_TRACKED_URLS = (Deno.env.get('SMOKE_CIVIC_TRACKED_URLS')
  ?? 'https://www.allschwil.ch/de/politik/gemeinderat')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const DISCOVER_CIVIC_SOURCE = Deno.env.get('SMOKE_DISCOVER_CIVIC_SOURCE') === 'true';
const INCLUDE_ARTICLE_SMOKE = Deno.env.get('SMOKE_INCLUDE_ARTICLE') === 'true';

function withFreshSmokeParam(url: string): string {
  const target = new URL(url);
  target.searchParams.set('smoke', Date.now().toString());
  return target.toString();
}

async function runWebArticleSmoke(): Promise<void> {
  const ctx = createLiveTestContext();
  const articleUrl = withFreshSmokeParam(WEB_ARTICLE_URL);

  logStep(`Web article smoke on ${articleUrl}`);
  const scout = await createScout(ctx, {
    name: 'Smoke Web Article',
    url: articleUrl,
    criteria: '',
    frequency: 'daily',
    location: { city: 'Arlesheim', country: 'Switzerland' },
    topic: null,
    scout_type: 'web',
  });

  const dispatch = await runScout(ctx, scout.id);
  const execution = await waitForExecution(ctx, dispatch.executionId);
  await assertNoRunningExecution(ctx, execution.id);

  assertCondition(execution.status === 'completed', `Web article execution failed: ${execution.error_message ?? execution.summary_text}`);
  assertCondition(
    (execution.units_extracted + (execution.merged_existing_count ?? 0)) > 0,
    'Web article smoke produced neither canonical inserts nor dedup merges',
  );

  const { count, error } = await ctx.serviceClient
    .from('unit_occurrences')
    .select('*', { count: 'exact', head: true })
    .eq('execution_id', execution.id);

  if (error) throw error;
  assertCondition((count ?? 0) > 0, 'Web article smoke wrote no occurrences');
}

async function runWebListingSmoke(): Promise<void> {
  const ctx = createLiveTestContext();
  const listingUrl = withFreshSmokeParam(WEB_LISTING_URL);

  logStep(`Web listing smoke on ${listingUrl}`);
  const scout = await createScout(ctx, {
    name: 'Smoke Web Listing',
    url: listingUrl,
    criteria: '',
    frequency: 'daily',
    location: { city: 'Arlesheim', country: 'Switzerland' },
    topic: null,
    scout_type: 'web',
  });

  const dispatch = await runScout(ctx, scout.id);
  const startedAt = dispatch.startedAt;
  const execution = await waitForExecution(ctx, dispatch.executionId);
  const elapsedMs = Date.now() - startedAt;
  await assertNoRunningExecution(ctx, execution.id);

  assertCondition(execution.status === 'completed', `Web listing execution failed: ${execution.error_message ?? execution.summary_text}`);
  assertCondition(elapsedMs <= 180_000, `Web listing smoke exceeded runtime budget window: ${elapsedMs}ms`);

  const { data, error } = await ctx.serviceClient
    .from('unit_occurrences')
    .select('source_url')
    .eq('execution_id', execution.id);

  if (error) throw error;

  const sourceUrls = new Set((data ?? []).map((row) => row.source_url as string));
  if (sourceUrls.size === 0) {
    assertCondition(
      (execution.units_extracted + (execution.merged_existing_count ?? 0)) === 0,
      'Web listing smoke completed without occurrences but reported extracted or merged units',
    );
    return;
  }

  if ([...sourceUrls].every((url) => url === listingUrl)) {
    return;
  }
}

async function runCivicSmoke(): Promise<void> {
  const ctx = createLiveTestContext();
  const civicSource = DISCOVER_CIVIC_SOURCE
    ? await findValidatedCivicSource(ctx, CIVIC_ROOT_DOMAINS)
    : {
      rootDomain: CIVIC_ROOT_DOMAIN,
      trackedUrls: CIVIC_TRACKED_URLS,
      documentsFound: CIVIC_TRACKED_URLS.length,
      samplePromises: 0,
    };

  logStep(`Civic smoke on ${civicSource.rootDomain}`);
  const scout = await createScout(ctx, {
    name: 'Smoke Civic Scout',
    scout_type: 'civic',
    root_domain: civicSource.rootDomain,
    tracked_urls: civicSource.trackedUrls,
    criteria: '',
    frequency: 'daily',
    location: null,
    topic: null,
  });

  const dispatch = await runScout(ctx, scout.id);
  const execution = await waitForExecution(ctx, dispatch.executionId, 300_000);
  await assertNoRunningExecution(ctx, execution.id);

  assertCondition(execution.status === 'completed', `Civic execution failed: ${execution.error_message ?? execution.summary_text}`);

  const { count: promiseCount, error: promiseError } = await ctx.serviceClient
    .from('promises')
    .select('*', { count: 'exact', head: true })
    .eq('scout_id', scout.id)
    .not('unit_id', 'is', null);

  if (promiseError) throw promiseError;
  if ((promiseCount ?? 0) === 0) {
    assertCondition(
      (execution.units_extracted + (execution.merged_existing_count ?? 0)) === 0,
      'Civic smoke completed without linked promises but reported extracted or merged units',
    );
    return;
  }
}

try {
  const ctx = createLiveTestContext();
  await cleanupTestUser(ctx);
  if (INCLUDE_ARTICLE_SMOKE) {
    await runWebArticleSmoke();
  }
  await runWebListingSmoke();
  await runCivicSmoke();
  logStep('Live scout pipeline smoke passed');
} finally {
  const ctx = createLiveTestContext();
  await cleanupTestUser(ctx);
}
