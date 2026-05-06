import { isArticleLevelUrl } from './source-url.ts';

export interface UnitForSelectionRanking {
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

export interface RankedSelectionUnit<T extends UnitForSelectionRanking = UnitForSelectionRanking> {
  unit: T;
  score: number;
  mandatory: boolean;
  reasons: string[];
}

export const SELECTION_RANKING_REASON_KEYS = [
  'fresh_sensitive',
  'stale_sensitive',
  'future_publication',
  'static_directory_fact',
  'supporting_fragment',
  'cross_village_drift',
  'sports_club_drift',
  'undated_non_event',
  'regional_soft_event',
  'public_safety',
  'civic_utility',
  'soft_filler',
  'today_event',
  'past_event',
  'far_future_event',
  'too_early_event',
  'fresh',
  'stale',
  'article_url',
  'weak_url',
  'low_village_confidence',
  'high_village_confidence',
  'below_quality_threshold',
] as const;

export type SelectionRankingReasonKey = typeof SELECTION_RANKING_REASON_KEYS[number];

export interface SelectionRankingConfig {
  weights: Record<SelectionRankingReasonKey, number>;
  mandatoryScore: number;
  composeStrictMinScore: number;
  composeThinMinScore: number;
  weakUrlStrictMinScore: number;
  weakUrlThinMinScore: number;
}

export const DEFAULT_SELECTION_RANKING_CONFIG: SelectionRankingConfig = {
  weights: {
    fresh_sensitive: 45,
    stale_sensitive: -80,
    future_publication: -80,
    static_directory_fact: -55,
    supporting_fragment: -70,
    cross_village_drift: -60,
    sports_club_drift: -90,
    undated_non_event: -70,
    regional_soft_event: -45,
    public_safety: 35,
    civic_utility: 25,
    soft_filler: -25,
    today_event: 30,
    past_event: -40,
    far_future_event: -30,
    too_early_event: -55,
    fresh: 20,
    stale: -35,
    article_url: 15,
    weak_url: -25,
    low_village_confidence: -60,
    high_village_confidence: 10,
    below_quality_threshold: -40,
  },
  mandatoryScore: 95,
  composeStrictMinScore: 70,
  composeThinMinScore: 25,
  weakUrlStrictMinScore: 115,
  weakUrlThinMinScore: 80,
};

export function normalizeSelectionRankingConfig(value: unknown): SelectionRankingConfig {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_SELECTION_RANKING_CONFIG);
  const input = value as Partial<SelectionRankingConfig> & { weights?: Record<string, unknown> };
  const weights = { ...DEFAULT_SELECTION_RANKING_CONFIG.weights };
  for (const key of SELECTION_RANKING_REASON_KEYS) {
    const raw = input.weights?.[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) weights[key] = Math.round(raw);
  }

  return {
    weights,
    mandatoryScore: readNumber(input.mandatoryScore, DEFAULT_SELECTION_RANKING_CONFIG.mandatoryScore),
    composeStrictMinScore: readNumber(input.composeStrictMinScore, DEFAULT_SELECTION_RANKING_CONFIG.composeStrictMinScore),
    composeThinMinScore: readNumber(input.composeThinMinScore, DEFAULT_SELECTION_RANKING_CONFIG.composeThinMinScore),
    weakUrlStrictMinScore: readNumber(input.weakUrlStrictMinScore, DEFAULT_SELECTION_RANKING_CONFIG.weakUrlStrictMinScore),
    weakUrlThinMinScore: readNumber(input.weakUrlThinMinScore, DEFAULT_SELECTION_RANKING_CONFIG.weakUrlThinMinScore),
  };
}

export function validateSelectionRankingConfig(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'config muss ein Objekt sein';
  const input = value as Partial<SelectionRankingConfig> & { weights?: Record<string, unknown> };
  if (!input.weights || typeof input.weights !== 'object') return 'weights muss ein Objekt sein';

  for (const key of SELECTION_RANKING_REASON_KEYS) {
    const raw = input.weights[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
      return `${key} muss eine ganze Zahl sein`;
    }
    if (raw < -200 || raw > 200) return `${key} muss zwischen -200 und 200 liegen`;
  }

  const thresholdKeys = [
    'mandatoryScore',
    'composeStrictMinScore',
    'composeThinMinScore',
    'weakUrlStrictMinScore',
    'weakUrlThinMinScore',
  ] as const;
  for (const key of thresholdKeys) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
      return `${key} muss eine ganze Zahl sein`;
    }
    if (raw < 0 || raw > 250) return `${key} muss zwischen 0 und 250 liegen`;
  }
  return null;
}

export interface SelectionDedupResult<T extends UnitForSelectionRanking = UnitForSelectionRanking> {
  units: T[];
  rejected: Array<{
    id: string;
    matched_id: string;
    reason: 'near_duplicate';
    statement: string;
    matched_statement: string;
  }>;
}

const PUBLIC_SAFETY = [
  'unfall', 'kollision', 'verkehrsunfall', 'brand', 'polizei', 'feuerwehr',
  'verletz', 'spital', 'strasse gesperrt', 'sperrung', 'einsatz',
];

const CIVIC = [
  'gemeinderat', 'einwohnerrat', 'landrat', 'abstimmung', 'initiative',
  'budget', 'kredit', 'million', 'zone', 'bauarbeiten', 'sanierung',
  'verkehr', 'schule', 'kindergarten', 'wasser', 'versorgung', 'entsorgung',
  'tempo', 'baustelle', 'verwaltung', 'kehricht', 'planung', 'planungsvereinbarung',
  'kantonsstrasse', 'talboden', 'dreispitz', 'schwimmbad', 'becken',
  'gemeindepräsident', 'wahl', 'sozialhilfebehörde', 'finanzplankommission',
  'nationalrat', 'vereidigt', 'behörde', 'kommission', 'baugesuch',
];

const SOFT_FILLER = [
  'geburtstag', 'hochzeit', 'gratuliert', 'verein', 'club', 'jubiläum',
  'kaffee', 'tombola', 'jassturnier', 'chorkonzert', 'laufgruppe',
  'schnupperlektion', 'probelektion', 'rhythmik', 'ausstellung', 'konzert',
  'markt', 'führung', 'führungen', 'arealführung', 'arealführungen',
];

const STATIC_DIRECTORY = [
  'telefonnummer', 'telefonisch', 'e-mail-adresse', 'email-adresse',
  'öffnungszeiten', 'schalter', 'adresse', 'befindet sich an',
  'termine ausserhalb', 'montag bis freitag',
];

export function dedupeSelectionCandidates<T extends UnitForSelectionRanking>(
  units: T[],
  opts: { currentDate: string; publicationDate: string },
  config: SelectionRankingConfig = DEFAULT_SELECTION_RANKING_CONFIG,
): SelectionDedupResult<T> {
  const ranked = rankSelectionCandidates(units, opts, config);
  const byId = new Map(ranked.map((row) => [row.unit.id, row]));
  const kept: T[] = [];
  const seen = new Map<string, T>();
  const rejected: SelectionDedupResult<T>['rejected'] = [];

  for (const row of ranked) {
    const fingerprint = statementFingerprint(row.unit.statement);
    const existing = [...seen.entries()].find(([, seenUnit]) =>
      areNearDuplicate(seenUnit, row.unit)
    );
    if (!existing) {
      seen.set(fingerprint, row.unit);
      kept.push(row.unit);
      continue;
    }

    const [, keptUnit] = existing;
    rejected.push({
      id: row.unit.id,
      matched_id: keptUnit.id,
      reason: 'near_duplicate',
      statement: row.unit.statement.slice(0, 180),
      matched_statement: keptUnit.statement.slice(0, 180),
    });

    const keptScore = byId.get(keptUnit.id)?.score ?? 0;
    if (row.score > keptScore + 15) {
      const idx = kept.findIndex((u) => u.id === keptUnit.id);
      if (idx >= 0) kept[idx] = row.unit;
      seen.delete(existing[0]);
      seen.set(fingerprint, row.unit);
      rejected[rejected.length - 1] = {
        id: keptUnit.id,
        matched_id: row.unit.id,
        reason: 'near_duplicate',
        statement: keptUnit.statement.slice(0, 180),
        matched_statement: row.unit.statement.slice(0, 180),
      };
    }
  }

  return { units: kept, rejected };
}

export function rankSelectionCandidates<T extends UnitForSelectionRanking>(
  units: T[],
  opts: {
    currentDate: string;
    publicationDate: string;
    maxCandidates?: number;
    villageId?: string;
  },
  config: SelectionRankingConfig = DEFAULT_SELECTION_RANKING_CONFIG,
): RankedSelectionUnit<T>[] {
  const normalized = normalizeSelectionRankingConfig(config);
  const ranked = units.map((unit) => rankOne(unit, opts.currentDate, opts.publicationDate, opts.villageId, normalized));
  ranked.sort((a, b) => b.score - a.score || compareDateDesc(a.unit, b.unit));
  return typeof opts.maxCandidates === 'number'
    ? ranked.slice(0, opts.maxCandidates)
    : ranked;
}

export function selectDeterministicFallback<T extends UnitForSelectionRanking>(
  ranked: RankedSelectionUnit<T>[],
  maxUnits: number,
): string[] {
  const selected: string[] = [];
  for (const row of ranked.filter((r) => r.mandatory)) {
    if (!selected.includes(row.unit.id)) selected.push(row.unit.id);
  }
  for (const row of ranked) {
    if (selected.length >= maxUnits) break;
    if (!selected.includes(row.unit.id)) selected.push(row.unit.id);
  }
  return selected.slice(0, maxUnits);
}

export function enforceMandatorySelection<T extends UnitForSelectionRanking>(
  selectedIds: string[],
  ranked: RankedSelectionUnit<T>[],
  maxUnits: number,
): string[] {
  const mandatory = ranked.filter((r) => r.mandatory).map((r) => r.unit.id);
  const out: string[] = [];
  for (const id of mandatory) if (!out.includes(id)) out.push(id);
  for (const id of selectedIds) if (!out.includes(id)) out.push(id);
  if (out.length <= maxUnits) return out;

  const mandatorySet = new Set(mandatory);
  const keep = out.filter((id) => mandatorySet.has(id));
  for (const row of ranked) {
    if (keep.length >= maxUnits) break;
    if (out.includes(row.unit.id) && !keep.includes(row.unit.id)) keep.push(row.unit.id);
  }
  return keep.slice(0, maxUnits);
}

export function refineSelectionForCompose<T extends UnitForSelectionRanking>(
  selectedIds: string[],
  ranked: RankedSelectionUnit<T>[],
  maxUnits: number,
  config: SelectionRankingConfig = DEFAULT_SELECTION_RANKING_CONFIG,
): string[] {
  const normalized = normalizeSelectionRankingConfig(config);
  const selected = new Set(selectedIds);
  const composeCap = Math.min(maxUnits, 5);
  const minComposeUnits = Math.min(3, composeCap);
  const preferred: string[] = [];
  const preferredUnits: T[] = [];

  const addPreferred = (row: RankedSelectionUnit<T>): boolean => {
    if (preferred.includes(row.unit.id)) return false;
    if (preferredUnits.some((unit) => sameComposeStory(unit.statement, row.unit.statement))) {
      return false;
    }
    preferred.push(row.unit.id);
    preferredUnits.push(row.unit);
    return true;
  };

  for (const row of ranked) {
    if (!selected.has(row.unit.id)) continue;
    if (!isComposeEligible(row, 'strict', normalized)) continue;
    addPreferred(row);
    if (preferred.length >= composeCap) return preferred.slice(0, composeCap);
  }

  if (preferred.length >= minComposeUnits) return preferred;

  // Thin local-news days need a backfill path. Keep strong selected units first,
  // then add softer but still useful local items until the composer has enough
  // story candidates to produce a digest instead of a one-item stub.
  for (const row of ranked) {
    if (!isComposeEligible(row, 'strict', normalized)) continue;
    addPreferred(row);
    if (preferred.length >= minComposeUnits) break;
  }

  if (preferred.length < minComposeUnits) {
    for (const row of ranked) {
      if (!isComposeEligible(row, 'thin', normalized)) continue;
      addPreferred(row);
      if (preferred.length >= minComposeUnits) break;
    }
  }

  return preferred.slice(0, composeCap);
}

export function buildSelectionDiagnostics<T extends UnitForSelectionRanking>(
  ranked: RankedSelectionUnit<T>[],
  selectedIds: string[],
  config: SelectionRankingConfig = DEFAULT_SELECTION_RANKING_CONFIG,
): {
  candidate_snapshot: Array<Record<string, unknown>>;
  selected_unit_ids: string[];
  selected_units: Array<Record<string, unknown>>;
  mandatory_kept_ids: string[];
  rejected_top_units: Array<Record<string, unknown>>;
  ranking_config: SelectionRankingConfig;
} {
  const selected = new Set(selectedIds);
  const normalized = normalizeSelectionRankingConfig(config);
  const snapshot = (r: RankedSelectionUnit<T>) => ({
    id: r.unit.id,
    score: r.score,
    mandatory: r.mandatory,
    quality_score: r.unit.quality_score ?? null,
    sensitivity: r.unit.sensitivity ?? null,
    publication_date: r.unit.publication_date ?? null,
    event_date: r.unit.event_date ?? null,
    article_url: r.unit.article_url ?? null,
    source_domain: r.unit.source_domain ?? null,
    reasons: r.reasons,
    statement: r.unit.statement.slice(0, 180),
  });
  return {
    candidate_snapshot: ranked.slice(0, 30).map(snapshot),
    selected_unit_ids: selectedIds,
    selected_units: ranked.filter((r) => selected.has(r.unit.id)).map(snapshot),
    mandatory_kept_ids: ranked.filter((r) => r.mandatory).map((r) => r.unit.id),
    rejected_top_units: ranked
      .filter((r) => !selected.has(r.unit.id))
      .slice(0, 10)
      .map((r) => ({ ...snapshot(r), rejection_reason: 'not_selected' })),
    ranking_config: normalized,
  };
}

function rankOne<T extends UnitForSelectionRanking>(
  unit: T,
  currentDate: string,
  publicationDate: string,
  villageId?: string,
  config: SelectionRankingConfig = DEFAULT_SELECTION_RANKING_CONFIG,
): RankedSelectionUnit<T> {
  const reasons: string[] = [];
  let score = unit.quality_score ?? 40;
  const text = unit.statement.toLowerCase();
  const publicationAge = unit.publication_date
    ? daysBetween(unit.publication_date, publicationDate)
    : daysBetween(unit.created_at?.slice(0, 10) ?? currentDate, publicationDate);

  if (unit.sensitivity && unit.sensitivity !== 'none') {
    if (publicationAge >= 0 && publicationAge <= 3) {
      score += config.weights.fresh_sensitive;
      reasons.push('fresh_sensitive');
    } else {
      score += config.weights.stale_sensitive;
      reasons.push('stale_sensitive');
    }
  }

  const staticDirectoryFact = isStaticDirectoryFact(text);
  if (publicationAge < 0) {
    score += config.weights.future_publication;
    reasons.push('future_publication');
  }
  if (staticDirectoryFact) {
    score += config.weights.static_directory_fact;
    reasons.push('static_directory_fact');
  }
  if (isSupportingFragment(text)) {
    score += config.weights.supporting_fragment;
    reasons.push('supporting_fragment');
  }
  if (villageId && hasCrossVillageDrift(text, villageId)) {
    score += config.weights.cross_village_drift;
    reasons.push('cross_village_drift');
  }
  if (villageId && hasSportsClubDrift(text, villageId)) {
    score += config.weights.sports_club_drift;
    reasons.push('sports_club_drift');
  }

  if (containsAny(text, PUBLIC_SAFETY) && !staticDirectoryFact) {
    score += config.weights.public_safety;
    reasons.push('public_safety');
  }
  if (containsAny(text, CIVIC)) {
    score += config.weights.civic_utility;
    reasons.push('civic_utility');
  }
  if (containsAny(text, SOFT_FILLER)) {
    score += config.weights.soft_filler;
    reasons.push('soft_filler');
  }
  if (isUndatedNonEvent(unit)) {
    score += config.weights.undated_non_event;
    reasons.push('undated_non_event');
  }
  if (isRegionalSoftEvent(unit, text, villageId)) {
    score += config.weights.regional_soft_event;
    reasons.push('regional_soft_event');
  }

  if (unit.event_date) {
    if (unit.event_date === publicationDate) {
      score += config.weights.today_event;
      reasons.push('today_event');
    } else if (unit.event_date < publicationDate) {
      score += config.weights.past_event;
      reasons.push('past_event');
    } else if (daysBetween(publicationDate, unit.event_date) > 7) {
      score += config.weights.far_future_event;
      reasons.push('far_future_event');
    } else if (daysBetween(publicationDate, unit.event_date) > 3) {
      score += config.weights.too_early_event;
      reasons.push('too_early_event');
    }
  }

  if (publicationAge >= 0 && publicationAge <= 2) {
    score += config.weights.fresh;
    reasons.push('fresh');
  } else if (publicationAge > 7) {
    score += config.weights.stale;
    reasons.push('stale');
  }

  if (unit.article_url && !unit.is_listing_page && isArticleLevelUrl(unit.article_url)) {
    score += config.weights.article_url;
    reasons.push('article_url');
  } else if (unit.is_listing_page || !isArticleLevelUrl(unit.article_url)) {
    score += config.weights.weak_url;
    reasons.push('weak_url');
  }

  if (unit.village_confidence === 'low') {
    score += config.weights.low_village_confidence;
    reasons.push('low_village_confidence');
  } else if (unit.village_confidence === 'high') {
    score += config.weights.high_village_confidence;
    reasons.push('high_village_confidence');
  }

  if ((unit.quality_score ?? 0) < 40) {
    score += config.weights.below_quality_threshold;
    reasons.push('below_quality_threshold');
  }

  const mandatory =
    score >= config.mandatoryScore &&
    !reasons.includes('stale_sensitive') &&
    !reasons.includes('low_village_confidence') &&
    !reasons.includes('weak_url') &&
    !reasons.includes('static_directory_fact') &&
    !reasons.includes('supporting_fragment') &&
    !reasons.includes('cross_village_drift') &&
    !reasons.includes('sports_club_drift') &&
    !reasons.includes('undated_non_event') &&
    !reasons.includes('regional_soft_event') &&
    !reasons.includes('too_early_event') &&
    !reasons.includes('far_future_event') &&
    !reasons.includes('future_publication') &&
    (reasons.includes('public_safety') || reasons.includes('civic_utility'));

  return { unit, score, mandatory, reasons };
}

type ComposeEligibilityMode = 'strict' | 'thin';

function isComposeEligible<T extends UnitForSelectionRanking>(
  row: RankedSelectionUnit<T>,
  mode: ComposeEligibilityMode,
  config: SelectionRankingConfig,
): boolean {
  if (row.score < (mode === 'thin' ? config.composeThinMinScore : config.composeStrictMinScore)) return false;
  if (row.reasons.includes('static_directory_fact')) return false;
  if (row.reasons.includes('supporting_fragment')) return false;
  if (row.reasons.includes('cross_village_drift')) return false;
  if (row.reasons.includes('sports_club_drift')) return false;
  if (row.reasons.includes('undated_non_event')) return false;
  if (row.reasons.includes('regional_soft_event')) return false;
  if (row.reasons.includes('too_early_event') && !isThinUsefulEvent(row)) return false;
  if (row.reasons.includes('far_future_event')) return false;
  if (row.reasons.includes('future_publication')) return false;
  if (row.reasons.includes('low_village_confidence')) return false;
  if (
    row.reasons.includes('soft_filler') &&
    !row.reasons.includes('public_safety') &&
    !row.reasons.includes('civic_utility')
  ) {
    return false;
  }
  if (row.reasons.includes('weak_url') && row.score < (mode === 'thin' ? config.weakUrlThinMinScore : config.weakUrlStrictMinScore)) return false;
  return true;
}

function isThinUsefulEvent<T extends UnitForSelectionRanking>(row: RankedSelectionUnit<T>): boolean {
  return isArticleBacked(row.unit) && !row.reasons.includes('soft_filler');
}

function isArticleBacked(unit: UnitForSelectionRanking): boolean {
  return Boolean(unit.article_url && !unit.is_listing_page && isArticleLevelUrl(unit.article_url));
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isStaticDirectoryFact(text: string): boolean {
  if (containsAny(text, STATIC_DIRECTORY)) return true;
  if (/\b\d{3}\s?\d{3}\s?\d{2}\s?\d{2}\b/.test(text)) return true;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return true;
  if (/\b\w+(strasse|str\.|gasse|weg)\s+\d+\b/i.test(text)) return true;
  return false;
}

function isSupportingFragment(text: string): boolean {
  return /\b(haltestelle|anreise|tatbestandsaufnahme|verkehrsbehinderungen|mitfahrenden personen|details.*nicht bekannt|befindet sich|ist erreichbar)\b/i
    .test(text);
}

function hasCrossVillageDrift(text: string, villageId: string): boolean {
  const aliases: Record<string, string[]> = {
    arlesheim: ['arlesheim'],
    muenchenstein: ['münchenstein', 'muenchenstein'],
    basel: ['basel'],
    birsfelden: ['birsfelden'],
    reinach: ['reinach'],
    aesch: ['aesch'],
    allschwil: ['allschwil'],
    binningen: ['binningen'],
    bottmingen: ['bottmingen'],
    muttenz: ['muttenz'],
    pratteln: ['pratteln'],
    riehen: ['riehen'],
  };
  const current = aliases[villageId] ?? [villageId];
  const mentionsCurrent = current.some((name) => text.includes(name));
  const otherVillageMentioned = Object.entries(aliases)
    .filter(([id]) => id !== villageId)
    .some(([, names]) => names.some((name) => text.includes(name)));
  return otherVillageMentioned && !mentionsCurrent;
}

function hasSportsClubDrift(text: string, villageId: string): boolean {
  if (!/\b(fc|sc|sv|tv|bc)\s+[a-zäöü]+/i.test(text)) return false;
  const aliases: Record<string, string[]> = {
    arlesheim: ['arlesheim'],
    muenchenstein: ['münchenstein', 'muenchenstein'],
    reinach: ['reinach'],
    aesch: ['aesch'],
    allschwil: ['allschwil'],
    binningen: ['binningen'],
    bottmingen: ['bottmingen'],
    muttenz: ['muttenz'],
    pratteln: ['pratteln'],
    riehen: ['riehen'],
  };
  const current = aliases[villageId] ?? [villageId];
  const mentionsCurrent = current.some((name) => text.includes(name));
  return !mentionsCurrent;
}

function isUndatedNonEvent(unit: UnitForSelectionRanking): boolean {
  return unit.unit_type !== 'event' && !unit.publication_date;
}

function isRegionalSoftEvent(
  unit: UnitForSelectionRanking,
  text: string,
  villageId?: string,
): boolean {
  if (unit.unit_type !== 'event') return false;
  if (unit.publication_date) return false;
  if (!containsAny(text, SOFT_FILLER)) return false;
  const domain = (unit.source_domain ?? '').toLowerCase();
  if (!domain) return false;
  if (villageId && domain.includes(villageId.replace('muenchenstein', 'muenchenstein'))) {
    return false;
  }
  return true;
}

function compareDateDesc(a: UnitForSelectionRanking, b: UnitForSelectionRanking): number {
  const ad = a.event_date ?? a.publication_date ?? a.created_at ?? '';
  const bd = b.event_date ?? b.publication_date ?? b.created_at ?? '';
  return bd.localeCompare(ad);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.floor((to - from) / 86_400_000);
}

function statementFingerprint(statement: string): string {
  return fingerprintTokens(statement)
    .slice(0, 10)
    .sort()
    .join('|');
}

function fingerprintTokens(statement: string): string[] {
  return statement
    .toLocaleLowerCase('de-CH')
    .replace(/\b\d{1,2}\.?\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .split(/[^a-z0-9äöüß]+/i)
    .filter((token) => token.length >= 4)
    .map(stemToken);
}

function areNearDuplicate(a: UnitForSelectionRanking, b: UnitForSelectionRanking): boolean {
  const aFingerprint = statementFingerprint(a.statement);
  const bFingerprint = statementFingerprint(b.statement);
  if (!fingerprintsOverlap(aFingerprint, bFingerprint)) return false;

  // Same-place event listings often share only generic venue words. Treat them
  // as duplicates only when date/source or enough topic tokens also agree.
  if (a.unit_type === 'event' && b.unit_type === 'event') {
    if (a.event_date && b.event_date && a.event_date === b.event_date) return true;
    if (a.article_url && b.article_url && a.article_url === b.article_url && topicOverlap(a.statement, b.statement) >= 1) {
      return true;
    }
    return topicOverlap(a.statement, b.statement) >= 2;
  }

  return true;
}

function topicOverlap(a: string, b: string): number {
  const generic = new Set([
    'findet', 'statt', 'arlesheim', 'münchenstein', 'muenchenstein', 'klinik',
    'restaurant', 'gemeinde', 'samstag', 'sonntag', 'montag', 'dienstag',
    'mittwoch', 'donnerstag', 'freitag',
  ]);
  const left = new Set(fingerprintTokens(a).filter((token) => !generic.has(token)));
  return fingerprintTokens(b).filter((token) => !generic.has(token) && left.has(token)).length;
}

function sameComposeStory(a: string, b: string): boolean {
  return topicOverlap(a, b) >= 2;
}

function fingerprintsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const left = new Set(a.split('|'));
  const right = b.split('|');
  const overlap = right.filter((token) => left.has(token)).length;
  return overlap >= 4 && overlap / Math.min(left.size, right.length) >= 0.55;
}

function stemToken(token: string): string {
  return token
    .replace(/innen$/, '')
    .replace(/ungen$/, 'ung')
    .replace(/führungen$/, 'führung')
    .replace(/tionen$/, 'tion')
    .replace(/ern$/, '')
    .replace(/en$/, '')
    .replace(/er$/, '')
    .replace(/e$/, '');
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}
