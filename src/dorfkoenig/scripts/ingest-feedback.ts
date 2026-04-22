#!/usr/bin/env node
/**
 * Manually ingest editor-provided markdown feedback into bajour_feedback_examples.
 * DRAFT_QUALITY.md §3.7.5 — Tom drops files under
 * `src/dorfkoenig/docs/feedback/{village_id}/{YYYY-MM-DD}.md` and runs:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run ingest:feedback -- --file src/dorfkoenig/docs/feedback/arlesheim/2026-04-22.md
 *
 * File format:
 *   # Headline (ignored)
 *   + 🏠 Positive example bullet text, citations kept verbatim.
 *   - "Bad example line" → Grund für Ablehnung
 *
 * Runs under Node via `tsx`; a Deno shim loads so sanitise.ts's import chain works.
 */

if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { sanitiseBulletForFeedback } from '../supabase/functions/_shared/feedback-sanitise.ts';

interface Args {
  file: string;
  villageId?: string;
  editionDate?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--village') args.villageId = argv[++i];
    else if (a === '--date') args.editionDate = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  if (!args.file) {
    console.error('Usage: ingest-feedback --file <path> [--village <id>] [--date <YYYY-MM-DD>] [--dry-run]');
    process.exit(2);
  }
  return args as Args;
}

function inferVillageAndDate(filePath: string): { villageId: string; editionDate: string } {
  const abs = resolve(filePath);
  const dateFromName = basename(abs, '.md');
  const villageFromDir = basename(dirname(abs));
  return { villageId: villageFromDir, editionDate: dateFromName };
}

interface ParsedBullet {
  kind: 'positive' | 'negative';
  text: string;
  reason: string | null;
}

function parseMarkdown(content: string): ParsedBullet[] {
  const out: ParsedBullet[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('+')) {
      out.push({ kind: 'positive', text: trimmed.slice(1).trim(), reason: null });
    } else if (trimmed.startsWith('-')) {
      const rest = trimmed.slice(1).trim();
      const idx = rest.indexOf('→');
      if (idx > 0) {
        out.push({
          kind: 'negative',
          text: rest.slice(0, idx).trim().replace(/^"|"$/g, ''),
          reason: rest.slice(idx + 1).trim(),
        });
      } else {
        out.push({ kind: 'negative', text: rest.replace(/^"|"$/g, ''), reason: null });
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { villageId: inferredVillage, editionDate: inferredDate } = inferVillageAndDate(args.file);
  const villageId = args.villageId ?? inferredVillage;
  const editionDate = args.editionDate ?? inferredDate;

  const content = readFileSync(args.file, 'utf8');
  const parsed = parseMarkdown(content);

  console.log(`Parsed ${parsed.length} bullet(s) from ${args.file}`);
  console.log(`village_id=${villageId} edition_date=${editionDate}`);

  const rows: Array<{
    village_id: string;
    kind: 'positive' | 'negative';
    bullet_text: string;
    editor_reason: string | null;
    edition_date: string;
  }> = [];
  const skipped: string[] = [];

  for (const b of parsed) {
    const result = sanitiseBulletForFeedback({
      bullet_text: b.text,
      allowed_urls: [],
    });
    if (!result.ok) {
      skipped.push(`[${b.kind}] ${b.text.slice(0, 60)}… — ${result.reason}`);
      continue;
    }
    rows.push({
      village_id: villageId,
      kind: b.kind,
      bullet_text: result.text,
      editor_reason: b.reason,
      edition_date: editionDate,
    });
  }

  console.log(`Accepted: ${rows.length}, skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s}`);

  if (args.dryRun) {
    console.log('\n--dry-run: not inserting. Preview:');
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.kind} / ${r.bullet_text.slice(0, 80)}…`);
    }
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for DB insert (use --dry-run to skip).');
    process.exit(3);
  }

  const response = await fetch(`${url}/rest/v1/bajour_feedback_examples`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    console.error('Insert failed:', response.status, await response.text());
    process.exit(4);
  }

  const inserted = await response.json();
  console.log(`Inserted ${Array.isArray(inserted) ? inserted.length : 0} row(s).`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
