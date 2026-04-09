/**
 * @module bajour-select-units
 * AI-powered selection of relevant information units for a village newsletter.
 * POST: uses LLM with recency bias to pick the most relevant units for a given village.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { buildInformationSelectPrompt, INFORMATION_SELECT_PROMPT } from '../_shared/prompts.ts';

interface SelectUnitsRequest {
  village_id: string;
  scout_id: string;
  recency_days?: number;
  selection_prompt?: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();

    // GET: return the current selection prompt template (for UI display)
    if (req.method === 'GET') {
      return jsonResponse({ data: { prompt: INFORMATION_SELECT_PROMPT } });
    }

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const body: SelectUnitsRequest = await req.json();
    const { village_id, scout_id, recency_days, selection_prompt } = body;
    const recencyDays = recency_days ?? null;

    // Validate input
    if (!village_id || typeof village_id !== 'string') {
      return errorResponse('village_id erforderlich', 400, 'VALIDATION_ERROR');
    }
    if (!scout_id || typeof scout_id !== 'string') {
      return errorResponse('scout_id erforderlich', 400, 'VALIDATION_ERROR');
    }

    // Query unused information units for this scout (owned by user), ordered by recency
    // When recencyDays is set, filter by created_at; otherwise fetch all unused units
    let query = supabase
      .from('information_units')
      .select('id, statement, unit_type, event_date, created_at')
      .eq('scout_id', scout_id)
      .eq('user_id', userId)
      .eq('used_in_article', false);

    if (recencyDays !== null) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - recencyDays);
      query = query.gte('created_at', cutoffDate.toISOString());
    }

    const { data: units, error } = await query
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Fetch units error:', error);
      return errorResponse('Fehler beim Laden der Einheiten', 500);
    }

    if (!units || units.length === 0) {
      console.warn('No units found', { userId, scout_id, recencyDays });
      return jsonResponse({ data: { selected_unit_ids: [] } });
    }

    // Format units for LLM
    const formattedUnits = units
      .map((unit, index) => {
        const date = unit.event_date || unit.created_at?.split('T')[0] || 'unbekannt';
        return `[${index + 1}] ID: ${unit.id} | Datum: ${date} | Typ: ${unit.unit_type} | ${unit.statement}`;
      })
      .join('\n');

    const currentDate = new Date().toISOString().split('T')[0];

    // Call LLM for selection
    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: buildInformationSelectPrompt(currentDate, recencyDays, selection_prompt) },
        {
          role: 'user',
          content: `Hier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    // Parse LLM response
    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch {
      console.error('Failed to parse LLM response:', response.choices[0].message.content);
      return errorResponse('Fehler bei der Auswahl der Einheiten', 500);
    }

    // Validate that returned IDs exist in the original set
    const validIds = new Set(units.map((u) => u.id));
    const selectedIds: string[] = (parsed.selected_unit_ids || []).filter(
      (id: string) => validIds.has(id)
    );

    // Fallback: if LLM returned empty selection but candidates exist, use all candidates
    if (selectedIds.length === 0 && units.length > 0) {
      console.warn('LLM returned empty selection, falling back to all candidates', {
        candidateCount: units.length,
        scout_id,
      });
      return jsonResponse({ data: { selected_unit_ids: units.map((u) => u.id) } });
    }

    return jsonResponse({ data: { selected_unit_ids: selectedIds } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-select-units error:', message);
    if (message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(message, 500);
  }
});
