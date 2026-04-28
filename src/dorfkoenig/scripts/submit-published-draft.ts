#!/usr/bin/env node
/**
 * Submit an actually-published Bajour newsletter as an external draft.
 *
 * Temporary bridge: the auto-pipeline doesn't yet drive every published
 * newsletter, so when an editor sends out a manually-edited or fully-manual
 * version, this CLI feeds it back into the system as a draft with
 * provider='external' + published_at=now(). The bajour-drafts edge function
 * extracts atomic units from the body, routes them through the canonical fact
 * layer so they participate in the soft-dedup signal. It does not seed compose
 * few-shot examples; those must come from finished bullets.
 *
 * Long-term path: an external API webhook will mark Dorfkönig-produced drafts
 * as published, setting the same `published_at` field. This CLI dies when that
 * lands.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... USER_ID=... \
 *     npm run submit:published -- \
 *       --village arlesheim \
 *       --date 2026-04-22 \
 *       --file ./april-22-arlesheim.md
 *
 * Optional flags:
 *   --title "Custom newsletter title"
 *   --dry-run    print the request body without sending
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import gemeindenJson from '../lib/gemeinden.json' with { type: 'json' };

interface Args {
  villageId: string;
  date: string;
  file: string;
  title?: string;
  dryRun: boolean;
}

interface Village {
  id: string;
  name: string;
}

const villages = gemeindenJson as Village[];

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--village') args.villageId = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  if (!args.villageId || !args.date || !args.file) {
    console.error(
      'Usage: submit-published-draft --village <id> --date <YYYY-MM-DD> --file <path> [--title <str>] [--dry-run]',
    );
    process.exit(2);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    console.error(`Invalid --date "${args.date}", expected YYYY-MM-DD`);
    process.exit(2);
  }
  return args as Args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const village = villages.find((v) => v.id === args.villageId);
  if (!village) {
    console.error(
      `Unknown village id "${args.villageId}". Valid ids: ${villages.map((v) => v.id).join(', ')}`,
    );
    process.exit(2);
  }

  const body = readFileSync(resolve(args.file), 'utf8').trim();
  if (body.length < 20) {
    console.error('File body is too short (<20 chars). Refusing to submit.');
    process.exit(2);
  }

  const payload = {
    village_id: village.id,
    village_name: village.name,
    title: args.title ?? `${village.name} — ${args.date}`,
    body,
    publication_date: args.date,
    provider: 'external' as const,
  };

  if (args.dryRun) {
    console.log('--dry-run: would POST');
    console.log(JSON.stringify({ ...payload, body: `${body.slice(0, 120)}…` }, null, 2));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const userId = process.env.USER_ID;
  if (!supabaseUrl || !supabaseAnonKey || !userId) {
    console.error('SUPABASE_URL, SUPABASE_ANON_KEY, USER_ID must be set in the environment.');
    process.exit(3);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/bajour-drafts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
      'x-user-id': userId,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`POST bajour-drafts failed: ${response.status} ${text}`);
    process.exit(4);
  }

  let parsed: { data?: { id?: string; extracted_unit_count?: number } } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn('Response was not JSON. Raw:', text);
    return;
  }

  const draftId = parsed.data?.id ?? '(unknown)';
  const unitCount = parsed.data?.extracted_unit_count ?? 0;
  console.log(`Draft created: id=${draftId}, extracted_units=${unitCount}, village=${village.id}, date=${args.date}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
