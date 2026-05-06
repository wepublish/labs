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
import { buildInformationSelectPrompt, INFORMATION_SELECT_PROMPT, formatUnitsForSelection, UNIT_FOR_COMPOSE_COLUMNS } from '../_shared/prompts.ts';
import { MAX_UNITS_PER_COMPOSE } from '../_shared/constants.ts';
import {
  buildSelectionDiagnostics,
  DEFAULT_SELECTION_RANKING_CONFIG,
  enforceMandatorySelection,
  normalizeSelectionRankingConfig,
  rankSelectionCandidates,
  refineSelectionForCompose,
  selectDeterministicFallback,
  validateSelectionRankingConfig,
  type SelectionRankingConfig,
} from '../_shared/selection-ranking.ts';
import {
  addDaysIsoDate,
  isIsoDate,
  isWeekdayPublicationDate,
  nextValidPublicationDateAfter,
  zurichTodayIso,
} from '../_shared/publication-calendar.ts';

interface SelectUnitsRequest {
  village_id: string;
  recency_days?: number;
  publication_date?: string;
  /**
   * Per-run hint from the user (free text, e.g. "Bevorzuge kulturelle Veranstaltungen").
   * Prepended to the user message — does NOT replace the system prompt template.
   */
  selection_hint?: string;
}

const PROMPT_KEY = 'information_select';
const RANKING_KEY = 'selection_ranking';
const MIN_LEN = 20;
const MAX_LEN = 8000;
const STRICT_RECENCY_DAYS = 2;

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

async function loadRankingConfig(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<SelectionRankingConfig> {
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', RANKING_KEY)
    .maybeSingle();
  return normalizeSelectionRankingConfig(data?.value ?? null);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const endpoint = pathParts.length > 1 ? pathParts[1] : null;

    if (endpoint === 'ranking') {
      if (req.method === 'GET') {
        const config = await loadRankingConfig(supabase, userId);
        return jsonResponse({ data: { config, default_config: DEFAULT_SELECTION_RANKING_CONFIG } });
      }
      if (req.method === 'PUT') {
        const { config } = await req.json() as { config?: unknown };
        const validationError = validateSelectionRankingConfig(config);
        if (validationError) return errorResponse(validationError, 400, 'VALIDATION_ERROR');
        const normalized = normalizeSelectionRankingConfig(config);
        const { error: upsertError } = await supabase
          .from('user_settings')
          .upsert({
            user_id: userId,
            key: RANKING_KEY,
            value: normalized,
            updated_at: new Date().toISOString(),
          });
        if (upsertError) {
          console.error('selection ranking upsert error:', upsertError);
          return errorResponse('Fehler beim Speichern des Rankings', 500);
        }
        return jsonResponse({ data: { config: normalized, default_config: DEFAULT_SELECTION_RANKING_CONFIG } });
      }
      if (req.method === 'DELETE') {
        const { error: deleteError } = await supabase
          .from('user_settings')
          .delete()
          .eq('user_id', userId)
          .eq('key', RANKING_KEY);
        if (deleteError) {
          console.error('selection ranking delete error:', deleteError);
          return errorResponse('Fehler beim Zurücksetzen des Rankings', 500);
        }
        return jsonResponse({ data: { config: DEFAULT_SELECTION_RANKING_CONFIG, default_config: DEFAULT_SELECTION_RANKING_CONFIG } });
      }
      return errorResponse('Methode nicht erlaubt', 405);
    }

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
    const { village_id, selection_hint } = body;
    const recencyDays = STRICT_RECENCY_DAYS;
    const hint = selection_hint?.trim();

    // Validate input
    if (!village_id || typeof village_id !== 'string') {
      return errorResponse('village_id erforderlich', 400, 'VALIDATION_ERROR');
    }
    if (body.publication_date && !isIsoDate(body.publication_date)) {
      return errorResponse('publication_date muss YYYY-MM-DD sein', 400, 'VALIDATION_ERROR');
    }
    if (body.publication_date && !isWeekdayPublicationDate(body.publication_date)) {
      return errorResponse('publication_date muss Montag bis Freitag sein', 400, 'VALIDATION_ERROR');
    }

    const currentDate = zurichTodayIso();
    const publicationDate = body.publication_date ?? nextValidPublicationDateAfter(currentDate);

    // Query unused information units for this village (owned by user), ordered by recency.
    // Filter by location->>city = village_id — matches the bajour-auto-draft cron after
    // the 2026-04-21 normalization migration, so manual KI Entwurf and the 17:00 fan-out
    // see the same candidate pool regardless of which scout or ingest path produced them.
    let query = supabase
      .from('information_units')
      .select(`${UNIT_FOR_COMPOSE_COLUMNS}, village_confidence`)
      .eq('location->>city', village_id)
      .eq('user_id', userId)
      .eq('used_in_article', false);

    const newsStart = addDaysIsoDate(publicationDate, -STRICT_RECENCY_DAYS);
    const backstop30d = `${addDaysIsoDate(publicationDate, -30)}T00:00:00Z`;
    const eventEnd = addDaysIsoDate(publicationDate, 7);
    query = query
      .gte('created_at', backstop30d)
      .or([
        `and(unit_type.eq.event,event_date.gte.${publicationDate},event_date.lte.${eventEnd})`,
        `and(unit_type.neq.event,publication_date.gte.${newsStart})`,
        `and(unit_type.neq.event,publication_date.is.null,created_at.gte.${newsStart}T00:00:00Z)`,
      ].join(','));

    const { data: units, error } = await query
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Fetch units error:', error);
      return errorResponse('Fehler beim Laden der Einheiten', 500);
    }

    if (!units || units.length === 0) {
      console.warn('No units found', { userId, village_id, recencyDays });
      return jsonResponse({ data: { selected_unit_ids: [], selection_diagnostics: null } });
    }

    const rankingConfig = await loadRankingConfig(supabase, userId);
    const rankedUnits = rankSelectionCandidates(units, {
      currentDate,
      publicationDate,
      maxCandidates: 80,
      villageId: village_id,
    }, rankingConfig);
    const rankedRows = rankedUnits.map((row) => row.unit);

    // Format units for LLM
    const formattedUnits = formatUnitsForSelection(rankedRows);

    // System prompt template: DB override > hardcoded default. The per-run user `hint`
    // is appended to the user message below, NOT injected into the system prompt.
    const template = (await loadPromptOverride(supabase, userId)) ?? INFORMATION_SELECT_PROMPT;

    const userMessage = hint
      ? `Zusätzlicher Hinweis vom Redakteur für diese Auswahl: ${hint}\n\nHier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus. Berücksichtige den Hinweis oben.`
      : `Hier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus.`;

    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: buildInformationSelectPrompt(currentDate, recencyDays, template, publicationDate) },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    // Parse LLM response
    let selectedIds: string[];
    try {
      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      // Validate that returned IDs exist in the ranked candidate set.
      const validIds = new Set(rankedRows.map((u: { id: string }) => u.id));
      selectedIds = (parsed.selected_unit_ids || []).filter(
        (id: string) => validIds.has(id)
      );
    } catch {
      console.error('Failed to parse LLM response:', response.choices[0].message.content);
      selectedIds = selectDeterministicFallback(rankedUnits, MAX_UNITS_PER_COMPOSE);
    }

    // Fallback: if LLM returned empty selection but candidates exist, use deterministic ranking.
    if (selectedIds.length === 0 && rankedRows.length > 0) {
      console.warn('LLM returned empty selection, falling back to deterministic ranking', {
        candidateCount: rankedRows.length,
        village_id,
      });
      selectedIds = selectDeterministicFallback(rankedUnits, MAX_UNITS_PER_COMPOSE);
    }
    selectedIds = enforceMandatorySelection(selectedIds, rankedUnits, MAX_UNITS_PER_COMPOSE);
    selectedIds = refineSelectionForCompose(selectedIds, rankedUnits, MAX_UNITS_PER_COMPOSE, rankingConfig);
    const diagnostics = buildSelectionDiagnostics(rankedUnits, selectedIds, rankingConfig);

    return jsonResponse({
      data: {
        selected_unit_ids: selectedIds,
        selection_diagnostics: {
          ...diagnostics,
          selection_response_preview: response.choices[0].message.content?.slice(0, 1000) ?? null,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-select-units error:', message);
    if (message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(message, 500);
  }
});
