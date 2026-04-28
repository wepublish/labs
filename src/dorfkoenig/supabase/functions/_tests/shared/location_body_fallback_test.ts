import {
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import { extractBodySupportedLocationFacts } from '../../_shared/location-body-fallback.ts';

Deno.test('extractBodySupportedLocationFacts keeps the BZ Arlesheim body fact', () => {
  const markdown = `
Die Felix Transport AG übernimmt die Steiner Logistic AG in Zeiningen.

Die Felix Transport AG betreibt Standorte in Arlesheim BL und Zwingen BL und beschäftigt 130 Mitarbeitende.

##### Mehr zum Thema

In Arlesheim findet ein anderer Anlass statt.
`;

  const facts = extractBodySupportedLocationFacts(markdown, 'Arlesheim');

  assertEquals(facts.length, 1);
  assertEquals(
    facts[0].statement,
    'Die Felix Transport AG betreibt Standorte in Arlesheim BL und Zwingen BL und beschäftigt 130 Mitarbeitende.',
  );
  assertEquals(facts[0].cityId, 'arlesheim');
});

Deno.test('extractBodySupportedLocationFacts ignores thin incidental mentions', () => {
  const markdown = 'Ein Arlesheimer Besucher war am Fest in Aesch anwesend.';

  assertEquals(extractBodySupportedLocationFacts(markdown, 'Arlesheim'), []);
});
