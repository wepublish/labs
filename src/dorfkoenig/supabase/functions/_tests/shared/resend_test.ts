import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { buildScoutAlertEmail, sendEmail } from '../../_shared/resend.ts';

// --- buildScoutAlertEmail (pure function tests) ---

Deno.test('buildScoutAlertEmail output contains scout name', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Gemeinderat Bern',
    summary: 'Neue Sitzung angekuendigt',
    keyFindings: ['Punkt eins'],
    sourceUrl: 'https://example.com',
  });

  assertStringIncludes(html, 'Gemeinderat Bern');
});

Deno.test('buildScoutAlertEmail output contains summary text', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Wichtige Aenderungen im Stadtrat',
    keyFindings: [],
    sourceUrl: 'https://example.com',
  });

  assertStringIncludes(html, 'Wichtige Aenderungen im Stadtrat');
});

Deno.test('buildScoutAlertEmail output contains key findings as list items', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Summary',
    keyFindings: ['Erster Punkt', 'Zweiter Punkt', 'Dritter Punkt'],
    sourceUrl: 'https://example.com',
  });

  assertStringIncludes(html, '<li>Erster Punkt</li>');
  assertStringIncludes(html, '<li>Zweiter Punkt</li>');
  assertStringIncludes(html, '<li>Dritter Punkt</li>');
});

Deno.test('buildScoutAlertEmail output contains source URL as link', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Summary',
    keyFindings: [],
    sourceUrl: 'https://www.stadt-bern.ch/news',
  });

  assertStringIncludes(html, 'href="https://www.stadt-bern.ch/news"');
});

Deno.test('buildScoutAlertEmail includes location when provided', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Summary',
    keyFindings: [],
    sourceUrl: 'https://example.com',
    locationCity: 'Bern',
  });

  assertStringIncludes(html, '(Bern)');
});

Deno.test('buildScoutAlertEmail omits location label when not provided', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'My Scout',
    summary: 'Summary',
    keyFindings: [],
    sourceUrl: 'https://example.com',
  });

  // The subtitle line should contain the scout name without any location suffix
  assertStringIncludes(html, 'My Scout');
  // Extract the subtitle element content and verify no location is appended
  const subtitleMatch = html.match(/<p class="subtitle">(.*?)<\/p>/s);
  assertExists(subtitleMatch);
  assertEquals(subtitleMatch![1].trim(), 'My Scout');
});

Deno.test('buildScoutAlertEmail omits Kernpunkte section when keyFindings is empty', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Summary',
    keyFindings: [],
    sourceUrl: 'https://example.com',
  });

  assertEquals(html.includes('Kernpunkte'), false);
  assertEquals(html.includes('<ul>'), false);
});

Deno.test('buildScoutAlertEmail includes Kernpunkte section when keyFindings has items', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Summary',
    keyFindings: ['Finding one'],
    sourceUrl: 'https://example.com',
  });

  assertStringIncludes(html, 'Kernpunkte');
  assertStringIncludes(html, '<ul>');
  assertStringIncludes(html, '<li>Finding one</li>');
});

Deno.test('buildScoutAlertEmail produces valid HTML document', () => {
  const html = buildScoutAlertEmail({
    scoutName: 'Test Scout',
    summary: 'Summary',
    keyFindings: [],
    sourceUrl: 'https://example.com',
  });

  assertStringIncludes(html, '<!DOCTYPE html>');
  assertStringIncludes(html, '<html lang="de">');
  assertStringIncludes(html, '</html>');
});

// --- sendEmail (integration test) ---

Deno.test({
  name: 'sendEmail to delivered@resend.dev returns success or graceful error',
  ignore: !Deno.env.get('RESEND_API_KEY'),
  async fn() {
    const result = await sendEmail({
      to: 'delivered@resend.dev',
      subject: 'Test Email from coJournalist-Lite',
      html: '<p>This is a test email.</p>',
    });

    assertExists(result);
    assertEquals(typeof result.success, 'boolean');

    if (result.success) {
      assertExists(result.id);
      assertEquals(typeof result.id, 'string');
    } else {
      // If API rejects (e.g. rate limit), error should be a string
      assertExists(result.error);
      assertEquals(typeof result.error, 'string');
    }
  },
});
