/**
 * Unit tests for _shared/prompts.ts.
 *
 * Covers the behaviour change in buildInformationSelectPrompt: it must always substitute
 * {{currentDate}} and {{recencyInstruction}} placeholders, including on custom templates
 * loaded from the user_prompts table. The PUT validator guarantees saved templates
 * contain both placeholders, so substitution on a custom template is the regression point
 * we care about.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  INFORMATION_SELECT_PROMPT,
  buildInformationSelectPrompt,
} from '../../_shared/prompts.ts';

Deno.test('buildInformationSelectPrompt substitutes both placeholders on default template', () => {
  const result = buildInformationSelectPrompt('2026-04-15', 7);
  assertStringIncludes(result, '2026-04-15');
  assertStringIncludes(result, 'der letzten 7 Tage');
  assert(!result.includes('{{currentDate}}'), 'currentDate placeholder should be replaced');
  assert(
    !result.includes('{{recencyInstruction}}'),
    'recencyInstruction placeholder should be replaced',
  );
});

Deno.test('buildInformationSelectPrompt uses null-recency instruction when recencyDays is null', () => {
  const result = buildInformationSelectPrompt('2026-04-15', null);
  assertStringIncludes(result, 'unabhängig vom Alter');
  assert(!result.includes('{{recencyInstruction}}'));
});

Deno.test('buildInformationSelectPrompt substitutes placeholders on custom template (DB override)', () => {
  const customTemplate = `Eigene Regeln: wähle die BESTEN Einheiten.
AKTUALITÄT: {{recencyInstruction}}
Heute: {{currentDate}}
Gib JSON zurück.`;

  const result = buildInformationSelectPrompt('2026-04-15', 3, customTemplate);

  assertStringIncludes(result, 'Eigene Regeln');
  assertStringIncludes(result, '2026-04-15');
  assertStringIncludes(result, 'der letzten 3 Tage');
  assert(!result.includes('{{currentDate}}'), 'custom template currentDate not replaced');
  assert(
    !result.includes('{{recencyInstruction}}'),
    'custom template recencyInstruction not replaced',
  );
});

Deno.test('buildInformationSelectPrompt default arg equals explicit INFORMATION_SELECT_PROMPT', () => {
  const implicit = buildInformationSelectPrompt('2026-04-15', 7);
  const explicit = buildInformationSelectPrompt('2026-04-15', 7, INFORMATION_SELECT_PROMPT);
  assertEquals(implicit, explicit);
});
