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
  'schnupperlektion', 'ausstellung', 'konzert', 'markt',
];

const STATIC_DIRECTORY = [
  'telefonnummer', 'telefonisch', 'e-mail-adresse', 'email-adresse',
  'öffnungszeiten', 'schalter', 'adresse', 'befindet sich an',
  'termine ausserhalb', 'montag bis freitag',
];

export function dedupeSelectionCandidates<T extends UnitForSelectionRanking>(
  units: T[],
  opts: { currentDate: string; publicationDate: string },
): SelectionDedupResult<T> {
  const ranked = rankSelectionCandidates(units, opts);
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
): RankedSelectionUnit<T>[] {
  const ranked = units.map((unit) => rankOne(unit, opts.currentDate, opts.publicationDate, opts.villageId));
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
): string[] {
  const selected = new Set(selectedIds);
  const composeCap = Math.min(maxUnits, 5);
  const preferred: string[] = [];

  for (const row of ranked) {
    if (!selected.has(row.unit.id)) continue;
    if (!isComposeEligible(row)) continue;
    preferred.push(row.unit.id);
    if (preferred.length >= composeCap) return preferred;
  }

  if (preferred.length > 0) return preferred;

  // If the LLM selected only weak context fragments, recover with the best
  // eligible ranked units. This keeps drafts narrow without returning empty.
  for (const row of ranked) {
    if (!isComposeEligible(row)) continue;
    if (!preferred.includes(row.unit.id)) preferred.push(row.unit.id);
    if (preferred.length >= composeCap) break;
  }

  return preferred.length > 0 ? preferred : selectedIds.slice(0, Math.max(1, composeCap));
}

export function buildSelectionDiagnostics<T extends UnitForSelectionRanking>(
  ranked: RankedSelectionUnit<T>[],
  selectedIds: string[],
): {
  candidate_snapshot: Array<Record<string, unknown>>;
  mandatory_kept_ids: string[];
  rejected_top_units: Array<Record<string, unknown>>;
} {
  const selected = new Set(selectedIds);
  return {
    candidate_snapshot: ranked.slice(0, 30).map((r) => ({
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
    })),
    mandatory_kept_ids: ranked.filter((r) => r.mandatory).map((r) => r.unit.id),
    rejected_top_units: ranked
      .filter((r) => !selected.has(r.unit.id))
      .slice(0, 10)
      .map((r) => ({
        id: r.unit.id,
        score: r.score,
        reasons: r.reasons,
        statement: r.unit.statement.slice(0, 180),
      })),
  };
}

function rankOne<T extends UnitForSelectionRanking>(
  unit: T,
  currentDate: string,
  publicationDate: string,
  villageId?: string,
): RankedSelectionUnit<T> {
  const reasons: string[] = [];
  let score = unit.quality_score ?? 40;
  const text = unit.statement.toLowerCase();
  const publicationAge = unit.publication_date
    ? daysBetween(unit.publication_date, publicationDate)
    : daysBetween(unit.created_at?.slice(0, 10) ?? currentDate, publicationDate);

  if (unit.sensitivity && unit.sensitivity !== 'none') {
    if (publicationAge >= 0 && publicationAge <= 3) {
      score += 45;
      reasons.push('fresh_sensitive');
    } else {
      score -= 80;
      reasons.push('stale_sensitive');
    }
  }

  const staticDirectoryFact = isStaticDirectoryFact(text);
  if (publicationAge < 0) {
    score -= 80;
    reasons.push('future_publication');
  }
  if (staticDirectoryFact) {
    score -= 55;
    reasons.push('static_directory_fact');
  }
  if (isSupportingFragment(text)) {
    score -= 70;
    reasons.push('supporting_fragment');
  }
  if (villageId && hasCrossVillageDrift(text, villageId)) {
    score -= 60;
    reasons.push('cross_village_drift');
  }

  if (containsAny(text, PUBLIC_SAFETY) && !staticDirectoryFact) {
    score += 35;
    reasons.push('public_safety');
  }
  if (containsAny(text, CIVIC)) {
    score += 25;
    reasons.push('civic_utility');
  }
  if (containsAny(text, SOFT_FILLER)) {
    score -= 25;
    reasons.push('soft_filler');
  }

  if (unit.event_date) {
    if (unit.event_date === publicationDate) {
      score += 30;
      reasons.push('today_event');
    } else if (unit.event_date < currentDate) {
      score -= 40;
      reasons.push('past_event');
    } else if (daysBetween(publicationDate, unit.event_date) > 7) {
      score -= 30;
      reasons.push('far_future_event');
    } else if (daysBetween(publicationDate, unit.event_date) > 3) {
      score -= 55;
      reasons.push('too_early_event');
    }
  }

  if (publicationAge >= 0 && publicationAge <= 2) {
    score += 20;
    reasons.push('fresh');
  } else if (publicationAge > 7) {
    score -= 35;
    reasons.push('stale');
  }

  if (unit.article_url && !unit.is_listing_page && isArticleLevelUrl(unit.article_url)) {
    score += 15;
    reasons.push('article_url');
  } else if (unit.is_listing_page || !isArticleLevelUrl(unit.article_url)) {
    score -= 25;
    reasons.push('weak_url');
  }

  if (unit.village_confidence === 'low') {
    score -= 60;
    reasons.push('low_village_confidence');
  } else if (unit.village_confidence === 'high') {
    score += 10;
  }

  if ((unit.quality_score ?? 0) < 40) {
    score -= 40;
    reasons.push('below_quality_threshold');
  }

  const mandatory =
    score >= 95 &&
    !reasons.includes('stale_sensitive') &&
    !reasons.includes('low_village_confidence') &&
    !reasons.includes('weak_url') &&
    !reasons.includes('static_directory_fact') &&
    !reasons.includes('supporting_fragment') &&
    !reasons.includes('cross_village_drift') &&
    !reasons.includes('too_early_event') &&
    !reasons.includes('far_future_event') &&
    !reasons.includes('future_publication') &&
    (reasons.includes('public_safety') || reasons.includes('civic_utility'));

  return { unit, score, mandatory, reasons };
}

function isComposeEligible<T extends UnitForSelectionRanking>(row: RankedSelectionUnit<T>): boolean {
  if (row.score < 70) return false;
  if (row.reasons.includes('static_directory_fact')) return false;
  if (row.reasons.includes('supporting_fragment')) return false;
  if (row.reasons.includes('cross_village_drift')) return false;
  if (row.reasons.includes('too_early_event')) return false;
  if (row.reasons.includes('far_future_event')) return false;
  if (row.reasons.includes('future_publication')) return false;
  if (row.reasons.includes('low_village_confidence')) return false;
  if (row.reasons.includes('soft_filler') && !row.reasons.includes('public_safety') && !row.reasons.includes('civic_utility')) {
    return false;
  }
  if (row.reasons.includes('weak_url') && row.score < 115) return false;
  return true;
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
