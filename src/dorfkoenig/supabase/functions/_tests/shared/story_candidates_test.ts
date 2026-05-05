import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { prepareUnitsForCompose } from '../../_shared/story-candidates.ts';
import type { UnitForCompose } from '../../_shared/compose-draft.ts';
import type { RankedSelectionUnit } from '../../_shared/selection-ranking.ts';

function unit(id: string, statement: string): UnitForCompose {
  return {
    id,
    statement,
    unit_type: 'fact',
    source_domain: 'wochenblatt.ch',
    source_url: 'https://www.wochenblatt.ch/',
    article_url: 'https://www.wochenblatt.ch/',
  };
}

function ranked(id: string, score: number, reasons: string[] = []): RankedSelectionUnit {
  return {
    unit: { id, statement: id, unit_type: 'fact' },
    score,
    mandatory: false,
    reasons,
  };
}

Deno.test('prepareUnitsForCompose folds related fragments into one story candidate', () => {
  const result = prepareUnitsForCompose([
    unit('lead', 'Michael Honegger übernimmt den Sitz von Miriam Locher.'),
    unit('support', 'Michael Honegger wird am 7. Mai im Landrat angelobt.'),
  ], [
    ranked('lead', 120),
    ranked('support', 105),
  ]);

  assertEquals(result.length, 1);
  assertEquals(result[0].id, 'lead');
  assertEquals(result[0].statement.includes('Zusatzkontext'), true);
});

Deno.test('prepareUnitsForCompose drops context-only selected units', () => {
  const result = prepareUnitsForCompose([
    unit('lead', 'Die Birkenstrasse wird am Dienstag vollgesperrt.'),
    unit('support', 'Die Haltestelle für die Anreise ist Stollenrain.'),
  ], [
    ranked('lead', 120),
    ranked('support', 90, ['supporting_fragment']),
  ]);

  assertEquals(result.map((u) => u.id), ['lead']);
});

