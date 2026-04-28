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

const PUBLIC_SAFETY = [
  'unfall', 'kollision', 'verkehrsunfall', 'brand', 'polizei', 'feuerwehr',
  'verletz', 'spital', 'strasse gesperrt', 'sperrung', 'einsatz',
];

const CIVIC = [
  'gemeinderat', 'einwohnerrat', 'landrat', 'abstimmung', 'initiative',
  'budget', 'kredit', 'million', 'zone', 'bauarbeiten', 'sanierung',
  'verkehr', 'schule', 'kindergarten', 'wasser', 'versorgung', 'entsorgung',
  'tempo', 'baustelle', 'verwaltung', 'kehricht',
];

const SOFT_FILLER = [
  'geburtstag', 'hochzeit', 'gratuliert', 'verein', 'club', 'jubiläum',
  'kaffee', 'tombola',
];

export function rankSelectionCandidates<T extends UnitForSelectionRanking>(
  units: T[],
  opts: {
    currentDate: string;
    publicationDate: string;
    maxCandidates?: number;
  },
): RankedSelectionUnit<T>[] {
  const ranked = units.map((unit) => rankOne(unit, opts.currentDate, opts.publicationDate));
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

  if (containsAny(text, PUBLIC_SAFETY)) {
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
    }
  }

  if (publicationAge >= 0 && publicationAge <= 2) {
    score += 20;
    reasons.push('fresh');
  } else if (publicationAge > 7) {
    score -= 35;
    reasons.push('stale');
  }

  if (unit.article_url && !unit.is_listing_page) {
    score += 15;
    reasons.push('article_url');
  } else if (unit.is_listing_page || !unit.article_url) {
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
    (reasons.includes('public_safety') || reasons.includes('civic_utility'));

  return { unit, score, mandatory, reasons };
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
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
