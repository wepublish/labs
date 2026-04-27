import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { buildWebExtractionPrompt, WEB_EXTRACTION_PROMPT_VERSION } from '../../_shared/web-extraction-prompt.ts';
import { filterCriteriaMatchedWebUnits } from '../../_shared/unit-extraction.ts';

const matchingUnit = {
  statement: 'Der Gemeinderat Aesch bewilligte am 20. April 2026 einen Veloweg.',
  unitType: 'fact' as const,
  entities: ['Gemeinderat Aesch'],
  eventDate: '2026-04-20',
  village: 'aesch',
  villageConfidence: 'high' as const,
  villageEvidence: 'Gemeinderat Aesch bewilligte',
  publicationDate: '2026-04-21',
  sensitivity: 'none' as const,
  articleUrl: null,
};

Deno.test('buildWebExtractionPrompt includes criteriaMatch contract when criteria are present', () => {
  const { system } = buildWebExtractionPrompt({
    villageIds: ['aesch', 'reinach'],
    criteria: 'nur Velowege in Aesch',
    scrapeDate: '2026-04-27',
  });

  assertEquals(WEB_EXTRACTION_PROMPT_VERSION, 4);
  assertStringIncludes(system, 'KRITERIEN-HARTFILTER');
  assertStringIncludes(system, 'criteriaMatch:true');
  assertStringIncludes(system, '"criteriaMatch": true');
});

Deno.test('filterCriteriaMatchedWebUnits drops explicit non-matches when criteria are present', () => {
  const units = [
    { ...matchingUnit, criteriaMatch: true },
    {
      ...matchingUnit,
      statement: 'In Reinach findet am 21. April 2026 ein Konzert statt.',
      village: 'reinach',
      criteriaMatch: false,
    },
    {
      ...matchingUnit,
      statement: 'Legacy extractor output without criteriaMatch remains compatible.',
      criteriaMatch: undefined,
    },
  ];

  const filtered = filterCriteriaMatchedWebUnits(units, 'nur Velowege in Aesch');

  assertEquals(filtered.map((unit) => unit.statement), [
    'Der Gemeinderat Aesch bewilligte am 20. April 2026 einen Veloweg.',
    'Legacy extractor output without criteriaMatch remains compatible.',
  ]);
});

Deno.test('filterCriteriaMatchedWebUnits preserves all units when criteria are empty', () => {
  const units = [
    { ...matchingUnit, criteriaMatch: true },
    { ...matchingUnit, statement: 'Unrelated unit.', criteriaMatch: false },
  ];

  assertEquals(filterCriteriaMatchedWebUnits(units, '').length, 2);
  assertEquals(filterCriteriaMatchedWebUnits(units, null).length, 2);
});
