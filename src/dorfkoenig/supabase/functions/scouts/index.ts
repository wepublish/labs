/**
 * @module scouts
 * CRUD for web scout configurations.
 * GET: list all (enriched with latest execution) or get by ID.
 * POST: create scout. POST ?action=run: trigger execution. POST ?action=test: double-probe test.
 * PUT: update scout. DELETE: remove (cascades to executions/units).
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId, type Scout } from '../_shared/supabase-client.ts';
import { analyzeCriteria } from '../_shared/criteria-analysis.ts';
import { initializeScoutBaseline } from '../_shared/scout-baseline.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Supabase strips /functions/v1/ prefix — function sees /scouts/{id}/{action}
    // pathParts: ['scouts', '{id}', '{action}']
    const scoutId = pathParts.length > 1 ? pathParts[1] : null;
    const action = pathParts.length > 2 ? pathParts[2] : null;

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
    if (error instanceof Error && error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});

// List all scouts for user (with latest execution status)
async function listScouts(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data: scouts, error } = await supabase
    .from('scouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('List scouts error:', error);
    return errorResponse('Fehler beim Laden der Scouts', 500);
  }

  if (!scouts || scouts.length === 0) {
    return jsonResponse({ data: [] });
  }

  // Fetch latest execution per scout
  const scoutIds = scouts.map(s => s.id);
  const { data: executions } = await supabase
    .from('scout_executions')
    .select('scout_id, status, criteria_matched, change_status, summary_text, completed_at')
    .in('scout_id', scoutIds)
    .order('started_at', { ascending: false })
    .limit(scoutIds.length * 3);

  // Build map of latest execution per scout (first occurrence = most recent)
  const latestExecMap = new Map<string, {
    status: string;
    criteria_matched: boolean | null;
    change_status: string | null;
    summary_text: string | null;
  }>();

  if (executions) {
    for (const exec of executions) {
      if (!latestExecMap.has(exec.scout_id)) {
        latestExecMap.set(exec.scout_id, {
          status: exec.status,
          criteria_matched: exec.criteria_matched,
          change_status: exec.change_status,
          summary_text: exec.summary_text,
        });
      }
    }
  }

  // Merge execution data into scouts
  const enrichedScouts = scouts.map(scout => {
    const lastExec = latestExecMap.get(scout.id);
    return {
      ...scout,
      last_execution_status: lastExec?.status ?? null,
      last_criteria_matched: lastExec?.criteria_matched ?? null,
      last_change_status: lastExec?.change_status ?? null,
      last_summary_text: lastExec?.summary_text ?? null,
    };
  });

  return jsonResponse({ data: enrichedScouts });
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
  const scoutType = body.scout_type || 'web';
  const requestedActive = body.is_active ?? true;

  // Validate required fields
  if (!body.name?.trim()) {
    return errorResponse('Name ist erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) {
    return errorResponse('Ungültige Frequenz', 400, 'VALIDATION_ERROR');
  }

  if (scoutType === 'civic') {
    // Civic scout validation
    if (!body.root_domain?.trim()) {
      return errorResponse('Domain ist erforderlich', 400, 'VALIDATION_ERROR');
    }
  } else {
    // Web scout validation
    if (!body.url?.trim()) {
      return errorResponse('URL ist erforderlich', 400, 'VALIDATION_ERROR');
    }
    if (body.criteria === undefined || body.criteria === null) {
      return errorResponse('Kriterien-Feld ist erforderlich', 400, 'VALIDATION_ERROR');
    }
    try {
      new URL(body.url);
    } catch {
      return errorResponse('Ungültige URL', 400, 'VALIDATION_ERROR');
    }
    // Auto-mode scouts don't need a location — the LLM assigns per unit.
    const locationMode = body.location_mode === 'auto' ? 'auto' : 'manual';
    if (locationMode === 'manual' && !body.location && !body.topic?.trim()) {
      return errorResponse('Ort oder Thema ist erforderlich', 400, 'VALIDATION_ERROR');
    }
  }

  const locationMode = body.location_mode === 'auto' ? 'auto' : 'manual';
  const insertData: Record<string, unknown> = {
    user_id: userId,
    name: body.name.trim(),
    criteria: (body.criteria || '').trim(),
    // Auto mode intentionally clears scout.location — units get location from content.
    location: locationMode === 'auto' ? null : (body.location || null),
    frequency: body.frequency,
    // Active scouts must get their baseline before they become schedulable.
    is_active: false,
    topic: body.topic?.trim() || null,
    scout_type: scoutType,
    location_mode: locationMode,
  };

  if (scoutType === 'civic') {
    insertData.root_domain = body.root_domain.trim();
    insertData.tracked_urls = body.tracked_urls || [];
    insertData.url = null;
  } else {
    insertData.url = body.url.trim();
  }

  const { data, error } = await supabase
    .from('scouts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Create scout error:', error);
    return errorResponse('Fehler beim Erstellen des Scouts', 500);
  }

  if (!requestedActive) {
    return jsonResponse({ data }, 201);
  }

  try {
    const baselineFields = await initializeScoutBaseline({
      ...data,
      is_active: true,
    });

    const { data: activatedScout, error: activateError } = await supabase
      .from('scouts')
      .update({
        ...baselineFields,
        is_active: true,
      })
      .eq('id', data.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (activateError) {
      console.error('Activate scout after baseline error:', activateError);
      await supabase.from('scouts').delete().eq('id', data.id).eq('user_id', userId);
      return errorResponse('Fehler beim Aktivieren des Scouts', 500);
    }

    return jsonResponse({ data: activatedScout }, 201);
  } catch (baselineError) {
    console.error('Initialize baseline on create error:', baselineError);
    await supabase.from('scouts').delete().eq('id', data.id).eq('user_id', userId);
    return errorResponse(
      `Fehler beim Initialisieren der Baseline: ${baselineError instanceof Error ? baselineError.message : String(baselineError)}`,
      500,
    );
  }

}

// Update existing scout
async function updateScout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scoutId: string,
  req: Request
) {
  const body = await req.json();

  const { data: existingScout, error: existingError } = await supabase
    .from('scouts')
    .select('*')
    .eq('id', scoutId)
    .eq('user_id', userId)
    .single();

  if (existingError || !existingScout) {
    return errorResponse('Scout nicht gefunden', 404);
  }

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
  if (body.location_mode !== undefined) {
    if (body.location_mode !== 'manual' && body.location_mode !== 'auto') {
      return errorResponse('Ungültiger location_mode-Wert', 400, 'VALIDATION_ERROR');
    }
    updates.location_mode = body.location_mode;
  }
  if (body.location !== undefined) updates.location = body.location;
  // Switching to auto clears the scout's location regardless of what `body.location`
  // supplied — units get a location from content, not the scout.
  if (body.location_mode === 'auto') updates.location = null;
  if (body.frequency !== undefined) {
    if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) {
      return errorResponse('Ungültige Frequenz', 400, 'VALIDATION_ERROR');
    }
    updates.frequency = body.frequency;
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.topic !== undefined) updates.topic = body.topic?.trim() || null;

  // Provider detection fields
  if (body.provider !== undefined) {
    if (body.provider !== null && body.provider !== 'firecrawl' && body.provider !== 'firecrawl_plain') {
      return errorResponse('Ungültiger Provider-Wert', 400, 'VALIDATION_ERROR');
    }
    updates.provider = body.provider;
  }
  if (body.content_hash !== undefined) {
    updates.content_hash = body.content_hash;
  }

  // Civic-specific fields
  if (body.root_domain !== undefined) updates.root_domain = body.root_domain;
  if (body.tracked_urls !== undefined) updates.tracked_urls = body.tracked_urls;

  // Reset provider/content_hash when URL changes (re-test required)
  if (body.url !== undefined) {
    updates.provider = null;
    updates.content_hash = null;
  }

  const nextScout: Scout = {
    ...existingScout,
    ...updates,
  };

  const shouldInitializeBaseline = nextScout.is_active && (
    !existingScout.is_active ||
    (nextScout.scout_type === 'web' && body.url !== undefined) ||
    (nextScout.scout_type === 'civic' && body.tracked_urls !== undefined)
  );

  if (shouldInitializeBaseline) {
    try {
      Object.assign(updates, await initializeScoutBaseline(nextScout));
    } catch (baselineError) {
      console.error('Initialize baseline on update error:', baselineError);
      return errorResponse(
        `Fehler beim Initialisieren der Baseline: ${baselineError instanceof Error ? baselineError.message : String(baselineError)}`,
        500,
      );
    }
  }

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

  // Trigger execution function asynchronously (route by scout type)
  const projectUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const executeFn = scout.scout_type === 'civic' ? 'execute-civic-scout' : 'execute-scout';

  const finalizeDispatchFailure = async (message: string) => {
    const { error: updateError } = await supabase
      .from('scout_executions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        change_status: 'error',
        error_message: message,
      })
      .eq('id', execution.id)
      .eq('status', 'running');

    if (updateError) {
      console.error('Failed to finalize dispatch failure:', updateError);
    }
  };

  fetch(`${projectUrl}/functions/v1/${executeFn}`, {
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
  })
    .then(async (res) => {
      if (res.ok) return;

      const bodyText = await res.text().catch(() => '');
      const message = `Worker dispatch failed (${res.status})${bodyText ? `: ${bodyText.slice(0, 500)}` : ''}`;
      console.error('Failed to trigger scout worker:', message);
      await finalizeDispatchFailure(message);
    })
    .catch(async (err) => {
      const message = `Worker dispatch failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error('Failed to trigger scout worker:', err);
      await finalizeDispatchFailure(message);
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

  // Probe tag uses scoutId (each draft gets a fresh UUID, so re-testing
  // always gets a clean tag with no stale previousScrapeAt)
  const probeTag = `${userId}#${scoutId}`;

  // Double-probe: detects provider AND returns first call's scrape as preview
  // (2 Firecrawl calls instead of 3)
  const { provider, scrapeResult } = await firecrawl.doubleProbe(scout.url, probeTag);

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
        provider: null,
        content_hash: null,
      },
    });
  }

  // Compute content hash
  const contentHash = await firecrawl.computeContentHash(scrapeResult.markdown || '');

  // Analyze criteria (skip LLM if "Jede Änderung" mode)
  const hasCriteria = !!scout.criteria?.trim();

  let criteriaAnalysis: { matches: boolean; summary: string; key_findings: string[] } | null = null;

  if (hasCriteria) {
    const result = await analyzeCriteria(scrapeResult.markdown!, scout.criteria);
    criteriaAnalysis = {
      matches: result.matches,
      summary: result.summary,
      key_findings: result.keyFindings,
    };
  }

  return jsonResponse({
    data: {
      scrape_result: {
        success: true,
        title: scrapeResult.title,
        content_preview: scrapeResult.markdown?.slice(0, 500) || '',
        word_count: scrapeResult.markdown?.split(/\s+/).length || 0,
      },
      criteria_analysis: criteriaAnalysis,
      would_notify: hasCriteria ? (criteriaAnalysis?.matches ?? false) : true,
      would_extract_units: !!(scout.location || scout.topic),
      provider,
      content_hash: contentHash,
    },
  });
}
