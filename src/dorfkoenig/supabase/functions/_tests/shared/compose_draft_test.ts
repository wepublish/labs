/**
 * Unit tests for _shared/compose-draft.ts.
 *
 * Golden-path regression check for the Phase 0 refactor (specs/DRAFT_QUALITY.md §4.3):
 * the extracted pure function must produce byte-identical markdown to the inline
 * rendering that lived in bajour-auto-draft/index.ts pre-refactor.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { renderDraftToMarkdown } from '../../_shared/compose-draft.ts';

/**
 * This exact rendering logic lived inline in bajour-auto-draft/index.ts before the refactor.
 * Kept here as the oracle — if renderDraftToMarkdown diverges, this test fails.
 */
function renderDraftToMarkdown_oracle(draft: {
  greeting?: string;
  sections?: { heading: string; body: string }[];
  outlook?: string;
  sign_off?: string;
}): string {
  let body_md = '';
  if (draft.greeting) body_md += `${draft.greeting}\n\n`;
  for (const section of draft.sections || []) {
    body_md += `## ${section.heading}\n\n${section.body}\n\n`;
  }
  if (draft.outlook) body_md += `## Ausblick\n\n${draft.outlook}\n\n`;
  if (draft.sign_off) body_md += `---\n\n${draft.sign_off}`;
  return body_md.trim();
}

Deno.test('renderDraftToMarkdown — full draft matches pre-refactor oracle byte-for-byte', () => {
  const draft = {
    title: 'Arlesheim Wochenüberblick',
    greeting: 'Liebe Arlesheimerinnen und Arlesheimer',
    sections: [
      { heading: 'Aus dem Gemeinderat', body: 'Der Gemeinderat ist wieder komplett.' },
      { heading: 'Veranstaltungen', body: 'Am 22. April findet die Industrienacht statt.' },
    ],
    outlook: 'Nächste Woche stehen spannende Veranstaltungen an.',
    sign_off: 'Ihre Redaktion',
  };
  const actual = renderDraftToMarkdown(draft);
  const expected = renderDraftToMarkdown_oracle(draft).trim();
  assertEquals(actual, expected);
});

Deno.test('renderDraftToMarkdown — empty draft renders empty string', () => {
  assertEquals(renderDraftToMarkdown({}), '');
});

Deno.test('renderDraftToMarkdown — greeting only', () => {
  const draft = { greeting: 'Hallo' };
  assertEquals(renderDraftToMarkdown(draft), 'Hallo');
});

Deno.test('renderDraftToMarkdown — sections without greeting/outlook/sign_off', () => {
  const draft = {
    sections: [
      { heading: 'News', body: 'Etwas ist passiert.' },
    ],
  };
  const result = renderDraftToMarkdown(draft);
  assertStringIncludes(result, '## News');
  assertStringIncludes(result, 'Etwas ist passiert.');
  assertEquals(result, renderDraftToMarkdown_oracle(draft).trim());
});

Deno.test('renderDraftToMarkdown — outlook renders as ## Ausblick section', () => {
  const draft = {
    sections: [{ heading: 'Heute', body: 'Kurz.' }],
    outlook: 'Morgen mehr.',
  };
  const result = renderDraftToMarkdown(draft);
  assertStringIncludes(result, '## Ausblick\n\nMorgen mehr.');
});

Deno.test('renderDraftToMarkdown — sign_off rendered after --- separator', () => {
  const draft = {
    greeting: 'Hi',
    sign_off: 'Tschüss',
  };
  const result = renderDraftToMarkdown(draft);
  assertStringIncludes(result, '---\n\nTschüss');
});

Deno.test('renderDraftToMarkdown — large draft stays identical to oracle', () => {
  // Randomized structure; oracle is the ground truth
  const draft = {
    greeting: 'Begrüssung',
    sections: Array.from({ length: 5 }, (_, i) => ({
      heading: `Abschnitt ${i + 1}`,
      body: `Inhalt mit **Fettschrift** und [Link](https://example.com/${i}).`,
    })),
    outlook: 'Next week',
    sign_off: 'End',
  };
  assertEquals(renderDraftToMarkdown(draft), renderDraftToMarkdown_oracle(draft).trim());
});

// ── parseLlmJson — tolerant extractor (fallback only; v2 happy path uses tool_use) ──

import {
  composeDraftFromUnitsV2,
  parseLlmJson,
} from '../../_shared/compose-draft.ts';
import { openrouter } from '../../_shared/openrouter.ts';
import { assertThrows } from 'https://deno.land/std@0.220.0/assert/mod.ts';

Deno.test('parseLlmJson — pure JSON parses unchanged', () => {
  assertEquals(parseLlmJson('{"bullets":[{"text":"a"}]}', 'v2'), {
    bullets: [{ text: 'a' }],
  });
});

Deno.test('parseLlmJson — fenced block with json tag', () => {
  assertEquals(parseLlmJson('```json\n{"bullets":[]}\n```', 'v2'), {
    bullets: [],
  });
});

Deno.test('parseLlmJson — fenced block preceded by German preamble', () => {
  const raw = 'Hier ist der Newsletter:\n\n```json\n{"title":"X","bullets":[]}\n```';
  assertEquals(parseLlmJson(raw, 'v2'), { title: 'X', bullets: [] });
});

Deno.test('parseLlmJson — fenced block without language tag', () => {
  assertEquals(parseLlmJson('```\n{"title":"Y"}\n```', 'v2'), { title: 'Y' });
});

Deno.test('parseLlmJson — first-brace/last-brace fallback when no fence', () => {
  const raw = 'preamble text {"title":"Z","bullets":[]} trailing commentary';
  assertEquals(parseLlmJson(raw, 'v2'), { title: 'Z', bullets: [] });
});

Deno.test('parseLlmJson — unparseable garbage throws with legacy v2 error substring', () => {
  assertThrows(
    () => parseLlmJson('totally not json', 'v2'),
    Error,
    'Failed to parse compose LLM response (v2)',
  );
});

Deno.test('parseLlmJson — unparseable garbage throws with legacy v1 error substring', () => {
  assertThrows(
    () => parseLlmJson('also not json', 'v1'),
    Error,
    'Failed to parse draft generation LLM response',
  );
});

// ── composeDraftFromUnitsV2 — tool-use happy path (real regression test) ──
// This is the path that failed in production (2026-04-22, run #90/#92/#95):
// Claude returned Markdown instead of JSON despite response_format:json_object.
// Switching to tool-use forces schema-validated JSON arguments. We stub the
// openrouter client and assert the tool_call is extracted and parsed correctly.

Deno.test('composeDraftFromUnitsV2 — extracts submit_digest tool_call arguments', async () => {
  const originalChat = openrouter.chat;
  try {
    // Replace the client with a stub that returns an Anthropic-style tool_call
    // (this is what OpenRouter emits for claude-*-* when tool_choice is set).
    openrouter.chat = ((_opts) =>
      Promise.resolve({
        id: 'test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: {
                    name: 'submit_digest',
                    arguments: JSON.stringify({
                      title: 'Arlesheim — KW 17',
                      bullets: [
                        {
                          emoji: '📍',
                          kind: 'secondary',
                          text: 'Gesundheitsforum im Setzwerk.',
                          article_url: null,
                          source_domain: null,
                          source_unit_ids: ['u1'],
                        },
                      ],
                      notes_for_editor: [],
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof openrouter.chat;

    const { draft } = await composeDraftFromUnitsV2({
      village_id: 'arlesheim',
      village_name: 'Arlesheim',
      selected_units: [
        {
          id: 'u1',
          statement: 'Gesundheitsforum im Setzwerk.',
          unit_type: 'event',
          source_domain: 'example.ch',
          source_url: 'https://example.ch/a',
        },
      ],
    });

    assertEquals(draft.title, 'Arlesheim — KW 17');
    assertEquals(draft.bullets.length, 1);
    assertEquals(draft.bullets[0].text, 'Gesundheitsforum im Setzwerk.');
  } finally {
    openrouter.chat = originalChat;
  }
});

Deno.test('composeDraftFromUnitsV2 — repairs missing article_url from source_unit_ids', async () => {
  const originalChat = openrouter.chat;
  try {
    openrouter.chat = ((_opts) =>
      Promise.resolve({
        id: 'test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: {
                    name: 'submit_digest',
                    arguments: JSON.stringify({
                      title: 'Arlesheim — KW 17',
                      bullets: [
                        {
                          emoji: '🚧',
                          kind: 'event',
                          text: 'Morgen ist die Birkenstrasse voll gesperrt.',
                          article_url: null,
                          source_domain: 'Gemeinde Arlesheim',
                          source_unit_ids: ['u1'],
                        },
                      ],
                      notes_for_editor: [],
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof openrouter.chat;

    const { draft } = await composeDraftFromUnitsV2({
      village_id: 'arlesheim',
      village_name: 'Arlesheim',
      selected_units: [
        {
          id: 'u1',
          statement: 'Am 5. Mai zwischen 8 und 17 Uhr findet eine Vollsperrung der Birkenstrasse statt.',
          unit_type: 'event',
          source_domain: 'Gemeinde Arlesheim',
          source_url: 'https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php',
          article_url: 'https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php',
          is_listing_page: false,
        },
      ],
    });

    assertEquals(draft.bullets[0].article_url, 'https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php');
    assertStringIncludes(
      draft.bullets[0].text,
      '[Gemeinde Arlesheim](https://www.arlesheim.ch/de/aktuelles/baustelleninfo.php)',
    );
  } finally {
    openrouter.chat = originalChat;
  }
});

Deno.test('composeDraftFromUnitsV2 — falls back to text content when provider ignores tool_choice', async () => {
  const originalChat = openrouter.chat;
  try {
    openrouter.chat = ((_opts) =>
      Promise.resolve({
        id: 'test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                'Hier ist der Digest:\n\n```json\n{"title":"Fallback","bullets":[],"notes_for_editor":[]}\n```',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof openrouter.chat;

    const { draft } = await composeDraftFromUnitsV2({
      village_id: 'arlesheim',
      village_name: 'Arlesheim',
      selected_units: [],
    });

    assertEquals(draft.title, 'Fallback');
    assertEquals(draft.bullets.length, 0);
  } finally {
    openrouter.chat = originalChat;
  }
});

Deno.test('composeDraftFromUnitsV2 — regression: markdown-only response throws with diagnostics', async () => {
  // Exactly the production failure mode (run #95, Arlesheim 15:44 UTC):
  // Claude emitted Markdown, no tool_call, no JSON, no fences.
  const originalChat = openrouter.chat;
  try {
    openrouter.chat = ((_opts) =>
      Promise.resolve({
        id: 'test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                '# Wochen-Newsletter Arlesheim **KW 17 | 22. April 2026** --- ## 🎭 Veranstaltungen diese Woche',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof openrouter.chat;

    let thrown: Error | null = null;
    try {
      await composeDraftFromUnitsV2({
        village_id: 'arlesheim',
        village_name: 'Arlesheim',
        selected_units: [],
        ctx: { village_id: 'arlesheim', run_id: 95 },
      });
    } catch (e) {
      thrown = e as Error;
    }
    if (!thrown) throw new Error('expected composeDraftFromUnitsV2 to throw');
    assertStringIncludes(thrown.message, 'Failed to parse compose LLM response (v2)');
    assertStringIncludes(thrown.message, 'Wochen-Newsletter Arlesheim');
  } finally {
    openrouter.chat = originalChat;
  }
});
