import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { filterSubpageUrls, isLikelyArticleUrl, looksLikeListingPage } from '../../_shared/subpage-filter.ts';

const INDEX = 'https://www.example.ch/news/press-releases/';

Deno.test('filterSubpageUrls keeps URLs under the index path', () => {
  const input = [
    'https://www.example.ch/news/press-releases/one',
    'https://www.example.ch/news/press-releases/two',
  ];
  assertEquals(filterSubpageUrls(input, INDEX), input);
});

Deno.test('filterSubpageUrls drops URLs outside the index path', () => {
  const input = [
    'https://www.example.ch/news/press-releases/keep',
    'https://www.example.ch/contact',
    'https://www.example.ch/news/other-section/item',
    'https://www.example.ch/',
  ];
  assertEquals(filterSubpageUrls(input, INDEX), [
    'https://www.example.ch/news/press-releases/keep',
  ]);
});

Deno.test('filterSubpageUrls keeps CH Media article routes outside listing path', () => {
  const index = 'https://www.bzbasel.ch/gemeinde/arlesheim-4144';
  const article = 'https://www.bzbasel.ch/aargau/fricktal/zeiningen-steiner-logistic-ag-wird-uebernommen-ld.4158147';
  const input = [
    article,
    'https://www.bzbasel.ch/kontakt',
  ];
  assertEquals(filterSubpageUrls(input, index), [article]);
});

Deno.test('isLikelyArticleUrl detects BZ ld article slug', () => {
  assertEquals(
    isLikelyArticleUrl('https://www.bzbasel.ch/aargau/fricktal/zeiningen-steiner-logistic-ag-wird-uebernommen-ld.4158147'),
    true,
  );
  assertEquals(isLikelyArticleUrl('https://www.bzbasel.ch/gemeinde/arlesheim-4144'), false);
});

Deno.test('looksLikeListingPage flags BZ village listing but not article pages', () => {
  const candidate = 'https://www.bzbasel.ch/aargau/fricktal/zeiningen-steiner-logistic-ag-wird-uebernommen-ld.4158147';
  assertEquals(looksLikeListingPage('https://www.bzbasel.ch/gemeinde/arlesheim-4144', [candidate]), true);
  assertEquals(looksLikeListingPage(candidate, ['https://www.bzbasel.ch/aargau/fricktal/related-ld.4159000']), false);
});

Deno.test('filterSubpageUrls requires a path-segment separator (no prefix-only match)', () => {
  // Path that starts with the same bytes but is a sibling route, not a child.
  const input = ['https://www.example.ch/news/press-releases-archive/2024'];
  assertEquals(filterSubpageUrls(input, INDEX), []);
});

Deno.test('filterSubpageUrls blocks path traversal', () => {
  const input = [
    'https://www.example.ch/news/press-releases/../admin',
    'https://www.example.ch/news/press-releases/%2e%2e/admin',
    'https://www.example.ch/news/press-releases/%2E%2E/admin',
  ];
  assertEquals(filterSubpageUrls(input, INDEX), []);
});

Deno.test('filterSubpageUrls rejects IP hosts and localhost via validateDomain', () => {
  // Path-prefix matches but the host is an IP / localhost → reject.
  const input = [
    'http://127.0.0.1/news/press-releases/leak',
    'http://localhost/news/press-releases/leak',
    'http://169.254.169.254/news/press-releases/leak',
  ];
  assertEquals(filterSubpageUrls(input, INDEX), []);
});

Deno.test('filterSubpageUrls rejects different valid hosts', () => {
  const input = ['https://www.other-example.ch/news/press-releases/ok'];
  assertEquals(filterSubpageUrls(input, INDEX), []);
});

Deno.test('filterSubpageUrls skips unparseable URLs', () => {
  const input = ['not-a-url', 'https://www.example.ch/news/press-releases/ok'];
  assertEquals(filterSubpageUrls(input, INDEX), [
    'https://www.example.ch/news/press-releases/ok',
  ]);
});

Deno.test('filterSubpageUrls returns empty when indexUrl is unparseable', () => {
  const input = ['https://www.example.ch/news/press-releases/ok'];
  assertEquals(filterSubpageUrls(input, 'not-a-url'), []);
});

Deno.test('filterSubpageUrls tolerates trailing slashes on the index URL', () => {
  const ok = 'https://www.example.ch/news/press-releases/item';
  assertEquals(filterSubpageUrls([ok], 'https://www.example.ch/news/press-releases'), [ok]);
  assertEquals(filterSubpageUrls([ok], 'https://www.example.ch/news/press-releases/'), [ok]);
  assertEquals(filterSubpageUrls([ok], 'https://www.example.ch/news/press-releases//'), [ok]);
});
