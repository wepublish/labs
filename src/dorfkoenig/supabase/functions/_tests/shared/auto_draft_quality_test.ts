import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  assessDraftQuality,
  resolveDraftRunContext,
  selectFallbackUnitIds,
} from '../../_shared/auto-draft-quality.ts';
import type { DraftV2 } from '../../_shared/draft-quality.ts';
import type { RankedSelectionUnit } from '../../_shared/selection-ranking.ts';

function ranked(overrides: Partial<RankedSelectionUnit> & { id: string; statement?: string }): RankedSelectionUnit {
  return {
    unit: {
      id: overrides.id,
      statement: overrides.statement ?? `Statement ${overrides.id}`,
      unit_type: 'event',
    },
    score: 80,
    mandatory: false,
    reasons: ['article_url'],
    ...overrides,
  } as RankedSelectionUnit;
}

function draft(overrides: Partial<DraftV2> = {}): DraftV2 {
  return {
    title: 'Arlesheim — Verkehr',
    bullets: [
      {
        emoji: '🚧',
        kind: 'lead',
        text: 'Die Birkenstrasse ist am Dienstag gesperrt, meldet die Gemeinde.',
        article_url: 'https://example.com/a',
        source_domain: 'Gemeinde',
        source_unit_ids: ['u1'],
      },
    ],
    notes_for_editor: [],
    ...overrides,
  };
}

Deno.test('resolveDraftRunContext — normal cron drafts for tomorrow', () => {
  assertEquals(resolveDraftRunContext({ zurichToday: '2026-05-05' }), {
    runDate: '2026-05-05',
    publicationDate: '2026-05-06',
    isBackfill: false,
  });
});

Deno.test('resolveDraftRunContext — backfill derives run date from publication date', () => {
  assertEquals(resolveDraftRunContext({
    zurichToday: '2026-05-05',
    requestedPublicationDate: '2026-05-04',
  }), {
    runDate: '2026-05-03',
    publicationDate: '2026-05-04',
    isBackfill: true,
  });
});

Deno.test('selectFallbackUnitIds — excludes weak, negative, and duplicate candidates', () => {
  const ids = selectFallbackUnitIds([
    ranked({ id: 'strong-1', score: 105, reasons: ['article_url'], statement: 'Am 9. Mai finden Arealführungen im Walzwerk statt.' }),
    ranked({ id: 'dupe', score: 100, reasons: ['article_url'], statement: 'Am 9. Mai 2026 findet im Walzwerk eine Arealführung statt.' }),
    ranked({ id: 'weak-url', score: 80, reasons: ['weak_url'] }),
    ranked({ id: 'negative', score: -20, reasons: ['stale', 'weak_url'] }),
    ranked({ id: 'strong-2', score: 95, reasons: ['public_safety'] }),
  ], 8);

  assertEquals(ids, ['strong-1', 'strong-2']);
});

Deno.test('assessDraftQuality — withholds title/body mismatch', () => {
  const result = assessDraftQuality({
    draft: draft({ title: 'Vollsperrungen, Landrat und Villa-Abbruch' }),
    selectedUnits: [],
    rankedSelection: [],
    selectedIds: [],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'title_body_mismatch'));
});

Deno.test('assessDraftQuality — withholds severe editor notes', () => {
  const result = assessDraftQuality({
    draft: draft({ notes_for_editor: ['Villa-Abbruch: Bitte verifizieren und URL ergänzen.'] }),
    selectedUnits: [],
    rankedSelection: [],
    selectedIds: [],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'withhold');
  assert(result.warnings.some((w) => w.reason === 'missing_required_context'));
});

Deno.test('assessDraftQuality — clean draft sends', () => {
  const result = assessDraftQuality({
    draft: draft({ title: 'Birkenstrasse gesperrt' }),
    selectedUnits: [{
      id: 'u1',
      statement: 'Am Dienstag ist die Birkenstrasse gesperrt.',
      unit_type: 'event',
      article_url: 'https://example.com/a',
      source_url: 'https://example.com/a',
    }],
    rankedSelection: [ranked({ id: 'u1', score: 100 })],
    selectedIds: ['u1'],
    context: resolveDraftRunContext({ zurichToday: '2026-05-05' }),
  });

  assertEquals(result.decision, 'send');
});
