/**
 * @module units
 * Information units for the Compose panel.
 * GET: list/filter units by location, topic, unused-only. GET /search: hybrid lexical + semantic search.
 * PUT: mark units as used (sets used_in_article, extends TTL).
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId, type Location } from '../_shared/supabase-client.ts';
import { fetchUnitRollups } from '../_shared/canonical-units.ts';
import { embeddings } from '../_shared/embeddings.ts';
import { DEFAULT_UNITS_PAGE_SIZE, DEFAULT_SEARCH_PAGE_SIZE, MAX_PAGE_SIZE, MAX_SEARCH_PAGE_SIZE, SEARCH_MIN_SIMILARITY } from '../_shared/constants.ts';
import { normalizeCity } from '../_shared/village-id.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Supabase strips /functions/v1/ prefix — function sees /units/{endpoint}
    // pathParts: ['units', '{endpoint}']
    const endpoint = pathParts.length > 1 ? pathParts[1] : null;

    switch (req.method) {
      case 'GET':
        if (endpoint === 'locations') {
          return await getLocations(supabase, userId);
        }
        if (endpoint === 'search') {
          return await searchUnits(supabase, userId, url);
        }
        return await listUnits(supabase, userId, url);

      case 'PATCH':
        if (endpoint === 'mark-used') {
          return await markUsed(supabase, userId, req);
        }
        return errorResponse('Endpoint nicht gefunden', 404);

      case 'DELETE':
        if (endpoint) {
          return await deleteUnit(supabase, userId, endpoint);
        }
        return errorResponse('Unit-ID erforderlich', 400, 'VALIDATION_ERROR');

      default:
        return errorResponse('Methode nicht erlaubt', 405);
    }
  } catch (error) {
    console.error('Units error:', error);
    if (error instanceof Error && error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});

// List units with filtering
async function listUnits(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  url: URL
) {
  const locationCity = url.searchParams.get('location_city');
  const topic = url.searchParams.get('topic');
  const unusedOnly = url.searchParams.get('unused_only') !== 'false';
  const scoutId = url.searchParams.get('scout_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || String(DEFAULT_UNITS_PAGE_SIZE)), MAX_PAGE_SIZE);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');

  let query = supabase
    .from('information_units')
    .select('id, statement, unit_type, entities, source_url, source_domain, source_title, location, topic, scout_id, source_type, file_path, created_at, used_in_article, event_date, occurrence_count', { count: 'exact' })
    .eq('user_id', userId)
    .order('event_date', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const normalizedLocationCity = locationCity ? normalizeCity(locationCity) : null;
  if (normalizedLocationCity) {
    query = query.eq('location->>city', normalizedLocationCity);
  }

  if (topic) {
    const escaped = topic.replace(/%/g, '\\%').replace(/_/g, '\\_');
    query = query.ilike('topic', `%${escaped}%`);
  }

  if (unusedOnly) {
    query = query.eq('used_in_article', false);
  }

  if (scoutId) {
    const { data: occurrenceRows, error: occurrenceError } = await supabase
      .from('unit_occurrences')
      .select('unit_id')
      .eq('user_id', userId)
      .eq('scout_id', scoutId);

    if (occurrenceError) {
      console.error('Scout occurrence filter error:', occurrenceError);
      return errorResponse('Fehler beim Laden der Scout-Einheiten', 500);
    }

    const scopedUnitIds = [...new Set((occurrenceRows ?? []).map((row) => row.unit_id as string))];
    if (scopedUnitIds.length === 0) {
      return jsonResponse({
        data: [],
        meta: {
          total: 0,
          limit,
          offset,
        },
      });
    }

    query = query.in('id', scopedUnitIds);
  }

  if (dateFrom) {
    query = query.gte('event_date', dateFrom);
  }
  if (dateTo) {
    query = query.lte('event_date', dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('List units error:', error);
    return errorResponse('Fehler beim Laden der Einheiten', 500);
  }

  // Generate signed URLs for units with file_path (derived per-response field;
  // not stored on the row, added to the output payload).
  const rows = data ?? [];
  const rollups = await fetchUnitRollups(supabase, userId, rows.map((unit) => unit.id));
  const enriched: Array<(typeof rows)[number] & {
    file_url?: string | null;
    sources: Array<{ title: string | null; url: string; domain: string }>;
    linked_scouts: string[];
  }> = [];
  for (const unit of rows) {
    const rollup = rollups.get(unit.id);
    if (unit.file_path) {
      const { data: signedUrl } = await supabase.storage
        .from('uploads')
        .createSignedUrl(unit.file_path, 3600);
      enriched.push({
        ...unit,
        file_url: signedUrl?.signedUrl || null,
        sources: rollup?.sources ?? [],
        linked_scouts: rollup?.linkedScouts ?? [],
      });
    } else {
      enriched.push({
        ...unit,
        sources: rollup?.sources ?? [],
        linked_scouts: rollup?.linkedScouts ?? [],
      });
    }
  }

  return jsonResponse({
    data: enriched,
    meta: {
      total: count || 0,
      limit,
      offset,
    },
  });
}

// Get distinct locations for filter dropdown
async function getLocations(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
) {
  // Use a raw query to get distinct locations with counts
  const { data, error } = await supabase
    .from('information_units')
    .select('location')
    .eq('user_id', userId)
    .eq('used_in_article', false)
    .not('location', 'is', null);

  if (error) {
    console.error('Get locations error:', error);
    return errorResponse('Fehler beim Laden der Standorte', 500);
  }

  // Aggregate locations client-side
  const locationCounts = new Map<string, { location: Location; count: number }>();

  for (const row of data || []) {
    if (row.location?.city) {
      const key = row.location.city;
      const existing = locationCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        locationCounts.set(key, { location: row.location, count: 1 });
      }
    }
  }

  const locations = Array.from(locationCounts.values())
    .map(({ location, count }) => ({
      city: location.city,
      state: location.state,
      country: location.country,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return jsonResponse({ data: locations });
}

// Hybrid lexical + semantic search for units
async function searchUnits(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  url: URL
) {
  const query = url.searchParams.get('q');
  if (!query) {
    return errorResponse('Suchbegriff erforderlich', 400, 'VALIDATION_ERROR');
  }

  const locationCity = url.searchParams.get('location_city') || null;
  const normalizedLocationCity = locationCity ? normalizeCity(locationCity) : null;
  const topic = url.searchParams.get('topic') || null;
  const scoutId = url.searchParams.get('scout_id') || null;
  const unusedOnly = url.searchParams.get('unused_only') !== 'false';
  const minSimilarity = parseFloat(url.searchParams.get('min_similarity') || String(SEARCH_MIN_SIMILARITY));
  const limit = Math.min(parseInt(url.searchParams.get('limit') || String(DEFAULT_SEARCH_PAGE_SIZE)), MAX_SEARCH_PAGE_SIZE);

  // Generate query embedding for the semantic leg of hybrid search.
  const queryEmbedding = await embeddings.generate(query);

  // Use database function for hybrid search/ranking.
  const { data, error } = await supabase.rpc('search_units_semantic', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_query_text: query,
    p_location_city: normalizedLocationCity,
    p_topic: topic,
    p_unused_only: unusedOnly,
    p_min_similarity: minSimilarity,
    p_limit: limit,
    p_scout_id: scoutId,
  });

  if (error) {
    console.error('Search units error:', error);
    return errorResponse('Fehler bei der Suche', 500);
  }

  const rows = data ?? [];
  const rollups = await fetchUnitRollups(supabase, userId, rows.map((unit: { id: string }) => unit.id));

  return jsonResponse({
    data: rows.map((unit: { id: string }) => ({
      ...unit,
      sources: rollups.get(unit.id)?.sources ?? [],
      linked_scouts: rollups.get(unit.id)?.linkedScouts ?? [],
    })),
  });
}

// Delete a single unit (for removing mistaken uploads)
async function deleteUnit(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  unitId: string
): Promise<Response> {
  // First fetch the unit to check ownership and get file_path
  const { data: unit, error: fetchError } = await supabase
    .from('information_units')
    .select('id, file_path')
    .eq('id', unitId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !unit) {
    return errorResponse('Einheit nicht gefunden', 404, 'NOT_FOUND');
  }

  // Delete the unit
  const { error: deleteError } = await supabase
    .from('information_units')
    .delete()
    .eq('id', unitId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Delete unit error:', deleteError);
    return errorResponse('Fehler beim Löschen der Einheit', 500);
  }

  // If unit had a file, remove from storage
  if (unit.file_path) {
    await supabase.storage.from('uploads').remove([unit.file_path]);
  }

  return jsonResponse({ data: { deleted: true } });
}

// Mark units as used in article
async function markUsed(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  req: Request
) {
  const body = await req.json();
  const unitIds = body.unit_ids;

  if (!Array.isArray(unitIds) || unitIds.length === 0) {
    return errorResponse('unit_ids Array erforderlich', 400, 'VALIDATION_ERROR');
  }

  const { error, count } = await supabase
    .from('information_units')
    .update({ used_in_article: true })
    .eq('user_id', userId)
    .in('id', unitIds);

  if (error) {
    console.error('Mark used error:', error);
    return errorResponse('Fehler beim Markieren der Einheiten', 500);
  }

  return jsonResponse({
    data: {
      marked_count: count || unitIds.length,
    },
  });
}
