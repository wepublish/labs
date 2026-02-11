// Scouts Edge Function - CRUD operations for web scouts

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId, type Scout } from '../_shared/supabase-client.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Extract scout ID if present (e.g., /scouts/uuid or /scouts/uuid/run)
    const scoutId = pathParts.length > 2 ? pathParts[2] : null;
    const action = pathParts.length > 3 ? pathParts[3] : null;

    // Route based on method and path
    switch (req.method) {
      case 'GET':
        if (scoutId) {
          return await getScout(supabase, userId, scoutId);
        }
        return await listScouts(supabase, userId);

      case 'POST':
        if (scoutId && action === 'run') {
          return await runScout(supabase, userId, scoutId, req);
        }
        if (scoutId && action === 'test') {
          return await testScout(supabase, userId, scoutId);
        }
        return await createScout(supabase, userId, req);

      case 'PUT':
        if (!scoutId) {
          return errorResponse('Scout ID erforderlich', 400);
        }
        return await updateScout(supabase, userId, scoutId, req);

      case 'DELETE':
        if (!scoutId) {
          return errorResponse('Scout ID erforderlich', 400);
        }
        return await deleteScout(supabase, userId, scoutId);

      default:
        return errorResponse('Methode nicht erlaubt', 405);
    }
  } catch (error) {
    console.error('Scouts error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});

// List all scouts for user
async function listScouts(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await supabase
    .from('scouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('List scouts error:', error);
    return errorResponse('Fehler beim Laden der Scouts', 500);
  }

  return jsonResponse({ data });
}

// Get single scout
async function getScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scoutId: string
) {
  const { data, error } = await supabase
    .from('scouts')
    .select('*')
    .eq('id', scoutId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('Scout nicht gefunden', 404);
    }
    console.error('Get scout error:', error);
    return errorResponse('Fehler beim Laden des Scouts', 500);
  }

  return jsonResponse({ data });
}

// Create new scout
async function createScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  req: Request
) {
  const body = await req.json();

  // Validate required fields
  if (!body.name?.trim()) {
    return errorResponse('Name ist erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!body.url?.trim()) {
    return errorResponse('URL ist erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!body.criteria?.trim()) {
    return errorResponse('Kriterien sind erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) {
    return errorResponse('Ungültige Frequenz', 400, 'VALIDATION_ERROR');
  }

  // Validate URL format
  try {
    new URL(body.url);
  } catch {
    return errorResponse('Ungültige URL', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await supabase
    .from('scouts')
    .insert({
      user_id: userId,
      name: body.name.trim(),
      url: body.url.trim(),
      criteria: body.criteria.trim(),
      location: body.location || null,
      frequency: body.frequency,
      notification_email: body.notification_email?.trim() || null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error('Create scout error:', error);
    return errorResponse('Fehler beim Erstellen des Scouts', 500);
  }

  return jsonResponse({ data }, 201);
}

// Update existing scout
async function updateScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scoutId: string,
  req: Request
) {
  const body = await req.json();

  // Build update object with only provided fields
  const updates: Partial<Scout> = {};

  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.url !== undefined) {
    try {
      new URL(body.url);
      updates.url = body.url.trim();
    } catch {
      return errorResponse('Ungültige URL', 400, 'VALIDATION_ERROR');
    }
  }
  if (body.criteria !== undefined) updates.criteria = body.criteria.trim();
  if (body.location !== undefined) updates.location = body.location;
  if (body.frequency !== undefined) {
    if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) {
      return errorResponse('Ungültige Frequenz', 400, 'VALIDATION_ERROR');
    }
    updates.frequency = body.frequency;
  }
  if (body.notification_email !== undefined) {
    updates.notification_email = body.notification_email?.trim() || null;
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabase
    .from('scouts')
    .update(updates)
    .eq('id', scoutId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('Scout nicht gefunden', 404);
    }
    console.error('Update scout error:', error);
    return errorResponse('Fehler beim Aktualisieren des Scouts', 500);
  }

  return jsonResponse({ data });
}

// Delete scout
async function deleteScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scoutId: string
) {
  const { error } = await supabase
    .from('scouts')
    .delete()
    .eq('id', scoutId)
    .eq('user_id', userId);

  if (error) {
    console.error('Delete scout error:', error);
    return errorResponse('Fehler beim Löschen des Scouts', 500);
  }

  return new Response(null, { status: 204 });
}

// Manually run scout
async function runScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scoutId: string,
  req: Request
) {
  // Verify scout exists and belongs to user
  const { data: scout, error: fetchError } = await supabase
    .from('scouts')
    .select('*')
    .eq('id', scoutId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !scout) {
    return errorResponse('Scout nicht gefunden', 404);
  }

  // Check for running execution
  const { data: running } = await supabase
    .from('scout_executions')
    .select('id')
    .eq('scout_id', scoutId)
    .eq('status', 'running')
    .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .single();

  if (running) {
    return errorResponse('Eine Ausführung läuft bereits', 409, 'EXECUTION_RUNNING');
  }

  // Parse options from request body
  let options = { skip_notification: false, extract_units: true };
  try {
    const body = await req.json();
    options = { ...options, ...body };
  } catch {
    // No body or invalid JSON, use defaults
  }

  // Create execution record
  const { data: execution, error: execError } = await supabase
    .from('scout_executions')
    .insert({
      scout_id: scoutId,
      user_id: userId,
      status: 'running',
    })
    .select()
    .single();

  if (execError) {
    console.error('Create execution error:', execError);
    return errorResponse('Fehler beim Starten der Ausführung', 500);
  }

  // Trigger execute-scout function asynchronously
  const projectUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  fetch(`${projectUrl}/functions/v1/execute-scout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scoutId,
      executionId: execution.id,
      skipNotification: options.skip_notification,
      extractUnits: options.extract_units,
    }),
  }).catch((err) => {
    console.error('Failed to trigger execute-scout:', err);
  });

  return jsonResponse(
    {
      data: {
        execution_id: execution.id,
        status: 'running',
        message: 'Scout-Ausführung gestartet',
      },
    },
    202
  );
}

// Test scout (preview without side effects)
async function testScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scoutId: string
) {
  // Verify scout exists and belongs to user
  const { data: scout, error: fetchError } = await supabase
    .from('scouts')
    .select('*')
    .eq('id', scoutId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !scout) {
    return errorResponse('Scout nicht gefunden', 404);
  }

  // Import dependencies
  const { firecrawl } = await import('../_shared/firecrawl.ts');
  const { openrouter } = await import('../_shared/openrouter.ts');

  // Scrape without change tracking (preview mode)
  const scrapeResult = await firecrawl.scrape({
    url: scout.url,
    formats: ['markdown'],
    timeout: 30000,
  });

  if (!scrapeResult.success) {
    return jsonResponse({
      data: {
        scrape_result: {
          success: false,
          error: scrapeResult.error,
        },
        criteria_analysis: null,
        would_notify: false,
        would_extract_units: false,
      },
    });
  }

  // Analyze criteria
  const analysisPrompt = `Du bist ein Nachrichtenanalyst. Analysiere den Inhalt und prüfe, ob er den angegebenen Kriterien entspricht.

KRITERIEN:
${scout.criteria}

INHALT:
${scrapeResult.markdown?.slice(0, 6000) || ''}

Antworte im JSON-Format:
{
  "matches": boolean,
  "summary": "Kurze Zusammenfassung (max 150 Zeichen)",
  "key_findings": ["Punkt 1", "Punkt 2"]
}`;

  const response = await openrouter.chat({
    messages: [{ role: 'user', content: analysisPrompt }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  let analysis = { matches: false, summary: '', key_findings: [] as string[] };
  try {
    analysis = JSON.parse(response.choices[0].message.content);
  } catch {
    // Keep defaults
  }

  return jsonResponse({
    data: {
      scrape_result: {
        success: true,
        title: scrapeResult.title,
        content_preview: scrapeResult.markdown?.slice(0, 500) || '',
        word_count: scrapeResult.markdown?.split(/\s+/).length || 0,
      },
      criteria_analysis: {
        matches: analysis.matches,
        summary: analysis.summary,
        key_findings: analysis.key_findings,
      },
      would_notify: analysis.matches && !!scout.notification_email,
      would_extract_units: !!scout.location,
    },
  });
}
