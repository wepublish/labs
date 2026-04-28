import { normalizeCity } from './village-id.ts';

export interface LocationBodyFact {
  statement: string;
  cityId: string;
  evidence: string;
}

const DIRECT_LOCAL_FACT_RE =
  /\b(Standort|Standorte|Niederlassung|Niederlassungen|Filiale|Filialen|Sitz|betreibt|beschäftigt|eroeffnet|eröffnet|schliesst|schließt|befindet|Gemeinde|Schule|Kindergarten|Polizei|Feuerwehr|Unfall|Kollision|Strasse|Straße|Weg|Platz|Infrastruktur)\b/i;

const BAD_CONTEXT_RE =
  /\b(Mehr zum Thema|Anzeige|Newsletter|Abo|Kommentar|Leserbrief|Bild:|Quelle:)\b/i;

/**
 * Deterministic fallback for followed article bodies. It prevents manual
 * location listing scouts from losing a concrete body-supported village fact
 * when the LLM focuses only on the article's main, out-of-village headline.
 */
export function extractBodySupportedLocationFacts(
  markdown: string,
  city: string,
  maxFacts = 2,
): LocationBodyFact[] {
  const trimmedCity = city.trim();
  const cityId = normalizeCity(trimmedCity);
  if (!markdown.trim() || !trimmedCity || !cityId) return [];

  const articleBody = markdown
    .split(/(?:^|\n)#{1,6}\s*Mehr zum Thema\b/i)[0]
    .split(/\nMehr zum Thema\b/i)[0];

  const cityRe = new RegExp(`\\b${escapeRegExp(trimmedCity)}\\b`, 'i');
  const facts: LocationBodyFact[] = [];
  const seen = new Set<string>();

  for (const sentence of candidateSentences(articleBody)) {
    const cleaned = cleanSentence(sentence);
    if (cleaned.length < 40 || cleaned.length > 320) continue;
    if (!cityRe.test(cleaned)) continue;
    if (BAD_CONTEXT_RE.test(cleaned)) continue;
    if (!DIRECT_LOCAL_FACT_RE.test(cleaned)) continue;

    const statement = cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
    const key = statement.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ statement, cityId, evidence: statement.slice(0, 160) });
    if (facts.length >= maxFacts) break;
  }

  return facts;
}

function candidateSentences(markdown: string): string[] {
  return markdown
    .replace(/\r/g, '\n')
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanSentence(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[_*`#>]+/g, '')
    .replace(/\\+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
