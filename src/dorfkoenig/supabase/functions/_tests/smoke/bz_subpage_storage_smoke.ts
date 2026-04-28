import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import { createServiceClient } from '../../_shared/supabase-client.ts';
import { firecrawl } from '../../_shared/firecrawl.ts';
import { extractInformationUnits } from '../../_shared/unit-extraction.ts';

const TARGET_URL = 'https://www.bzbasel.ch/aargau/fricktal/zeiningen-steiner-logistic-ag-wird-uebernommen-ld.4158147';
const TEST_USER_ID = 'smoke-bz-subpage-storage';

Deno.test({
  name: 'BZ subpage storage writes the article URL, not the listing URL',
  ignore: Deno.env.get('RUN_BZ_STORAGE_SMOKE') !== 'true',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const supabase = createServiceClient();

    try {
      await cleanup(supabase);

      const scrape = await firecrawl.scrape({
        url: TARGET_URL,
        formats: ['markdown'],
        timeout: 60_000,
      });
      assert(scrape.success && scrape.markdown, scrape.error ?? 'BZ article scrape failed');

      const result = await extractInformationUnits(supabase, scrape.markdown, {
        userId: TEST_USER_ID,
        sourceUrl: TARGET_URL,
        location: null,
        locationMode: 'auto',
        locationFilterCity: 'Arlesheim',
      });

      assert(result.insertedCount + result.mergedExistingCount > 0, 'Expected one stored Arlesheim unit');

      const { data, error } = await supabase
        .from('information_units')
        .select('statement, source_url, article_url, is_listing_page, location')
        .eq('user_id', TEST_USER_ID)
        .ilike('statement', '%Arlesheim%');
      if (error) throw error;

      const rows = data ?? [];
      assert(rows.length > 0, 'Expected an Arlesheim information_unit row');
      assert(
        rows.some((row) =>
          row.source_url === TARGET_URL &&
          row.article_url === TARGET_URL &&
          row.is_listing_page === false
        ),
        `Expected source_url/article_url to be ${TARGET_URL}; got ${JSON.stringify(rows)}`,
      );
      assertEquals((rows[0].location as { city?: string } | null)?.city, 'arlesheim');
    } finally {
      await cleanup(supabase);
    }
  },
});

async function cleanup(supabase: ReturnType<typeof createServiceClient>): Promise<void> {
  const occurrence = await supabase
    .from('unit_occurrences')
    .delete()
    .eq('user_id', TEST_USER_ID);
  if (occurrence.error) throw occurrence.error;

  const units = await supabase
    .from('information_units')
    .delete()
    .eq('user_id', TEST_USER_ID);
  if (units.error) throw units.error;
}
