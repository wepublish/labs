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
 * `template` defaults to the hardcoded prompt; pass a user override (from user_prompts table
 * or a per-request body field) to substitute placeholders against that instead. The PUT
 * validator on the edit endpoint enforces that overrides contain both placeholders.
 */
export function buildInformationSelectPrompt(
  currentDate: string,
  recencyDays: number | null,
  template: string = INFORMATION_SELECT_PROMPT
): string {
  const recencyInstruction = recencyDays !== null
    ? `Bevorzuge Informationen der letzten ${recencyDays} Tage STARK. Informationen älter als ${recencyDays * 2} Tage nur bei aussergewöhnlicher Bedeutung.`
    : `Berücksichtige alle verfügbaren Informationen unabhängig vom Alter. Neuere Informationen dürfen leicht bevorzugt werden.`;

  return template
    .replace('{{recencyInstruction}}', recencyInstruction)
    .replace('{{currentDate}}', currentDate);
}

// --- Unit formatting helpers ---
// Used by bajour-select-units, bajour-auto-draft, and compose to build LLM input.

interface UnitForSelect {
  id: string;
  statement: string;
  unit_type: string;
  event_date?: string | null;
  created_at?: string | null;
}

/** Format units as a numbered list for LLM selection prompts. */
export function formatUnitsForSelection(units: UnitForSelect[]): string {
  return units
    .map((unit, i) => {
      const date = unit.event_date || unit.created_at?.split('T')[0] || 'unbekannt';
      return `[${i + 1}] ID: ${unit.id} | Datum: ${date} | Typ: ${unit.unit_type} | ${unit.statement}`;
    })
    .join('\n');
}

interface UnitForCompose {
  statement: string;
  unit_type: string;
  source_domain: string;
  source_url: string;
  event_date?: string | null;
  created_at?: string | null;
}

/**
 * Canonical SELECT list for unit rows consumed by the compose/auto-draft/select
 * pipeline. Keep aligned with `UnitForCompose` above.
 */
export const UNIT_FOR_COMPOSE_COLUMNS =
  'id, statement, unit_type, event_date, created_at, source_domain, source_url';

/**
 * Format units grouped by type (FAKTEN / EREIGNISSE / AKTUALISIERUNGEN).
 * Used by compose and bajour-auto-draft for draft generation prompts.
 * When `includeDates` is true, each line is prefixed with `[date]`.
 */
export function formatUnitsByType(units: UnitForCompose[], includeDates = false): string {
  const groups: [string, UnitForCompose[]][] = [
    ['FAKTEN', units.filter(u => u.unit_type === 'fact')],
    ['EREIGNISSE', units.filter(u => u.unit_type === 'event')],
    ['AKTUALISIERUNGEN', units.filter(u => u.unit_type === 'entity_update')],
  ];

  return groups
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => {
      const lines = items.map(u => {
        const prefix = includeDates
          ? `[${u.event_date || u.created_at?.split('T')[0] || 'unbekannt'}] `
          : '';
        const citation = u.source_url
          ? `[${u.source_domain}](${u.source_url})`
          : `[${u.source_domain}]`;
        return `- ${prefix}${u.statement} ${citation}`;
      });
      return `${label}:\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

/** Writing guidelines for draft composition. Used by compose and bajour-auto-draft. */
export const DRAFT_COMPOSE_PROMPT = `SCHREIBRICHTLINIEN:
- Beginne JEDEN Abschnitt mit der wichtigsten Tatsache — kein Vorgeplänkel
- Erster Satz jedes Abschnitts = die Nachricht. Kontext kommt danach.
- Fette **wichtige Zahlen, Namen, Daten und Daten** mit Markdown
- Sätze: KURZ und PRÄGNANT. Maximal 15-20 Wörter pro Satz.
- Absätze: Maximal 2-3 Sätze. Eine Idee pro Absatz.
- Beginne Aufzählungszeichen IMMER mit Emojis: 📊 (Daten) 📅 (Termine) 👤 (Personen) 🏢 (Organisationen) ⚠️ (Bedenken) ✅ (Fortschritt) 📍 (Orte)
- Beispiel: '📊 **42%** Anstieg der Wohnkosten [srf.ch](https://www.srf.ch/artikel)'
- Zitiere Quellen inline als Markdown-Link [quelle.ch](https://url) mit der
  exakten Artikel-URL aus der Einheit — keine Abkürzungen, keine Änderungen.
- Beginne jede Meldung mit einem passenden Emoji und referenziere die Quelle
  sprachlich im Text (z.B. "wie die bz Basel schreibt").
- GEMEINDE-EXKLUSIVITÄT: Dieser Entwurf ist ausschliesslich für die benannte
  Ziel-Gemeinde. Einheiten, die primär eine andere Gemeinde betreffen, dürfen
  NICHT als eigenständige Meldung auftauchen. Beiläufige Erwähnungen anderer
  Orte (Regionales, Kantonales) sind nur zulässig, wenn sie klaren Bezug zur
  Ziel-Gemeinde haben.
- Fakten aus mehreren Quellen sind glaubwürdiger — erwähne wenn verfügbar
- Füge eine "gaps"-Liste hinzu: was fehlt, wen interviewen, welche Daten verifizieren
- Priorisiere: Zahlen > Daten > Zitate > allgemeine Aussagen`;
