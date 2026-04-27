import { describe, expect, it, vi } from 'vitest';

import {
  isCliEntrypoint,
  isHistoricallyRelevant,
  mergeFeedbackExamples,
  parseArgs,
  renderExportMarkdown,
  type CandidateUnit,
  type DraftRow,
  type RegeneratedDraft,
} from '../../scripts/regenerate-past-drafts';

function unit(overrides: Partial<CandidateUnit> = {}): CandidateUnit {
  return {
    id: 'unit-1',
    statement: 'Die Gemeinde meldet eine Baustelle.',
    unit_type: 'fact',
    source_domain: 'Gemeinde Arlesheim',
    source_url: 'https://example.test/news',
    event_date: null,
    created_at: '2026-04-22T10:00:00Z',
    article_url: 'https://example.test/news',
    is_listing_page: false,
    quality_score: 80,
    sensitivity: 'none',
    location: { city: 'arlesheim' },
    village_confidence: 'high',
    publication_date: '2026-04-22',
    used_in_article: false,
    ...overrides,
  };
}

function draft(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: '12345678-1234-4234-9234-123456789abc',
    user_id: 'user-1',
    village_id: 'arlesheim',
    village_name: 'Arlesheim',
    title: 'Original',
    body: 'Original body',
    selected_unit_ids: ['unit-1'],
    publication_date: '2026-04-24',
    verification_status: 'ausstehend',
    schema_version: 1,
    bullets_json: null,
    provider: 'auto',
    published_at: null,
    created_at: '2026-04-24T10:00:00Z',
    ...overrides,
  };
}

function regenerated(overrides: Partial<RegeneratedDraft> = {}): RegeneratedDraft {
  return {
    title: 'Arlesheim - Freitag, 24. April 2026',
    body: '- 🚧 Die Baustelle beginnt heute.',
    draft: {
      title: 'Arlesheim - Freitag, 24. April 2026',
      bullets: [{
        emoji: '🚧',
        kind: 'lead',
        text: 'Die Baustelle beginnt heute.',
        article_url: null,
        source_domain: 'Gemeinde Arlesheim',
        source_unit_ids: ['unit-1'],
      }],
      notes_for_editor: [],
    },
    selectedUnitIds: ['unit-1'],
    units: [unit()],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
    ...overrides,
  };
}

describe('regenerate-past-drafts parseArgs', () => {
  it('parses a single-date export-only run with defaults', () => {
    expect(parseArgs(['--date', '2026-04-24'])).toMatchObject({
      from: '2026-04-24',
      to: '2026-04-24',
      villageIds: [],
      unitMode: 'same',
      outDir: 'exports/dorfkoenig-regenerated-drafts',
      exportMd: true,
      replaceDb: false,
      dryRun: false,
      minQuality: 40,
      useDbPrompt: false,
      maxUnits: 20,
    });
  });

  it('parses range, villages, better mode, and DB replacement options', () => {
    expect(parseArgs([
      '--from',
      '2026-04-20',
      '--to',
      '2026-04-24',
      '--village',
      'arlesheim,muenchenstein',
      '--unit-mode',
      'better',
      '--replace-db',
      '--no-export',
      '--min-quality',
      '55',
      '--max-units',
      '12',
      '--use-db-prompt',
      '--user-id',
      'user-1',
    ])).toMatchObject({
      from: '2026-04-20',
      to: '2026-04-24',
      villageIds: ['arlesheim', 'muenchenstein'],
      unitMode: 'better',
      exportMd: false,
      replaceDb: true,
      minQuality: 55,
      maxUnits: 12,
      useDbPrompt: true,
      userId: 'user-1',
    });
  });

  it('rejects unsafe no-op invocations', () => {
    expect(() => parseArgs(['--date', '2026-04-24', '--no-export']))
      .toThrow('Nothing to do');
  });

  it('rejects invalid dates and unknown villages', () => {
    expect(() => parseArgs(['--from', '2026-04-25', '--to', '2026-04-24']))
      .toThrow('--from must be <= --to');
    expect(() => parseArgs(['--date', '2026-04-24', '--village', 'unknown']))
      .toThrow('Unknown village id "unknown"');
  });
});

describe('historical candidate relevance', () => {
  it('keeps recent news and near-term events', () => {
    expect(isHistoricallyRelevant(unit({
      event_date: null,
      created_at: '2026-04-20T09:00:00Z',
    }), '2026-04-24', 40)).toBe(true);

    expect(isHistoricallyRelevant(unit({
      event_date: '2026-04-28',
      created_at: '2026-04-01T09:00:00Z',
    }), '2026-04-24', 40)).toBe(true);
  });

  it('drops stale news, far future events, low quality, and low confidence village matches', () => {
    expect(isHistoricallyRelevant(unit({
      event_date: null,
      created_at: '2026-04-10T09:00:00Z',
    }), '2026-04-24', 40)).toBe(false);

    expect(isHistoricallyRelevant(unit({
      event_date: '2026-05-10',
    }), '2026-04-24', 40)).toBe(false);

    expect(isHistoricallyRelevant(unit({
      quality_score: 39,
    }), '2026-04-24', 40)).toBe(false);

    expect(isHistoricallyRelevant(unit({
      village_confidence: 'low',
    }), '2026-04-24', 40)).toBe(false);
  });

  it('keeps sensitive units only when article publication is within three days', () => {
    expect(isHistoricallyRelevant(unit({
      sensitivity: 'crime',
      publication_date: '2026-04-22',
    }), '2026-04-24', 40)).toBe(true);

    expect(isHistoricallyRelevant(unit({
      sensitivity: 'crime',
      publication_date: '2026-04-20',
    }), '2026-04-24', 40)).toBe(false);

    expect(isHistoricallyRelevant(unit({
      sensitivity: 'crime',
      publication_date: null,
    }), '2026-04-24', 40)).toBe(false);
  });
});

describe('feedback examples and export rendering', () => {
  it('merges feedback examples ahead of static fallbacks and de-duplicates rows', () => {
    const examples = mergeFeedbackExamples([
      {
        kind: 'positive',
        bullet_text: '🏠 Gute lokale Meldung.',
        editor_reason: null,
        created_at: '2026-04-24T10:00:00Z',
      },
      {
        kind: 'positive',
        bullet_text: '🏠 Gute lokale Meldung.',
        editor_reason: null,
        created_at: '2026-04-24T10:00:00Z',
      },
      {
        kind: 'negative',
        bullet_text: 'Generischer Blick über die Gemeindegrenze.',
        editor_reason: 'Kein klarer Nutzen.',
        created_at: '2026-04-24T10:00:00Z',
      },
    ]);

    expect(examples.positiveExamples[0]).toEqual({
      bullet: '🏠 Gute lokale Meldung.',
      source_domain: 'Redaktionsbeispiel',
    });
    expect(examples.positiveExamples).toHaveLength(6);
    expect(examples.antiPatterns[0]).toEqual({
      bullet: 'Generischer Blick über die Gemeindegrenze.',
      reason: 'Kein klarer Nutzen.',
    });
  });

  it('renders markdown export with provenance, notes, and source units', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));

    const markdown = renderExportMarkdown(draft(), regenerated({
      draft: {
        ...regenerated().draft,
        notes_for_editor: ['Eine Quelle prüfen.'],
      },
    }));

    expect(markdown).toContain('source_draft_id: 12345678-1234-4234-9234-123456789abc');
    expect(markdown).toContain('generated_at: 2026-04-27T12:00:00.000Z');
    expect(markdown).toContain('# Arlesheim - Freitag, 24. April 2026');
    expect(markdown).toContain('- 🚧 Die Baustelle beginnt heute.');
    expect(markdown).toContain('- Eine Quelle prüfen.');
    expect(markdown).toContain('- unit-1: Die Gemeinde meldet eine Baustelle.');

    vi.useRealTimers();
  });
});

describe('CLI entrypoint guard', () => {
  it('does not treat normal imports as CLI execution', () => {
    expect(isCliEntrypoint('file:///repo/src/script.ts', ['node', '/repo/src/other.ts'])).toBe(false);
  });

  it('detects direct CLI execution', () => {
    expect(isCliEntrypoint('file:///repo/src/script.ts', ['node', '/repo/src/script.ts'])).toBe(true);
  });
});
