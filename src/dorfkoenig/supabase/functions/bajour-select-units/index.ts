// Bajour Select Units Edge Function
// Selects relevant information units for a village newsletter using LLM with recency bias

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';

interface SelectUnitsRequest {
  village_id: string;
  scout_id: string;
}

// Fixed system prompt for unit selection (not editable by users)
function buildSystemPrompt(currentDate: string): string {
  return `Du bist ein erfahrener Redakteur für einen wöchentlichen lokalen Newsletter.
Deine Aufgabe: Wähle die relevantesten Informationseinheiten für die nächste Ausgabe.

AUSWAHLKRITERIEN (nach Priorität):
1. AKTUALITÄT: Bevorzuge Informationen der letzten 7 Tage STARK.
   Informationen älter als 14 Tage nur bei aussergewöhnlicher Bedeutung.
2. RELEVANZ: Was interessiert die Einwohner dieses Dorfes JETZT?
3. VIELFALT: Decke verschiedene Themen ab (Politik, Kultur, Infrastruktur, Gesellschaft).
4. NEUIGKEITSWERT: Priorisiere Erstmeldungen über laufende Entwicklungen.

Wähle 5-15 Einheiten. Gib die IDs als JSON-Array zurück.
Heute ist: ${currentDate}

AUSGABEFORMAT (JSON):
{
  "selected_unit_ids": ["uuid-1", "uuid-2", ...]
}`;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const body: SelectUnitsRequest = await req.json();
    const { village_id, scout_id } = body;

    // Validate input
    if (!village_id || typeof village_id !== 'string') {
      return errorResponse('village_id erforderlich', 400, 'VALIDATION_ERROR');
    }
    if (!scout_id || typeof scout_id !== 'string') {
      return errorResponse('scout_id erforderlich', 400, 'VALIDATION_ERROR');
    }

    // Query unused information units for this scout, ordered by recency
    const { data: units, error } = await supabase
      .from('information_units')
      .select('id, statement, unit_type, event_date, created_at')
      .eq('scout_id', scout_id)
      .eq('used_in_article', false)
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Fetch units error:', error);
      return errorResponse('Fehler beim Laden der Einheiten', 500);
    }

    if (!units || units.length === 0) {
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
        { role: 'system', content: buildSystemPrompt(currentDate) },
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

    return jsonResponse({ data: { selected_unit_ids: selectedIds } });
  } catch (error) {
    console.error('bajour-select-units error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});
