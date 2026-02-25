// Units Edge Function - Information units for Compose panel

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { embeddings } from '../_shared/embeddings.ts';

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

      default:
        return errorResponse('Methode nicht erlaubt', 405);
    }
  } catch (error) {
    console.error('Units error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = supabase
    .from('information_units')
    .select('id, statement, unit_type, entities, source_url, source_domain, source_title, location, topic, scout_id, created_at, used_in_article', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (locationCity) {
    query = query.eq('location->>city', locationCity);
  }

  if (topic) {
    const escaped = topic.replace(/%/g, '\\%').replace(/_/g, '\\_');
    query = query.ilike('topic', `%${escaped}%`);
  }

  if (unusedOnly) {
    query = query.eq('used_in_article', false);
  }

  if (scoutId) {
    query = query.eq('scout_id', scoutId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('List units error:', error);
    return errorResponse('Fehler beim Laden der Einheiten', 500);
  }

  return jsonResponse({
    data,
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
  const locationCounts = new Map<string, { location: Record<string, unknown>; count: number }>();

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

// Semantic search for units
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
  const topic = url.searchParams.get('topic') || null;
  const unusedOnly = url.searchParams.get('unused_only') !== 'false';
  const minSimilarity = parseFloat(url.searchParams.get('min_similarity') || '0.3');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  // Generate query embedding
  const queryEmbedding = await embeddings.generate(query);

  // Use database function for semantic search
  const { data, error } = await supabase.rpc('search_units_semantic', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_location_city: locationCity,
    p_topic: topic,
    p_unused_only: unusedOnly,
    p_min_similarity: minSimilarity,
    p_limit: limit,
  });

  if (error) {
    console.error('Search units error:', error);
    return errorResponse('Fehler bei der Suche', 500);
  }

  return jsonResponse({ data });
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
