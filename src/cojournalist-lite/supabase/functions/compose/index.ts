// Compose Edge Function - Article draft generation from information units

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';

interface GenerateRequest {
  unit_ids: string[];
  style?: 'news' | 'summary' | 'analysis';
  max_words?: number;
  include_sources?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const endpoint = pathParts.length > 2 ? pathParts[2] : null;

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    if (endpoint === 'generate') {
      return await generateDraft(supabase, userId, req);
    }

    return errorResponse('Endpoint nicht gefunden', 404);
  } catch (error) {
    console.error('Compose error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});

// Generate article draft from selected units
async function generateDraft(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  req: Request
) {
  const body: GenerateRequest = await req.json();
  const {
    unit_ids,
    style = 'news',
    max_words = 500,
    include_sources = true,
  } = body;

  // Validate
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

  // Extract frequent entities
  const entityCounts = new Map<string, number>();
  for (const unit of units) {
    for (const entity of unit.entities || []) {
      entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
    }
  }
  const frequentEntities = Array.from(entityCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([entity]) => entity);

  // Collect sources
  const sources = new Map<string, { title: string | null; url: string; domain: string }>();
  for (const unit of units) {
    if (!sources.has(unit.source_url)) {
      sources.set(unit.source_url, {
        title: unit.source_title,
        url: unit.source_url,
        domain: unit.source_domain,
      });
    }
  }

  // Build prompt
  const styleInstructions = getStyleInstructions(style);

  const systemPrompt = `Du bist ein erfahrener Journalist. Schreibe einen Artikelentwurf basierend auf den gegebenen Informationseinheiten.

${styleInstructions}

REGELN:
- Schreibe auf Deutsch
- Maximale Länge: ${max_words} Wörter
- Strukturiere den Artikel mit Überschriften (## für Abschnitte)
- Verwende kurze, prägnante Sätze (max. 20 Wörter)
- Fette wichtige Zahlen und Daten mit **bold**
- Füge Inline-Quellverweise hinzu [domain.com]
- Liste Lücken auf (fehlende Informationen, noch zu verifizieren)

AUSGABEFORMAT (JSON):
{
  "title": "Artikel-Titel",
  "headline": "Ein-Satz-Lead (max 150 Zeichen)",
  "sections": [
    {
      "heading": "Abschnittsüberschrift",
      "content": "Abschnittsinhalt..."
    }
  ],
  "gaps": ["Fehlende Info 1", "Noch zu verifizieren: ..."],
  "word_count": 123
}`;

  let userContent = '';

  if (facts.length > 0) {
    userContent += 'FAKTEN:\n';
    for (const f of facts) {
      userContent += `- ${f.statement} [${f.source_domain}]\n`;
    }
    userContent += '\n';
  }

  if (events.length > 0) {
    userContent += 'EREIGNISSE:\n';
    for (const e of events) {
      userContent += `- ${e.statement} [${e.source_domain}]\n`;
    }
    userContent += '\n';
  }

  if (entityUpdates.length > 0) {
    userContent += 'AKTUALISIERUNGEN:\n';
    for (const u of entityUpdates) {
      userContent += `- ${u.statement} [${u.source_domain}]\n`;
    }
    userContent += '\n';
  }

  if (frequentEntities.length > 0) {
    userContent += `HÄUFIG GENANNTE ENTITÄTEN: ${frequentEntities.join(', ')}\n\n`;
  }

  userContent += 'Erstelle einen Artikelentwurf basierend auf diesen Informationen.';

  // Generate draft
  const response = await openrouter.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  });

  let draft;
  try {
    draft = JSON.parse(response.choices[0].message.content);
  } catch {
    return errorResponse('Fehler bei der Entwurfserstellung', 500);
  }

  return jsonResponse({
    data: {
      title: draft.title || 'Unbenannter Entwurf',
      headline: draft.headline || '',
      sections: draft.sections || [],
      gaps: draft.gaps || [],
      sources: include_sources ? Array.from(sources.values()) : [],
      word_count: draft.word_count || 0,
      units_used: units.length,
    },
  });
}

// Get style-specific instructions
function getStyleInstructions(style: string): string {
  switch (style) {
    case 'news':
      return `STIL: Nachrichtenartikel
- Beginne mit dem Wichtigsten (umgekehrte Pyramide)
- Objektiver, sachlicher Ton
- Aktive Verben, konkrete Fakten
- Zitate wenn möglich`;

    case 'summary':
      return `STIL: Zusammenfassung
- Kompakte Darstellung der Kernpunkte
- Bulletpoints für Übersichtlichkeit
- Keine Details, nur Hauptaussagen
- Chronologische oder thematische Ordnung`;

    case 'analysis':
      return `STIL: Analyse
- Tiefere Einordnung der Fakten
- Kontext und Hintergründe erklären
- Zusammenhänge aufzeigen
- Mögliche Entwicklungen andeuten`;

    default:
      return '';
  }
}
