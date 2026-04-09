// Shared LLM prompt templates for Dorfkoenig edge functions.
// Two prompts, two jobs:
//   INFORMATION_SELECT_PROMPT — which units to pick
//   DRAFT_COMPOSE_PROMPT      — how to write the draft

/** System prompt for AI-powered unit selection. Used by bajour-select-units and bajour-auto-draft. */
export const INFORMATION_SELECT_PROMPT = `Du bist ein erfahrener Redakteur für einen wöchentlichen lokalen Newsletter.
Deine Aufgabe: Wähle die relevantesten Informationseinheiten für die nächste Ausgabe.

AUSWAHLKRITERIEN (nach Priorität):
1. AKTUALITÄT: {{recencyInstruction}}
2. RELEVANZ: Was interessiert die Einwohner dieses Dorfes JETZT?
3. VIELFALT: Decke verschiedene Themen ab (Politik, Kultur, Infrastruktur, Gesellschaft).
4. NEUIGKEITSWERT: Priorisiere Erstmeldungen über laufende Entwicklungen.

Wähle 5-15 Einheiten. Gib die IDs als JSON-Array zurück.
Heute ist: {{currentDate}}

AUSGABEFORMAT (JSON):
{
  "selected_unit_ids": ["uuid-1", "uuid-2", ...]
}`;

/**
 * Build the final selection prompt with runtime values.
 * If `override` is provided, it replaces the entire prompt (UI editor override).
 */
export function buildInformationSelectPrompt(
  currentDate: string,
  recencyDays: number | null,
  override?: string
): string {
  if (override) return override;

  const recencyInstruction = recencyDays !== null
    ? `Bevorzuge Informationen der letzten ${recencyDays} Tage STARK. Informationen älter als ${recencyDays * 2} Tage nur bei aussergewöhnlicher Bedeutung.`
    : `Berücksichtige alle verfügbaren Informationen unabhängig vom Alter. Neuere Informationen dürfen leicht bevorzugt werden.`;

  return INFORMATION_SELECT_PROMPT
    .replace('{{recencyInstruction}}', recencyInstruction)
    .replace('{{currentDate}}', currentDate);
}

/** Writing guidelines for draft composition. Used by compose and bajour-auto-draft. */
export const DRAFT_COMPOSE_PROMPT = `SCHREIBRICHTLINIEN:
- Beginne JEDEN Abschnitt mit der wichtigsten Tatsache — kein Vorgeplänkel
- Erster Satz jedes Abschnitts = die Nachricht. Kontext kommt danach.
- Fette **wichtige Zahlen, Namen, Daten und Daten** mit Markdown
- Sätze: KURZ und PRÄGNANT. Maximal 15-20 Wörter pro Satz.
- Absätze: Maximal 2-3 Sätze. Eine Idee pro Absatz.
- Beginne Aufzählungszeichen IMMER mit Emojis: 📊 (Daten) 📅 (Termine) 👤 (Personen) 🏢 (Organisationen) ⚠️ (Bedenken) ✅ (Fortschritt) 📍 (Orte)
- Beispiel: '📊 **42%** Anstieg der Wohnkosten [srf.ch]'
- Zitiere Quellen inline im Format [quelle.ch]
- Fakten aus mehreren Quellen sind glaubwürdiger — erwähne wenn verfügbar
- Füge eine "gaps"-Liste hinzu: was fehlt, wen interviewen, welche Daten verifizieren
- Priorisiere: Zahlen > Daten > Zitate > allgemeine Aussagen`;
