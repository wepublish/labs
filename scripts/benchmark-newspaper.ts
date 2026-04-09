#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write

/**
 * Newspaper PDF Extraction Benchmark
 *
 * Tests the full extraction pipeline locally without deploying.
 * Imports the actual zeitung-extraction-prompt.ts for prompt consistency.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write scripts/benchmark-newspaper.ts \
 *     --pdf /path/to/newspaper.pdf \
 *     --firecrawl-key fc-xxx \
 *     --openrouter-key sk-or-xxx \
 *     [--publication-date 2026-03-19] \
 *     [--url https://example.com/newspaper.pdf]
 */

import {
  buildNewspaperExtractionPrompt,
  preprocessMarkdown,
  chunkNewspaperMarkdown,
  isLikelyJunkChunk,
  type ExtractionResult,
} from '../src/dorfkoenig/supabase/functions/_shared/zeitung-extraction-prompt.ts';

const VILLAGES = [
  'Aesch', 'Allschwil', 'Arlesheim', 'Binningen', 'Bottmingen',
  'Münchenstein', 'Muttenz', 'Pratteln', 'Reinach', 'Riehen',
];

// ── Parse CLI args ──

function parseArgs(): {
  pdfPath?: string;
  firecrawlKey: string;
  openrouterKey: string;
  publicationDate: string;
  url?: string;
} {
  const args = Deno.args;
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    parsed[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return {
    pdfPath: parsed['pdf'],
    firecrawlKey: parsed['firecrawl-key'] || Deno.env.get('FIRECRAWL_API_KEY') || '',
    openrouterKey: parsed['openrouter-key'] || Deno.env.get('OPENROUTER_API_KEY') || '',
    publicationDate: parsed['publication-date'] || new Date().toISOString().slice(0, 10),
    url: parsed['url'],
  };
}

// ── Firecrawl scrape ──

async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  const resp = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  });

  const raw = await resp.text();
  // Strip control characters except whitespace (eslint no-control-regex safe)
  const cleaned = raw.replace(/[^\P{Cc}\n\r\t]/gu, '');
  const data = JSON.parse(cleaned);

  if (!data.success || !data.data?.markdown) {
    throw new Error(`Firecrawl failed: ${data.error || 'no markdown'}`);
  }
  return data.data.markdown;
}

// ── OpenRouter LLM call ──

async function llmExtract(
  system: string,
  userMessage: string,
  apiKey: string,
): Promise<ExtractionResult> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No LLM response');
  return JSON.parse(content);
}

// ── Upload to tmpfiles.org ──

async function uploadToTmpFiles(pdfPath: string): Promise<string> {
  const file = await Deno.readFile(pdfPath);
  const form = new FormData();
  form.append('file', new Blob([file], { type: 'application/pdf' }), 'newspaper.pdf');

  const resp = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: form,
  });
  const data = await resp.json();
  const url = data.data?.url as string;
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

// ── Main ──

async function main() {
  const config = parseArgs();

  if (!config.firecrawlKey || !config.openrouterKey) {
    console.error('Missing --firecrawl-key or --openrouter-key');
    Deno.exit(1);
  }

  if (!config.pdfPath && !config.url) {
    console.error('Provide --pdf /path/to/file.pdf or --url https://...');
    Deno.exit(1);
  }

  console.log('=== Newspaper PDF Extraction Benchmark ===\n');

  // Step 1: Get URL
  let url = config.url;
  if (!url) {
    console.log(`Uploading ${config.pdfPath} to tmpfiles.org...`);
    url = await uploadToTmpFiles(config.pdfPath!);
    console.log(`URL: ${url}\n`);
  }

  // Step 2: Firecrawl parse
  console.log('Parsing PDF via Firecrawl...');
  const startParse = Date.now();
  const markdown = await firecrawlScrape(url, config.firecrawlKey);
  const parseDuration = ((Date.now() - startParse) / 1000).toFixed(1);
  console.log(`  Parsed: ${markdown.length} chars in ${parseDuration}s\n`);

  // Step 3: Preprocess
  const cleaned = preprocessMarkdown(markdown);
  console.log(`  After preprocessing: ${cleaned.length} chars\n`);

  // Step 4: Chunk
  const allChunks = chunkNewspaperMarkdown(cleaned);
  const validChunks = allChunks.filter((c) => !isLikelyJunkChunk(c));
  const junkCount = allChunks.length - validChunks.length;
  console.log(`  Chunks: ${allChunks.length} total, ${junkCount} filtered as junk, ${validChunks.length} valid\n`);

  // Step 5: LLM extraction
  const { system, buildUserMessage } = buildNewspaperExtractionPrompt(VILLAGES, config.publicationDate);
  const allUnits: ExtractionResult['units'] = [];
  const allSkipped: string[] = [];

  for (let i = 0; i < validChunks.length; i++) {
    console.log(`  Extracting chunk ${i + 1}/${validChunks.length} (${validChunks[i].length} chars)...`);
    try {
      const result = await llmExtract(system, buildUserMessage(validChunks[i]), config.openrouterKey);
      if (result.units) allUnits.push(...result.units);
      if (result.skipped) allSkipped.push(...result.skipped);
      console.log(`    → ${result.units?.length || 0} units, ${result.skipped?.length || 0} skipped`);
    } catch (err) {
      console.error(`    → ERROR: ${(err as Error).message}`);
    }
  }

  // Step 6: Report
  console.log('\n=== RESULTS ===\n');
  console.log(`Total units extracted: ${allUnits.length}`);
  console.log(`Total skipped items: ${allSkipped.length}\n`);

  // By village
  const byVillage: Record<string, number> = {};
  const nullVillage = allUnits.filter((u) => !u.village).length;
  for (const unit of allUnits) {
    if (unit.village) byVillage[unit.village] = (byVillage[unit.village] || 0) + 1;
  }
  console.log('Units by village:');
  for (const [village, count] of Object.entries(byVillage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${village}: ${count}`);
  }
  if (nullVillage > 0) console.log(`  (no village): ${nullVillage}`);

  // By priority
  const byPriority: Record<string, number> = {};
  for (const unit of allUnits) {
    byPriority[unit.priority] = (byPriority[unit.priority] || 0) + 1;
  }
  console.log('\nUnits by priority:');
  for (const [priority, count] of Object.entries(byPriority)) {
    console.log(`  ${priority}: ${count}`);
  }

  // By category
  const byCategory: Record<string, number> = {};
  for (const unit of allUnits) {
    byCategory[unit.category] = (byCategory[unit.category] || 0) + 1;
  }
  console.log('\nUnits by category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Unit table
  console.log('\n=== EXTRACTED UNITS ===\n');
  console.log('| Village | Priority | Date | Statement |');
  console.log('|---------|----------|------|-----------|');
  for (const unit of allUnits) {
    const village = unit.village || '-';
    const date = unit.eventDate || '-';
    const stmt = unit.statement.length > 80 ? unit.statement.slice(0, 80) + '...' : unit.statement;
    console.log(`| ${village} | ${unit.priority} | ${date} | ${stmt} |`);
  }

  // Skipped items
  if (allSkipped.length > 0) {
    console.log('\n=== SKIPPED ITEMS ===\n');
    for (const item of allSkipped) {
      console.log(`  - ${item}`);
    }
  }

  // Save full results
  const outputPath = 'scripts/benchmark-output/benchmark-results.json';
  await Deno.writeTextFile(outputPath, JSON.stringify({ units: allUnits, skipped: allSkipped }, null, 2));
  console.log(`\nFull results saved to ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  Deno.exit(1);
});
