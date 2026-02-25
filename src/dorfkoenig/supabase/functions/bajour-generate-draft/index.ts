// Bajour Generate Draft Edge Function
// Generates a newsletter draft from selected units using a 3-layer prompt system

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';

interface GenerateDraftRequest {
  village_id: string;
  village_name: string;
  unit_ids: string[];
  custom_system_prompt?: string;
}

// --- 3-Layer German newsletter prompt ---

function buildLayer1(villageName: string): string {
  return `Du bist ein KI-Assistent für den Newsletter "${villageName} — Wochenüberblick".
Du schreibst AUSSCHLIEßLICH basierend auf den bereitgestellten Informationseinheiten.
ERFINDE KEINE Informationen. Wenn etwas unklar ist, kennzeichne es als "nicht bestätigt".`;
}

const LAYER_2_DEFAULT_GUIDELINES = `SCHREIBRICHTLINIEN:
- Newsletter-Format: Kurz, prägnant, informativ
- Beginne mit der wichtigsten Nachricht der Woche
- Fette **wichtige Namen, Zahlen, Daten**
- Sätze: Max 15-20 Wörter, aktive Sprache
- Zitiere Quellen inline [quelle.ch]
- Absätze: 2-3 Sätze pro Nachricht
- Gesamtlänge: 800-1200 Wörter
- Tonalität: Nahbar, lokal, vertrauenswürdig
- Schliesse mit einem Ausblick auf kommende Ereignisse`;

const LAYER_3_OUTPUT_FORMAT = `Schreibe den gesamten Newsletter auf Deutsch.

Ausgabeformat (JSON):
{
  "title": "Wochentitel",
  "greeting": "Kurze Begrüssung (1 Satz)",
  "sections": [
    {
      "heading": "Abschnittsüberschrift",
      "body": "Inhalt mit **Hervorhebungen** und [Quellen]"
    }
  ],
  "outlook": "Ausblick auf nächste Woche",
  "sign_off": "Abschlussgruss"
}`;

// --- Unit formatting helpers ---

function formatDate(unit: { event_date?: string | null; created_at: string }): string {
  if (unit.event_date) {
    return unit.event_date;
  }
  return unit.created_at?.split('T')[0] || 'unbekannt';
}

function formatUnit(unit: {
  event_date?: string | null;
  created_at: string;
  statement: string;
  source_domain: string;
}): string {
  return `- [${formatDate(unit)}] ${unit.statement} [${unit.source_domain}]`;
}

// --- Main handler ---

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

    const body: GenerateDraftRequest = await req.json();
    const { village_name, unit_ids, custom_system_prompt } = body;

    // Validate input
    if (!Array.isArray(unit_ids) || unit_ids.length === 0) {
      return errorResponse('unit_ids Array erforderlich', 400, 'VALIDATION_ERROR');
    }
    if (unit_ids.length > 20) {
      return errorResponse('Maximal 20 Einheiten erlaubt', 400, 'VALIDATION_ERROR');
    }

    // Fetch units
    const { data: units, error } = await supabase
      .from('information_units')
      .select('*')
      .eq('user_id', userId)
      .in('id', unit_ids);

    if (error) {
      console.error('Fetch units error:', error);
      return errorResponse('Fehler beim Laden der Einheiten', 500);
    }

    if (!units || units.length === 0) {
      return errorResponse('Keine Einheiten gefunden', 404);
    }

    // Group units by type
    const facts = units.filter((u) => u.unit_type === 'fact');
    const events = units.filter((u) => u.unit_type === 'event');
    const entityUpdates = units.filter((u) => u.unit_type === 'entity_update');

    // Format units grouped by type
    let formattedUnits = '';

    if (facts.length > 0) {
      formattedUnits += 'FAKTEN:\n';
      for (const f of facts) {
        formattedUnits += formatUnit(f) + '\n';
      }
      formattedUnits += '\n';
    }

    if (events.length > 0) {
      formattedUnits += 'EREIGNISSE:\n';
      for (const e of events) {
        formattedUnits += formatUnit(e) + '\n';
      }
      formattedUnits += '\n';
    }

    if (entityUpdates.length > 0) {
      formattedUnits += 'AKTUALISIERUNGEN:\n';
      for (const u of entityUpdates) {
        formattedUnits += formatUnit(u) + '\n';
      }
      formattedUnits += '\n';
    }

    // Build 3-layer system prompt
    // Layer 2: use custom prompt if provided, otherwise default guidelines
    const layer2 = custom_system_prompt || LAYER_2_DEFAULT_GUIDELINES;

    const systemPrompt = `${buildLayer1(village_name)}

${layer2}

${LAYER_3_OUTPUT_FORMAT}`;

    // Generate draft via OpenRouter
    const response = await openrouter.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Hier sind die Informationseinheiten für den Newsletter:\n\n${formattedUnits}\nErstelle den Newsletter basierend auf diesen Informationen.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    // Parse LLM response
    let draft;
    try {
      draft = JSON.parse(response.choices[0].message.content);
    } catch {
      console.error('Failed to parse LLM response:', response.choices[0].message.content);
      return errorResponse('Fehler bei der Entwurfserstellung', 500);
    }

    return jsonResponse({
      data: {
        title: draft.title || 'Unbenannter Entwurf',
        greeting: draft.greeting || '',
        sections: draft.sections || [],
        outlook: draft.outlook || '',
        sign_off: draft.sign_off || '',
        units_used: units.length,
      },
    });
  } catch (error) {
    console.error('bajour-generate-draft error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});
