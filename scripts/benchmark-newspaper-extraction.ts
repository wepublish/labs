/**
 * Deno sidecar for scripts/benchmark-newspaper-extraction.sh.
 * Mirrors production: uploads PDF to Supabase Storage, scrapes via Firecrawl
 * (pdfMode: 'fast'), then runs the exact production extraction pipeline
 * (preprocess → chunk → junk filter → LLM).
 *
 * Reads env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRECRAWL_API_KEY,
 * OPENROUTER_API_KEY. The bash wrapper loads these from .env before exec.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  buildNewspaperExtractionPrompt,
  chunkNewspaperMarkdown,
  type ExtractionResult,
  type ExtractionUnit,
  isLikelyJunkChunk,
  preprocessMarkdown,
} from '../src/dorfkoenig/supabase/functions/_shared/zeitung-extraction-prompt.ts';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`${name} not set in env`);
    Deno.exit(1);
  }
  return v;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const FIRECRAWL_API_KEY = requireEnv('FIRECRAWL_API_KEY');
const OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY');

const [pdfPath, outDir] = Deno.args;
if (!pdfPath || !outDir) {
  console.error('Usage: deno run benchmark-newspaper-extraction.ts <pdf_path> <out_dir>');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Upload PDF to Supabase Storage under a benchmark/ prefix.
const filename = pdfPath.split('/').pop() ?? 'input.pdf';
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const storagePath = `benchmark/${ts}-${filename}`;
console.log(`Uploading ${pdfPath} → uploads/${storagePath}`);
const fileBytes = await Deno.readFile(pdfPath);
const { error: uploadErr } = await supabase.storage
  .from('uploads')
  .upload(storagePath, fileBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
if (uploadErr) {
  console.error('Upload failed:', uploadErr.message);
  Deno.exit(1);
}

// Register cleanup to remove the uploaded file on exit.
const cleanup = async () => {
  const { error } = await supabase.storage.from('uploads').remove([storagePath]);
  if (error) console.error(`Cleanup: failed to remove ${storagePath}: ${error.message}`);
  else console.log(`Cleanup: removed uploads/${storagePath}`);
};
globalThis.addEventListener('unload', () => { void cleanup(); });

try {
  // 2. Sign a 1-hour URL and hand it to Firecrawl.
  const { data: signedData, error: signErr } = await supabase.storage
    .from('uploads')
    .createSignedUrl(storagePath, 3600);
  if (signErr || !signedData) {
    console.error('Sign failed:', signErr?.message ?? 'no data');
    await cleanup();
    Deno.exit(1);
  }
  const signedUrl = signedData.signedUrl;

  console.log('Calling Firecrawl (pdfMode: fast)...');
  const firecrawlRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: signedUrl,
      formats: ['markdown'],
      parsers: [{ type: 'pdf', mode: 'fast' }],
      maxAge: 0,
      timeout: 240000,
    }),
  });
  if (!firecrawlRes.ok) {
    console.error(`Firecrawl ${firecrawlRes.status}:`, await firecrawlRes.text());
    await cleanup();
    Deno.exit(1);
  }
  const firecrawlJson = await firecrawlRes.json();
  const markdown: string = firecrawlJson?.data?.markdown ?? '';
  if (!markdown) {
    console.error('Firecrawl returned no markdown. Payload:', JSON.stringify(firecrawlJson).slice(0, 500));
    await cleanup();
    Deno.exit(1);
  }
  await Deno.writeTextFile(`${outDir}/parse_fast.md`, markdown);
  console.log(`Parsed ${markdown.length} chars → ${outDir}/parse_fast.md`);

  // 3. Production pipeline: preprocess → chunk → junk filter → LLM extract.
  const cleaned = preprocessMarkdown(markdown);
  const allChunks = chunkNewspaperMarkdown(cleaned);
  const validChunks = allChunks.filter((c) => !isLikelyJunkChunk(c));
  console.log(`${allChunks.length} chunks, ${validChunks.length} after junk filter`);

  const gemeindenUrl = new URL('../src/dorfkoenig/lib/gemeinden.json', import.meta.url);
  const gemeinden = JSON.parse(await Deno.readTextFile(gemeindenUrl));
  const VILLAGES = gemeinden.map((g: { name: string }) => g.name);
  const publicationDate = new Date().toISOString().slice(0, 10);
  const { system, buildUserMessage } = buildNewspaperExtractionPrompt(VILLAGES, publicationDate);

  async function chat(messages: { role: string; content: string }[]): Promise<string> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dorfkoenig.labs.wepublish.ch',
        'X-Title': 'DorfKönig (benchmark)',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages,
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  interface UnitWithSource {
    unit: ExtractionUnit;
    chunkIndex: number;
    chunkSnippet: string;
  }

  const allUnits: UnitWithSource[] = [];
  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  type DateMatch = 'exact' | 'day_month_only' | 'none';

  function eventDateMatch(eventDate: string, rawChunk: string): DateMatch {
    // Firecrawl markdown escapes dots as `\.` (e.g. `6\. Mai`). Normalize
    // before searching so the regexes below don't miss escaped dates.
    const chunk = rawChunk.replace(/\\\./g, '.');

    // exact = full date (including year) appears in chunk in any supported form.
    if (chunk.includes(eventDate)) return 'exact';
    const m = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 'none';
    const [, y, mm, dd] = m;
    const dayNoPad = parseInt(dd, 10).toString();
    const month = parseInt(mm, 10);
    const monthName = monthNames[month - 1];

    // Exact matches with year.
    if (chunk.includes(`${dayNoPad}. ${monthName} ${y}`)) return 'exact';
    if (chunk.includes(`${dd}. ${monthName} ${y}`)) return 'exact';
    if (chunk.match(new RegExp(`\\b${dayNoPad}\\.0?${month}\\.${y}\\b`))) return 'exact';
    if (chunk.match(new RegExp(`\\b${dd}\\.0?${month}\\.${y}\\b`))) return 'exact';

    // Day + month only (year inferred — legitimate per the prompt's rules).
    const dayMonthPatterns = [
      new RegExp(`\\b${dayNoPad}\\.\\s*${monthName}\\b`, 'i'),
      new RegExp(`\\b${dd}\\.\\s*${monthName}\\b`, 'i'),
      new RegExp(`\\b${dayNoPad}\\.0?${month}\\.\\b`),
      new RegExp(`\\b${dd}\\.0?${month}\\.\\b`),
    ];
    for (const p of dayMonthPatterns) {
      if (chunk.match(p)) return 'day_month_only';
    }
    return 'none';
  }

  let exactMatchCount = 0;
  let inferredYearCount = 0;
  let hallucinationCount = 0;

  for (let i = 0; i < validChunks.length; i++) {
    const chunk = validChunks[i];
    try {
      const raw = await chat([
        { role: 'system', content: system },
        { role: 'user', content: buildUserMessage(chunk) },
      ]);
      const result: ExtractionResult = JSON.parse(raw);
      for (const unit of result.units ?? []) {
        allUnits.push({ unit, chunkIndex: i, chunkSnippet: chunk });
        if (unit.eventDate) {
          const match = eventDateMatch(unit.eventDate, chunk);
          if (match === 'exact') exactMatchCount++;
          else if (match === 'day_month_only') inferredYearCount++;
          else hallucinationCount++;
        }
      }
      console.log(`Chunk ${i + 1}/${validChunks.length}: ${(result.units ?? []).length} units`);
    } catch (err) {
      console.error(`Chunk ${i + 1} extraction failed:`, err);
    }
  }

  await Deno.writeTextFile(`${outDir}/extracted.json`, JSON.stringify(allUnits, null, 2));

  const lines: string[] = [];
  lines.push('# Newspaper extraction benchmark report');
  lines.push('');
  lines.push(`- Source PDF: \`${pdfPath}\``);
  lines.push(`- Publication date passed to prompt: ${publicationDate}`);
  lines.push(`- Chunks: ${allChunks.length} total, ${validChunks.length} after junk filter`);
  lines.push(`- Extracted units: ${allUnits.length}`);
  lines.push(`- Date provenance:`);
  lines.push(`  - \`exact\`: full date (with year) in source chunk — **${exactMatchCount}**`);
  lines.push(`  - \`year_inferred\`: day+month in chunk, LLM inferred year from publication date — **${inferredYearCount}**`);
  lines.push(`  - \`not_found\`: neither the full date nor day+month appears in the chunk (likely hallucination OR markdown corruption) — **${hallucinationCount}**`);
  lines.push('');
  lines.push('Reading this:');
  lines.push('- `year_inferred` is legal per the extraction prompt rules — not a bug.');
  lines.push('- `not_found` is the signal. Non-zero means either the LLM hallucinated a date OR Fire-PDF parsed the date wrong (e.g. "16. April" came out as "16. Apri" and the LLM still extracted it correctly from context — look at the chunk snippet).');
  lines.push('');
  lines.push('## Units');
  lines.push('');
  for (const { unit, chunkIndex, chunkSnippet } of allUnits) {
    const provenance = unit.eventDate ? eventDateMatch(unit.eventDate, chunkSnippet) : 'n/a';
    lines.push(`### Chunk ${chunkIndex} — event_date: \`${unit.eventDate ?? '(null)'}\` — match: \`${provenance}\``);
    lines.push('');
    lines.push(`**Statement:** ${(unit.statement ?? '').slice(0, 240)}`);
    lines.push('');
    lines.push('**Source snippet (truncated to 800 chars):**');
    lines.push('```');
    lines.push(chunkSnippet.slice(0, 800));
    lines.push('```');
    lines.push('');
  }
  await Deno.writeTextFile(`${outDir}/report.md`, lines.join('\n'));
  console.log(`Wrote ${outDir}/extracted.json and ${outDir}/report.md`);
} finally {
  await cleanup();
}
