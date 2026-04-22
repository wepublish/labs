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
