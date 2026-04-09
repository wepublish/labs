/**
 * @module compose
 * Article draft generation from selected information units.
 * POST: generates a structured draft using a 3-layer German SMART BREVITY prompt
 * with optional Firecrawl source enrichment and custom system prompt.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { scrape } from '../_shared/firecrawl.ts';
import { DRAFT_COMPOSE_PROMPT, formatUnitsByType } from '../_shared/prompts.ts';
import { MAX_UNITS_PER_COMPOSE, MAX_SOURCE_CONTENT_CHARS } from '../_shared/constants.ts';

interface GenerateRequest {
  unit_ids: string[];
  style?: 'news' | 'summary' | 'analysis';
  max_words?: number;
  include_sources?: boolean;
  custom_system_prompt?: string;
}

// --- SSRF protection ---

function isSafeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return false;
    // Block cloud metadata
    if (['169.254.169.254', 'metadata.google.internal'].includes(hostname)) return false;
    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every(p => !isNaN(Number(p)))) {
      const first = Number(parts[0]);
      const second = Number(parts[1]);
      if (first === 10) return false;
      if (first === 172 && second >= 16 && second <= 31) return false;
      if (first === 192 && second === 168) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// --- Firecrawl source enrichment ---

async function fetchSourceContent(urls: string[]): Promise<Map<string, string>> {
  const safeUrls = urls.filter(isSafeUrl).slice(0, 10); // Max 10 sources
  if (safeUrls.length === 0) return new Map();

  const results = await Promise.allSettled(
    safeUrls.map(async (url) => {
      const result = await scrape({ url, formats: ['markdown'], timeout: 5000 });
      return { url, markdown: result.success ? result.markdown : null };
    })
  );

  const contentMap = new Map<string, string>();
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.markdown) {
      contentMap.set(result.value.url, result.value.markdown.slice(0, 8000)); // Cap at 8K per source
    }
  }
  return contentMap;
}

// --- 3-layer German system prompt ---

const LAYER_1_GROUNDING = `Du bist ein Assistent für Journalisten im SMART BREVITY Stil. Erstelle einen strukturierten Arbeitsentwurf aus atomaren Informationseinheiten. Dies ist KEIN publizierbarer Artikel — es ist ein Rohentwurf, um die Arbeit von Journalisten zu beschleunigen.

Jede Einheit ist eine verifizierte, faktische Aussage. Einheiten sind nach Typ gruppiert:
- FAKTEN: Überprüfbare Aussagen mit konkreten Daten
- EREIGNISSE: Dinge, die passiert sind oder passieren werden
- AKTUALISIERUNGEN: Änderungen im Status von Personen, Organisationen oder Orten

KRITISCH - GRUNDREGELN (UNVERÄNDERLICH):
- Verwende NUR die bereitgestellten Einheiten - KEINE Halluzination
- Füge NIEMALS Fakten, Zitate, Daten oder Statistiken hinzu, die nicht in den Einheiten oder Quellinhalten enthalten sind
- Bei fehlenden Informationen: Liste sie unter 'gaps' auf — fülle NICHT mit Annahmen
- Jede Behauptung im Entwurf muss auf eine bestimmte Einheit oder Quelle zurückführbar sein

KRITISCH - UMGANG MIT MEHREREN THEMEN (UNVERÄNDERLICH):
- Wenn Einheiten Entitäten, Themen oder Motive teilen: gruppiere sie in zusammenhängende Abschnitte
- Wenn Einheiten UNZUSAMMENHÄNGEND sind: organisiere in SEPARATE EIGENSTÄNDIGE Abschnitte mit klaren Überschriften
- Erfinde NIEMALS Verbindungen oder impliziere Beziehungen zwischen Fakten, die nicht existieren
- Verwende NIEMALS Übergangssätze wie "Inzwischen" oder "In verwandten Nachrichten" für unzusammenhängende Themen
- Jeder Abschnitt sollte für sich stehen`;

const LAYER_2_DEFAULT_GUIDELINES = DRAFT_COMPOSE_PROMPT;

const LAYER_3_OUTPUT_FORMAT = `ÜBERSCHRIFT: Ein Satz, der den nachrichtenwürdigsten Aspekt erfasst. Beginne mit der Auswirkung, nicht mit der Zuordnung.
ABSCHNITTE: Jede Abschnittsüberschrift sollte 2-4 Wörter lang sein. Inhalt beginnt mit der Nachricht, dann Kontext.

Schreibe den gesamten Artikel auf Deutsch.

Ausgabeformat (JSON):
{
  "title": "Artikeltitel",
  "headline": "Ein-Satz-Lead, der den nachrichtenwürdigsten Aspekt zusammenfasst",
  "sections": [
    {
      "heading": "Abschnittsüberschrift, die verwandte Fakten gruppiert",
      "content": "📊 **Schlüsselzahl** erklärt die Nachricht [quelle.ch]. 📅 Die Frist ist..."
    }
  ],
  "gaps": ["Was fehlt oder verifiziert werden muss", "Wer interviewt werden sollte", "Noch benötigte Daten"]
}`;

// --- Main handler ---

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Supabase strips /functions/v1/ prefix — function sees /compose/{endpoint}
    // pathParts: ['compose', '{endpoint}']
    const endpoint = pathParts.length > 1 ? pathParts[1] : null;

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
    include_sources = true,
    custom_system_prompt,
  } = body;

  // Validate
  if (!Array.isArray(unit_ids) || unit_ids.length === 0) {
    return errorResponse('unit_ids Array erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (unit_ids.length > MAX_UNITS_PER_COMPOSE) {
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

  // Collect sources (deduplication for response)
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

  // --- Build 3-layer system prompt ---

  // Layer 2: use custom prompt if provided, otherwise default guidelines
  const layer2 = custom_system_prompt || LAYER_2_DEFAULT_GUIDELINES;

  const systemPrompt = `${LAYER_1_GROUNDING}

${layer2}

${LAYER_3_OUTPUT_FORMAT}`;

  // --- Build user prompt ---

  const formattedUnits = formatUnitsByType(units);

  // Extract unique source URLs and fetch via Firecrawl
  const uniqueUrls = [...new Set(units.map(u => u.source_url).filter(Boolean))];
  const sourceContents = await fetchSourceContent(uniqueUrls);

  // Build source context
  let sourceSection = '';
  if (sourceContents.size > 0) {
    const parts: string[] = [];
    for (const [url, content] of sourceContents) {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      parts.push(`[Quelle: ${domain}]\n${content}`);
    }
    sourceSection = `\n\nQUELLENINHALT (für zusätzlichen Kontext — verwende um Lücken in den Einheiten zu füllen):\n${parts.join('\n\n---\n\n').slice(0, MAX_SOURCE_CONTENT_CHARS)}`;
  }

  // Entity context
  let entityContext = '';
  if (frequentEntities.length > 0) {
    entityContext = `\n\nHÄUFIG GENANNTE ENTITÄTEN: ${frequentEntities.join(', ')}`;
  }

  // Final user prompt
  const userContent = `${formattedUnits}${entityContext}${sourceSection}\n\nErstelle einen Artikelentwurf basierend auf diesen Informationen. Gruppiere verwandte Fakten zusammen. Verwende die Quellinhalte für zusätzliche Details (Zitate, Daten, Kontext), die in den atomaren Einheiten fehlen könnten.`;

  // --- Generate draft via OpenRouter ---

  const response = await openrouter.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
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
