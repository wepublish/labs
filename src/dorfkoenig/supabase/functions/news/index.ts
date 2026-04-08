/**
 * @module news
 * Public GET endpoint returning confirmed bajour drafts grouped by village.
 *
 * Auth: shared secret via `?auth=` query param OR `Authorization: Bearer` header.
 * Date range: `?date=YYYY-MM-DD&range=N` — returns confirmed drafts within ±N days
 *             of the given date. Defaults: date=today, range=3, max range=30.
 *
 * Response: { data: { [villageId]: [{ publication_date, draft, items }] } }
 */

import { handleCors, corsHeaders, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
// Canonical source: src/dorfkoenig/lib/gemeinden.json — keep in sync
import gemeinden from '../_shared/gemeinden.json' with { type: 'json' };

const NEWS_API_TOKEN = Deno.env.get('NEWS_API_TOKEN');
const DEFAULT_RANGE = 3;
const MAX_RANGE = 30;
const UNIT_BATCH_SIZE = 500;

// --- Helpers ---

/** Constant-time string comparison to prevent timing attacks. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Validate YYYY-MM-DD and check it's a real calendar date. */
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Add/subtract days from a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// --- Handler ---

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return errorResponse('Methode nicht erlaubt', 405);
  }

  if (!NEWS_API_TOKEN) {
    console.error('NEWS_API_TOKEN not configured');
    return errorResponse('Server-Konfigurationsfehler', 500);
  }

  const url = new URL(req.url);

  // --- Auth: query param or Authorization header ---
  const authToken =
    url.searchParams.get('auth') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null;

  if (!authToken || !constantTimeEqual(authToken, NEWS_API_TOKEN)) {
    return errorResponse('Ungültiger API-Token', 401, 'UNAUTHORIZED');
  }

  // --- Date parameter (default: today) ---
  const dateParam = url.searchParams.get('date');
  const date = dateParam || new Date().toISOString().split('T')[0];
  if (!isValidDate(date)) {
    return errorResponse('Ungültiges Datum (YYYY-MM-DD erwartet)', 400);
  }

  // --- Range parameter (default: 3, max: 30) ---
  const rangeRaw = parseInt(url.searchParams.get('range') ?? '', 10);
  const range = isNaN(rangeRaw) ? DEFAULT_RANGE : Math.min(Math.max(rangeRaw, 0), MAX_RANGE);
  const fromDate = addDays(date, -range);
  const toDate = addDays(date, range);

  const supabase = createServiceClient();

  // --- Fetch confirmed drafts within date range ---
  const { data: drafts, error: draftsErr } = await supabase
    .from('bajour_drafts')
    .select('village_id, body, selected_unit_ids, publication_date')
    .gte('publication_date', fromDate)
    .lte('publication_date', toDate)
    .eq('verification_status', 'bestätigt')
    .order('publication_date', { ascending: false });

  if (draftsErr) {
    console.error('News query error:', draftsErr);
    return errorResponse('Datenbankfehler', 500);
  }

  // --- Batch-fetch information units (deduplicated, batched) ---
  const allUnitIds = [...new Set((drafts || []).flatMap((d) => d.selected_unit_ids || []))];
  const unitMap = new Map<string, string>();

  for (let i = 0; i < allUnitIds.length; i += UNIT_BATCH_SIZE) {
    const batch = allUnitIds.slice(i, i + UNIT_BATCH_SIZE);
    const { data: units, error: unitsErr } = await supabase
      .from('information_units')
      .select('id, statement')
      .in('id', batch);

    if (unitsErr) {
      console.error('Unit fetch error (batch offset', i, '):', unitsErr);
    }
    if (units) {
      for (const u of units) unitMap.set(u.id, u.statement);
    }
  }

  // --- Group drafts by village ---
  const draftsByVillage = new Map<string, typeof drafts>();
  for (const d of drafts || []) {
    const arr = draftsByVillage.get(d.village_id) ?? [];
    arr.push(d);
    draftsByVillage.set(d.village_id, arr);
  }

  // --- Build response: all villages, all drafts within range ---
  const result: Record<string, { publication_date: string; draft: string; items: string[] }[]> = {};
  for (const village of gemeinden) {
    const villageDrafts = draftsByVillage.get(village.id) ?? [];
    result[village.id] = villageDrafts.map((d) => ({
      publication_date: d.publication_date,
      draft: d.body,
      items: (d.selected_unit_ids || [])
        .map((id: string) => unitMap.get(id))
        .filter((s): s is string => !!s),
    }));
  }

  return new Response(JSON.stringify({ data: result }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
});
