// Shared LLM prompt templates for Dorfkoenig edge functions.
// Two prompts, two jobs:
//   INFORMATION_SELECT_PROMPT — which units to pick
//   DRAFT_COMPOSE_PROMPT      — how to write the draft
//
import { isArticleLevelUrl } from './source-url.ts';

// Version stamps for DRAFT_QUALITY.md §3.6 hygiene. Bump when prompt text changes
// in the same PR; benchmarks (§4) gate the change. user_prompts.based_on_version
// persists the version an override was derived from so `specs/DATABASE.md`
// stale-override query can flag drift.
export const DEFAULT_PROMPT_VERSIONS = {
  information_select: 2,
  draft_compose: 5,
  // web_extraction and zeitung_extraction mirror the prompt-version constants
  // exported from their respective modules.
} as const;

/** System prompt for AI-powered unit selection. Used by bajour-select-units and bajour-auto-draft. */
export const INFORMATION_SELECT_PROMPT = `Du bist ein erfahrener Redakteur für einen wöchentlichen lokalen Newsletter.
Deine Aufgabe: Wähle die relevantesten Informationseinheiten für die nächste Ausgabe.

ZEITPUNKT (WICHTIG):
Heute ist: {{currentDate}}
Dieser Entwurf erscheint am: {{publicationDate}} (Folgetag, morgen früh).
Treffe Auswahl und Formulierung aus Lesersicht des Erscheinungsdatums:
- Veranstaltungen am {{publicationDate}} = "heute"
- Veranstaltungen am {{publicationDateP1}} = "morgen"
- Veranstaltungen am {{currentDate}} = "gestern" (meist nicht mehr relevant)

AUSWAHLKRITERIEN (nach Priorität):
1. LOKALER NACHRICHTENWERT: Sicherheit, Polizei/Feuerwehr, Unfälle,
   Verkehrsbehinderungen, Schule, Wasser/Gesundheit, Behördenentscheide,
   öffentliche Gelder und Infrastruktur sind wichtiger als weiche Füllmeldungen.
2. AKTUALITÄT: {{recencyInstruction}}
3. RELEVANZ: Was interessiert die Einwohner dieses Dorfes am Erscheinungstag?
4. VIELFALT: Decke verschiedene Themen ab, aber nie auf Kosten einer starken
   Sicherheits- oder Behördenmeldung.
5. NEUIGKEITSWERT: Priorisiere Erstmeldungen über laufende Entwicklungen.

FÜLLMELDUNGEN:
Geburtstage, Hochzeiten, Vereinsnotizen und dünne Veranstaltungshinweise sind nur
Ersatz, wenn keine harten lokalen Nachrichten verfügbar sind.

TERMIN- UND ALTERSGEWICHTUNG:
- Veranstaltungen am Erscheinungstag sind relevant. Zukünftige Veranstaltungen
  gehören in ihre spätere Tagesausgabe; wähle sie nur, wenn heute eine
  Anmeldefrist, Entscheidung oder Vorbereitung für Leser nötig ist.
- Bei kurzen Baustellen/Sperrungen ist der START wichtiger als das Ende.
- Ältere Personenmeldungen, abgeschlossene Gemeinderatsmeldungen oder alte
  sensible Ereignisse nur aufnehmen, wenn eine neue Entwicklung vorliegt.
- Nachbargemeinden nur auswählen, wenn der Nutzen für die Ziel-Gemeinde explizit
  ist; keinen generischen "Blick über die Gemeindegrenze".

DEDUP — bereits publizierte Einheiten:
Einheiten mit Marker "PUBLISHED:JJJJ-MM-TT" wurden in einem vorherigen Newsletter
für diese Gemeinde verwendet. Nimm sie nur auf, wenn es eine neue Entwicklung gibt
(neues Datum, neue Zahl, neuer Stand, neue Quelle). Sonst überspringen.

Wähle 5-15 Einheiten. Gib die IDs als JSON-Array zurück.

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
  template: string = INFORMATION_SELECT_PROMPT,
  publicationDate?: string,
): string {
  const recencyInstruction = recencyDays !== null
    ? `Bevorzuge Informationen der letzten ${recencyDays} Tage STARK. Informationen älter als ${recencyDays * 2} Tage nur bei aussergewöhnlicher Bedeutung.`
    : `Berücksichtige alle verfügbaren Informationen unabhängig vom Alter. Neuere Informationen dürfen leicht bevorzugt werden.`;

  const pubDate = publicationDate ?? addDaysIso(currentDate, 1);
  const pubDateP1 = addDaysIso(pubDate, 1);

  return template
    .replace('{{recencyInstruction}}', recencyInstruction)
    .replace(/{{currentDate}}/g, currentDate)
    .replace(/{{publicationDate}}/g, pubDate)
    .replace(/{{publicationDateP1}}/g, pubDateP1);
}

/** Pure helper: ISO YYYY-MM-DD + N days. Treats input as UTC date. */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- Unit formatting helpers ---
// Used by bajour-select-units, bajour-auto-draft, and compose to build LLM input.

interface UnitForSelect {
  id: string;
  statement: string;
  unit_type: string;
  event_date?: string | null;
  created_at?: string | null;
  publication_date?: string | null;
  quality_score?: number | null;
  sensitivity?: string | null;
  article_url?: string | null;
  is_listing_page?: boolean | null;
  village_confidence?: string | null;
  source_domain?: string | null;
}

/**
 * Format units as a numbered list for LLM selection prompts.
 * `previouslyPublished` is an optional map of unit_id → most-recent ISO date the
 * unit appeared in a published draft for this village. When set, the matching
 * candidate line gains a `PUBLISHED:YYYY-MM-DD` token so the LLM can apply the
 * dedup rule. Absence is the signal — unmatched candidates carry no token.
 */
export function formatUnitsForSelection(
  units: UnitForSelect[],
  previouslyPublished?: Map<string, string>,
): string {
  return units
    .map((unit, i) => {
      const date = unit.event_date || unit.created_at?.split('T')[0] || 'unbekannt';
      const pubDate = previouslyPublished?.get(unit.id);
      const pubMarker = pubDate ? ` | PUBLISHED:${pubDate}` : '';
      const quality = unit.quality_score ?? '-';
      const publication = unit.publication_date ?? unit.created_at?.split('T')[0] ?? 'unbekannt';
      const sensitivity = unit.sensitivity ?? 'none';
      const urlType = unit.article_url && !unit.is_listing_page ? 'article' : 'no_article';
      const villageConfidence = unit.village_confidence ?? '-';
      const source = unit.source_domain ?? '-';
      return `[${i + 1}] ID: ${unit.id} | Datum: ${date} | Publikation: ${publication} | Typ: ${unit.unit_type} | Qualität: ${quality} | Sensitiv: ${sensitivity} | URL: ${urlType} | Ortsvertrauen: ${villageConfidence} | Quelle: ${source}${pubMarker} | ${unit.statement}`;
    })
    .join('\n');
}

interface UnitForCompose {
  id?: string;
  statement: string;
  unit_type: string;
  source_domain: string;
  source_url: string;
  event_date?: string | null;
  publication_date?: string | null;
  created_at?: string | null;
  article_url?: string | null;
  is_listing_page?: boolean | null;
  quality_score?: number | null;
  sensitivity?: string | null;
  source_citation?: { citation_label?: string | null } | null;
}

/**
 * Canonical SELECT list for unit rows consumed by the compose/auto-draft/select
 * pipeline. Keep aligned with `UnitForCompose` above.
 */
export const UNIT_FOR_COMPOSE_COLUMNS =
  'id, statement, unit_type, event_date, publication_date, created_at, source_domain, source_url, source_citation, article_url, is_listing_page, quality_score, sensitivity';

/**
 * Format units grouped by type (FAKTEN / EREIGNISSE / AKTUALISIERUNGEN).
 * Legacy v1 format — retained for back-compat with compose/index.ts until it
 * migrates to the bullet schema. New code should use `formatUnitsForCompose`.
 * When `includeDates` is true, each line is prefixed with `[date]`.
 */
export function formatUnitsByType(units: UnitForCompose[], includeDates = false): string {
  const groups: [string, UnitForCompose[]][] = [
    ['FAKTEN', units.filter(u => u.unit_type === 'fact')],
    ['EREIGNISSE', units.filter(u => u.unit_type === 'event')],
    ['AKTUALISIERUNGEN', units.filter(u => u.unit_type === 'entity_update')],
    ['VERSPRECHEN', units.filter(u => u.unit_type === 'promise')],
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

/**
 * DRAFT_QUALITY.md §3.4.2. Plain-data format for the v2 bullet schema.
 * The LLM receives raw fields as pipe-separated columns, NOT pre-formatted
 * Markdown. This prevents the "[domain](homepage)(real-url)" double-link bug
 * caused by the LLM treating already-formatted input as data and re-formatting.
 *
 * §3.4.3 listing-page guard is applied here: units with is_listing_page=true
 * or article_url=null are marked NO_LINK so the prompt can skip citation.
 */
export function formatUnitsForCompose(units: UnitForCompose[]): string {
  if (units.length === 0) return '(keine Einheiten)';

  const typeLabel: Record<string, string> = {
    fact: 'FAKT',
    event: 'EREIGNIS',
    entity_update: 'UPDATE',
    promise: 'VERSPRECHEN',
  };

  return units
    .map((u, i) => {
      const type = typeLabel[u.unit_type] ?? u.unit_type.toUpperCase();
      const date = u.event_date ?? u.created_at?.split('T')[0] ?? 'unbekannt';
      const publicationDate = u.publication_date ?? u.created_at?.split('T')[0] ?? 'unbekannt';
      const url = u.article_url && !u.is_listing_page && isArticleLevelUrl(u.article_url) ? u.article_url : 'NO_LINK';
      const domain = u.source_domain || 'unbekannt';
      const citation = typeof u.source_citation?.citation_label === 'string' && u.source_citation.citation_label.trim()
        ? ` | CITATION:${u.source_citation.citation_label.trim()}`
        : '';
      const quality = u.quality_score ?? '-';
      const sens = u.sensitivity && u.sensitivity !== 'none' ? ` | SENSITIV:${u.sensitivity}` : '';
      const idPart = u.id ? ` | ID:${u.id}` : '';
      return `[${i + 1}] ${type} | EVENT:${date} | PUB:${publicationDate} | ${u.statement} | URL:${url} | DOMAIN:${domain}${citation} | QUALITY:${quality}${sens}${idPart}`;
    })
    .join('\n');
}

/** Writing guidelines for draft composition. v1 (legacy markdown schema). */
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

/**
 * DRAFT_QUALITY.md §3.4. Bullet-only compose prompt (v2).
 *
 * Under-produce clause appears top AND bottom — negative constraints stick
 * better when repeated. Anti-pattern table comes from §2.4 and is inlined
 * deterministically by buildDraftComposePromptV2().
 */
export const DRAFT_COMPOSE_PROMPT_V2 = `QUALITÄTSSCHWELLE:
Wenn du keine Meldung findest, die den Regeln entspricht, gib "bullets": []
zurück und erkläre in "notes_for_editor" warum. Ein einzelnes starkes,
konkretes lokales Bullet ist erlaubt. Ein leerer Entwurf ist besser als
erfundener Inhalt. NIEMALS Füllsätze, NIEMALS eine Begrüssung oder einen
Ausblick, NIEMALS eine Grussformel.

AUFGABE:
Schreibe einen kompakten Nachrichten-Digest als JSON-Array von Bullets.
Keine Einleitung, keine Überschriften, kein Ausblick, keine Abschlussformel.
Jedes Bullet ist eine eigenständige Meldung.

AUSGABEFORMAT (JSON):
{
  "title": "Ortsname — Wochentag, TT. Monat JJJJ",
  "bullets": [
    {
      "emoji": "🏠",
      "kind": "lead" | "secondary" | "event" | "good_news",
      "text": "1–2 kurze Sätze auf Deutsch, ohne führendes Emoji im Text.",
      "article_url": "URL aus der Einheit oder null",
      "source_domain": "Anzeigename der Quelle, z. B. 'bz Basel'",
      "source_unit_ids": ["UUID der verwendeten Einheit(en)"]
    }
  ],
  "notes_for_editor": ["kurze Hinweise zur Redaktion, leer erlaubt"]
}

BULLET-REGELN:
- Maximal 4 Bullets gesamt. 0 Bullets sind ausdrücklich erlaubt (siehe QUALITÄTSSCHWELLE).
- Lieber 1-3 starke Bullets als 4 schwache. Keine Pflicht, alle Themen oder
  Kategorien zu füllen.
- kind-Obergrenzen: lead max 1 · secondary max 2 · event max 2 · good_news max 1.
- 1–2 kurze Sätze pro Bullet (insgesamt < 200 Zeichen).
- emoji ist frei wählbar: Wähle ein präzises, thematisch passendes Emoji. Keine feste Palette.
- text enthält KEIN führendes Emoji — das fügt das Rendering hinzu.

ZITATION:
- Jedes Bullet enthält höchstens EINEN Markdown-Link. Muster:
  "wie die [DOMAIN](URL) berichtet", "meldet die [DOMAIN](URL)", "laut [DOMAIN](URL)".
- Verwende nur die exakte Artikel-/PDF-URL aus "URL:". Wenn nur eine Startseite,
  Listenseite, ein Social-Feed oder manual:// verfügbar ist, setze article_url
  auf null und schreibe ohne Link.
- Wenn die Einheit URL:NO_LINK hat (Listenseite oder fehlende Artikel-URL):
  KEIN Link, stattdessen "laut Gemeindemitteilung", "aus der Facebook-Gruppe XY"
  (ohne URL in runden Klammern).
- NIEMALS zwei Links hintereinander. NIEMALS eine URL in runden Klammern nach
  einem Markdown-Link. Nur URLs verwenden, die im Input unter "URL:" stehen.

GEMEINDE-EXKLUSIVITÄT:
Dieser Entwurf ist ausschliesslich für die benannte Ziel-Gemeinde. Einheiten,
die primär eine andere Gemeinde betreffen, dürfen NICHT als eigenständiges
Bullet auftauchen. Beiläufige regionale/kantonale Erwähnungen sind nur zulässig,
wenn sie klaren Bezug zur Ziel-Gemeinde haben. Schreibe keinen generischen
"Blick über die Gemeindegrenze" ohne konkreten Nutzen für die Ziel-Gemeinde.

REDAKTIONSWERT:
- Keine alten abgeschlossenen Meldungen recyceln. Wenn eine Einheit mehrere Wochen
  alt ist, braucht sie eine neue Entwicklung im Input.
- Für Veranstaltungen gilt bei täglicher Frequenz: heute zuerst. Wenn der
  Auswahl-Schritt aber nur wenige starke lokale Einheiten liefert, sind konkrete
  Termine in den nächsten 7 Tagen ausdrücklich gültig — besonders, wenn sie von
  Gemeinde-, Veranstalter- oder Artikelquellen stammen. Gib deshalb nicht
  "bullets":[] zurück, nur weil ein Termin erst morgen oder später stattfindet.
- Gute Nachrichten aus Facebook/Community-Quellen sind als letzte Meldung ok,
  wenn sie lokal, konkret und nicht bloss Werbung sind.
- Geburtstage, Hochzeiten, Vereinsnotizen und dünne Community-Hinweise sind
  Füllmeldungen. Verwende sie nur, wenn keine stärkere lokale Sicherheits-,
  Behörden-, Infrastruktur- oder Schulmeldung vorhanden ist.

SENSIBLE THEMEN (Todesfall, Unfall, Straftat):
- Nur aufnehmen, wenn die Einheit SENSITIV:... markiert ist UND publication_date
  nicht älter als 3 Tage. Niemals als good_news. Kein Emoji als Vorwärmer.
  Quelle vollständig im Satz nennen.

WIEDERHOLUNG (WICHTIG):
Wenn keine Meldung die Regeln erfüllt, gib "bullets": [] zurück und erkläre in
"notes_for_editor" warum. Ein einzelnes starkes lokales Bullet ist erlaubt.
Schreibe NIEMALS Füllsätze.`;

/**
 * Assemble the full v2 compose prompt: layer 2 (compose rules) + anti-pattern
 * block + layer 3 (output schema reminder). The anti-pattern block is rendered
 * with explicit fenced boundary markers; capture-time sanitisation
 * (_shared/feedback-sanitise.ts) rejects bullets containing those markers so
 * an injected example can't break out of the block.
 *
 * When `currentDate` is supplied, a deterministic date-framing block is
 * prepended so the LLM frames event times from the reader's perspective on the
 * publication date (newsletter goes out the next morning).
 */
export function buildDraftComposePromptV2(opts: {
  composeLayer2?: string;
  antiPatterns?: ReadonlyArray<{ bullet: string; reason: string }>;
  positiveExamples?: ReadonlyArray<{ bullet: string; source_domain: string }>;
  currentDate?: string;
  publicationDate?: string;
}): string {
  const composeLayer2 = opts.composeLayer2 ?? DRAFT_COMPOSE_PROMPT_V2;
  const antiPatterns = opts.antiPatterns ?? [];
  const positives = opts.positiveExamples ?? [];

  const dateBlock = opts.currentDate
    ? buildPublicationDateBlock(opts.currentDate, opts.publicationDate)
    : '';

  const examples: string[] = [];
  if (positives.length > 0 || antiPatterns.length > 0) {
    examples.push('========== BEISPIELE-ANFANG ==========');
    if (positives.length > 0) {
      examples.push('\nGUTE BEISPIELE (Redaktion hat so publiziert):');
      for (const p of positives) examples.push(`- ${p.bullet}`);
    }
    if (antiPatterns.length > 0) {
      examples.push('\nSCHLECHTE BEISPIELE (so NICHT — Grund in der Zeile darunter):');
      for (const ap of antiPatterns) {
        examples.push(`- ❌ ${ap.bullet}`);
        examples.push(`     → ${ap.reason}`);
      }
    }
    examples.push('\n========== BEISPIELE-ENDE ==========');
  }

  return [dateBlock, composeLayer2, examples.join('\n')].filter(Boolean).join('\n\n');
}

/**
 * Build the deterministic publication-date framing block. Both prompts share
 * the same wording so the LLM uses the same anchor at selection and compose.
 */
export function buildPublicationDateBlock(
  currentDate: string,
  publicationDate?: string,
): string {
  const pub = publicationDate ?? addDaysIso(currentDate, 1);
  const pubP1 = addDaysIso(pub, 1);
  return `ZEITPUNKT (WICHTIG):
Heute ist: ${currentDate}
Dieser Entwurf erscheint am: ${pub} (Folgetag, morgen früh).
Formuliere Zeitangaben aus Lesersicht des Erscheinungsdatums:
- Veranstaltungen am ${pub} = "heute"
- Veranstaltungen am ${pubP1} = "morgen"
- Veranstaltungen am ${currentDate} = "gestern" (meist nicht mehr relevant)
- Verwende "heute Abend" nur, wenn der Termin wirklich am Erscheinungstag abends ist.
- Für vergangene Termine nicht so formulieren, als könnten Leser noch teilnehmen.`;
}
