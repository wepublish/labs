/**
 * @module civic-constants
 * Constants for civic scout (Track the Council) feature.
 * Ported from coJournalist civic_orchestrator.py.
 */

/** Max documents to parse per execution run */
export const MAX_DOCS_PER_RUN = 2;

/** Cap on stored processed URLs per scout */
export const PROCESSED_URLS_CAP = 100;

/** Delay between Firecrawl API calls (ms) to respect 6 req/min rate limit */
export const FIRECRAWL_STAGGER_MS = 10_000;

/**
 * Multilingual keywords for identifying meeting documents.
 * Used in Stage 1 (keyword match) of link classification.
 * Ported from civic_orchestrator.py:614-637.
 */
export const MEETING_KEYWORDS = [
  // German
  'protokoll', 'vollprotokoll', 'wortprotokoll', 'beschlussprotokoll',
  'tagesordnung', 'geschaeftsverzeichnis', 'sitzung', 'niederschrift',
  'verhandlung', 'ratssitzung', 'gemeinderat',
  // French
  'proces-verbal', 'procès-verbal', 'ordre-du-jour', 'délibération',
  'compte-rendu', 'compte rendu', 'séance', 'seance',
  // English
  'minutes', 'agenda', 'proceedings', 'transcript', 'meeting',
  // Italian
  'verbale', 'ordine-del-giorno', 'delibera', 'seduta',
  // Spanish
  'acta', 'orden del día', 'orden-del-dia', 'sesión', 'sesion',
  'pleno', 'deliberación',
  // Portuguese
  'ata', 'ordem do dia', 'deliberação', 'sessão',
  // Dutch
  'notulen', 'vergadering', 'raadsvergadering', 'besluitenlijst',
  // Polish
  'protokół', 'protokol', 'porządek obrad', 'sesja',
  // Generic / cross-language
  'protocol', 'session',
] as const;

/** File extensions to exclude from link extraction */
export const DENYLIST_EXTENSIONS = [
  '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.gif',
  '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map',
] as const;

/** URL prefixes to exclude from link extraction */
export const DENYLIST_PREFIXES = [
  'mailto:', 'javascript:', 'tel:', '#',
] as const;
