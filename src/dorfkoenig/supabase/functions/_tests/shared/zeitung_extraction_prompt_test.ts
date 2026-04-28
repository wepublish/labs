import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  buildNewspaperExtractionPrompt,
  CONTENT_RANKING,
  NEWSPAPER_EXTRACTION_PROMPT_VERSION,
} from '../../_shared/zeitung-extraction-prompt.ts';

Deno.test('newspaper extraction prompt treats public safety as high-priority content', () => {
  const ranking = CONTENT_RANKING.find((row) => row.key === 'public_safety');
  assertEquals(ranking?.priority, 'high');
  assertEquals(ranking?.include, true);

  const { system } = buildNewspaperExtractionPrompt(['Arlesheim'], '2026-04-28');
  assert(system.includes('Polizei'));
  assert(system.includes('Unfälle'));
  assert(system.includes('public_safety'));
  assert(NEWSPAPER_EXTRACTION_PROMPT_VERSION >= 3);
});
