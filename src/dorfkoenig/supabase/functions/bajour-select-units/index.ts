/**
 * @module bajour-select-units
 * AI-powered selection of relevant information units for a village newsletter.
 *
 * POST: uses LLM with recency bias to pick the most relevant units for a given village.
 * GET/PUT/DELETE: manage the per-user override of INFORMATION_SELECT_PROMPT stored in user_prompts.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { buildInformationSelectPrompt, INFORMATION_SELECT_PROMPT, formatUnitsForSelection } from '../_shared/prompts.ts';

interface SelectUnitsRequest {
  village_id: string;
  scout_id: string;
  recency_days?: number;
  /**
   * Per-run hint from the user (free text, e.g. "Bevorzuge kulturelle Veranstaltungen").
   * Prepended to the user message — does NOT replace the system prompt template.
   */
  selection_hint?: string;
}

const PROMPT_KEY = 'information_select';
const MIN_LEN = 20;
const MAX_LEN = 8000;

async function loadPromptOverride(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_prompts')
    .select('content')
    .eq('user_id', userId)
    .eq('prompt_key', PROMPT_KEY)
    .maybeSingle();
  return data?.content ?? null;
}

function validatePrompt(content: unknown): string | null {
  if (typeof content !== 'string') return 'content muss ein String sein';
  if (content.length < MIN_LEN) return `Prompt zu kurz (min. ${MIN_LEN} Zeichen)`;
  if (content.length > MAX_LEN) return `Prompt zu lang (max. ${MAX_LEN} Zeichen)`;
  if (!content.includes('{{currentDate}}')) return 'Platzhalter {{currentDate}} fehlt';
  if (!content.includes('{{recencyInstruction}}')) return 'Platzhalter {{recencyInstruction}} fehlt';
  return null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();

    // GET: return the effective prompt (override or default) for UI display
    if (req.method === 'GET') {
      const override = await loadPromptOverride(supabase, userId);
      return jsonResponse({ data: { prompt: override ?? INFORMATION_SELECT_PROMPT } });
    }

    // PUT: save user's prompt override
    if (req.method === 'PUT') {
      const { content } = await req.json() as { content?: unknown };
      const error = validatePrompt(content);
      if (error) return errorResponse(error, 400, 'VALIDATION_ERROR');

      const { error: upsertError } = await supabase
        .from('user_prompts')
        .upsert({ user_id: userId, prompt_key: PROMPT_KEY, content: content as string, updated_at: new Date().toISOString() });

      if (upsertError) {
        console.error('user_prompts upsert error:', upsertError);
        return errorResponse('Fehler beim Speichern des Prompts', 500);
      }
      return jsonResponse({ data: { prompt: content } });
    }

    // DELETE: reset to hardcoded default
    if (req.method === 'DELETE') {
      const { error: deleteError } = await supabase
        .from('user_prompts')
        .delete()
        .eq('user_id', userId)
        .eq('prompt_key', PROMPT_KEY);

      if (deleteError) {
        console.error('user_prompts delete error:', deleteError);
        return errorResponse('Fehler beim Zurücksetzen des Prompts', 500);
      }
      return jsonResponse({ data: { prompt: INFORMATION_SELECT_PROMPT } });
    }

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const body: SelectUnitsRequest = await req.json();
    const { village_id, scout_id, recency_days, selection_hint } = body;
    const recencyDays = recency_days ?? null;
    const hint = selection_hint?.trim();

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
    const formattedUnits = formatUnitsForSelection(units);

    const currentDate = new Date().toISOString().split('T')[0];

    // System prompt template: DB override > hardcoded default. The per-run user `hint`
    // is appended to the user message below, NOT injected into the system prompt.
    const template = (await loadPromptOverride(supabase, userId)) ?? INFORMATION_SELECT_PROMPT;

    const userMessage = hint
      ? `Zusätzlicher Hinweis vom Redakteur für diese Auswahl: ${hint}\n\nHier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus. Berücksichtige den Hinweis oben.`
      : `Hier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus.`;

    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: buildInformationSelectPrompt(currentDate, recencyDays, template) },
        { role: 'user', content: userMessage },
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
