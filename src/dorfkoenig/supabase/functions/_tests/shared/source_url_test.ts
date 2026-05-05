import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';

import { isArticleLevelUrl } from '../../_shared/source-url.ts';

Deno.test('isArticleLevelUrl rejects homepages and generic listing paths', () => {
  assertEquals(isArticleLevelUrl('https://www.wochenblatt.ch/'), false);
  assertEquals(isArticleLevelUrl('https://www.bzbasel.ch'), false);
  assertEquals(isArticleLevelUrl('https://example.com/news/'), false);
});

Deno.test('isArticleLevelUrl accepts concrete article-like paths', () => {
  assertEquals(isArticleLevelUrl('https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php'), true);
  assertEquals(isArticleLevelUrl('https://example.com/2026/05/04/local-story'), true);
});
