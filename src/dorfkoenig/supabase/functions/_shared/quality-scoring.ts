/**
 * @module quality-scoring
 *
 * Deterministic 0–100 quality score for information_units (DRAFT_QUALITY.md §3.2.2).
 * Computed at ingest time from the unit's metadata alone — no LLM, no I/O.
 *
 * Philosophy: push judgment upstream so the compose LLM gets cleaner input. Every
 * signal has a named weight in QUALITY_WEIGHTS; score is sum of matched weights,
 * clamped to [0, 100]. Reasons are NOT stored; call explainQualityScore(unit) to
 * re-derive them from the same raw fields when debugging.
 */

export type Sensitivity = 'none' | 'death' | 'accident' | 'crime' | 'minor_safety';

export interface ScoreableUnit {
  statement: string;
  source_url: string | null;
  source_domain: string | null;
  article_url?: string | null;
  is_listing_page?: boolean | null;
  event_date?: string | null;
  publication_date?: string | null;
  created_at?: string | null;
  village_confidence?: 'high' | 'medium' | 'low' | null;
  sensitivity?: Sensitivity | null;
}

export interface QualityReason {
  key: keyof typeof QUALITY_WEIGHTS;
  weight: number;
  detail: string;
}

export const QUALITY_WEIGHTS = {
  article_level_url: 25,
  precise_event_date: 15,
  recent_publication: 20,
  high_village_confidence: 15,
  non_sensitive: 10,
  non_social_media: 10,
  substantive_statement: 5,
} as const;

const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'threads.net',
];

// Bare names match source_domain display strings like "Facebook-Gruppe Arlesheim"
// that don't carry a TLD. Matched case-insensitively as substrings.
const SOCIAL_MEDIA_NAMES = ['facebook', 'instagram', 'twitter', 'tiktok', 'threads'];

const LISTING_PATH_SEGMENTS = ['veranstaltungen', 'aktuelles', 'news', 'events'];

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

/** Compute quality_score as a pure number. */
export function computeQualityScore(
  unit: ScoreableUnit,
  today: string = TODAY_ISO(),
): number {
  return Math.min(
    100,
    explainQualityScore(unit, today).reduce((sum, r) => sum + r.weight, 0),
  );
}

/** Re-derive the reasons behind a score. Used for debug emails (§3.1.4 case b). */
export function explainQualityScore(
  unit: ScoreableUnit,
  today: string = TODAY_ISO(),
): QualityReason[] {
  const reasons: QualityReason[] = [];

  if (isArticleLevelUrl(unit.article_url || unit.source_url)) {
    reasons.push({
      key: 'article_level_url',
      weight: QUALITY_WEIGHTS.article_level_url,
      detail: 'Source URL points at a specific article, not a listing page',
    });
  }

  if (unit.event_date && hasEventDateExactlyInStatement(unit)) {
    reasons.push({
      key: 'precise_event_date',
      weight: QUALITY_WEIGHTS.precise_event_date,
      detail: 'event_date is anchored in the statement (not a publication-date fallback)',
    });
  }

  if (unit.publication_date && daysBetween(unit.publication_date, today) <= 3) {
    reasons.push({
      key: 'recent_publication',
      weight: QUALITY_WEIGHTS.recent_publication,
      detail: `Article published within last 3 days (${unit.publication_date})`,
    });
  }

  if (unit.village_confidence === 'high') {
    reasons.push({
      key: 'high_village_confidence',
      weight: QUALITY_WEIGHTS.high_village_confidence,
      detail: 'Extractor marked village assignment as high-confidence',
    });
  }

  if (!unit.sensitivity || unit.sensitivity === 'none') {
    reasons.push({
      key: 'non_sensitive',
      weight: QUALITY_WEIGHTS.non_sensitive,
      detail: 'No sensitivity flag (death/accident/crime/minor_safety)',
    });
  }

  if (!isSocialMediaDomain(unit.source_domain, unit.source_url)) {
    reasons.push({
      key: 'non_social_media',
      weight: QUALITY_WEIGHTS.non_social_media,
      detail: 'Not a social-media source',
    });
  }

  if ((unit.statement ?? '').trim().length >= 40) {
    reasons.push({
      key: 'substantive_statement',
      weight: QUALITY_WEIGHTS.substantive_statement,
      detail: 'Statement length >= 40 characters',
    });
  }

  return reasons;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function isArticleLevelUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return false;
    const last = segments[segments.length - 1];

    // Listing-page disqualification
    if (segments.length <= 2 && LISTING_PATH_SEGMENTS.includes(last.toLowerCase())) {
      return false;
    }

    if (segments.length >= 3) return true;
    if (/^ld\.\d+$/.test(last)) return true;
    if (/\.(php|pdf|html?|aspx)$/i.test(last)) return true;
    if (/^\d{3,}$/.test(last)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isSocialMediaDomain(
  domain: string | null | undefined,
  fallbackUrl: string | null | undefined,
): boolean {
  const d = (domain ?? '').toLowerCase();
  if (d.length > 0) {
    if (SOCIAL_MEDIA_DOMAINS.some((s) => d.includes(s))) return true;
    if (SOCIAL_MEDIA_NAMES.some((s) => d.includes(s))) return true;
  }
  if (!fallbackUrl) return false;
  try {
    const host = new URL(fallbackUrl).hostname.toLowerCase().replace(/^www\./, '');
    return SOCIAL_MEDIA_DOMAINS.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

/**
 * Heuristic: event_date is "precise" when its ISO form or a day+month pattern
 * appears in the unit's statement. Avoids counting publication-date fallbacks as
 * high-quality dates.
 */
function hasEventDateExactlyInStatement(unit: ScoreableUnit): boolean {
  if (!unit.event_date || !unit.statement) return false;
  const statement = unit.statement;
  if (statement.includes(unit.event_date)) return true;
  const m = unit.event_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [, year, mm, dd] = m;
  const dayNoPad = parseInt(dd, 10).toString();
  const monthIdx = parseInt(mm, 10);
  const months = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];
  const monthName = months[monthIdx - 1];
  if (statement.includes(`${dayNoPad}. ${monthName}`) ||
      statement.includes(`${dd}. ${monthName}`)) return true;
  if (statement.match(new RegExp(`\\b${dayNoPad}\\.0?${monthIdx}\\.${year}\\b`))) return true;
  if (statement.match(new RegExp(`\\b${dd}\\.0?${monthIdx}\\.${year}\\b`))) return true;
  return false;
}

function daysBetween(isoDate: string, todayIso: string): number {
  const a = Date.parse(isoDate);
  const b = Date.parse(todayIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.floor((b - a) / 86_400_000));
}
