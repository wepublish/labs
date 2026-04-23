export type ReviewUnitType = 'fact' | 'event' | 'entity_update';
export type ReviewVillageConfidence = 'high' | 'medium' | 'low';
export type ReviewDateConfidence = 'exact' | 'inferred' | 'unanchored';

export interface ReviewUnitLocation {
  city: string;
  country?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}

export interface ReviewUnit {
  uid: string;
  statement: string;
  unit_type: ReviewUnitType;
  entities: string[];
  event_date: string | null;
  date_confidence: ReviewDateConfidence | null;
  location: ReviewUnitLocation | null;
  village_confidence: ReviewVillageConfidence | null;
  assignment_path: string | null;
  review_required: boolean;
  evidence?: string;
}

const REVIEW_UNIT_TYPES = new Set<ReviewUnitType>(['fact', 'event', 'entity_update']);
const REVIEW_VILLAGE_CONFIDENCES = new Set<ReviewVillageConfidence>(['high', 'medium', 'low']);
const REVIEW_DATE_CONFIDENCES = new Set<ReviewDateConfidence>(['exact', 'inferred', 'unanchored']);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asIsoDate(value: unknown): string | null {
  const str = asNonEmptyString(value);
  if (!str) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

function asUnitType(value: unknown): ReviewUnitType {
  return typeof value === 'string' && REVIEW_UNIT_TYPES.has(value as ReviewUnitType)
    ? value as ReviewUnitType
    : 'fact';
}

function asVillageConfidence(value: unknown): ReviewVillageConfidence | null {
  if (value === null || value === undefined) return null;
  if (value === 'null') return null;
  return typeof value === 'string' && REVIEW_VILLAGE_CONFIDENCES.has(value as ReviewVillageConfidence)
    ? value as ReviewVillageConfidence
    : null;
}

function asDateConfidence(value: unknown): ReviewDateConfidence | null {
  if (value === null || value === undefined) return null;
  if (value === 'null') return null;
  return typeof value === 'string' && REVIEW_DATE_CONFIDENCES.has(value as ReviewDateConfidence)
    ? value as ReviewDateConfidence
    : null;
}

function asEntities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asLocation(value: unknown): ReviewUnitLocation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const city = asNonEmptyString((value as Record<string, unknown>).city);
  if (!city) return null;

  const country = asNonEmptyString((value as Record<string, unknown>).country) ?? undefined;
  const state = asNonEmptyString((value as Record<string, unknown>).state) ?? undefined;
  const latitude = asOptionalNumber((value as Record<string, unknown>).latitude);
  const longitude = asOptionalNumber((value as Record<string, unknown>).longitude);

  return {
    city,
    ...(country ? { country } : {}),
    ...(state ? { state } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
  };
}

export function sanitizeReviewUnit(value: unknown): ReviewUnit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const uid = asNonEmptyString(input.uid);
  const statement = asNonEmptyString(input.statement);

  if (!uid || !statement) return null;

  const evidence = asNonEmptyString(input.evidence) ?? undefined;
  const assignmentPath = asNonEmptyString(input.assignment_path);

  return {
    uid,
    statement,
    unit_type: asUnitType(input.unit_type),
    entities: asEntities(input.entities),
    event_date: asIsoDate(input.event_date),
    date_confidence: asDateConfidence(input.date_confidence),
    location: asLocation(input.location),
    village_confidence: asVillageConfidence(input.village_confidence),
    assignment_path: assignmentPath,
    review_required: input.review_required === true,
    ...(evidence ? { evidence } : {}),
  };
}

export function sanitizeReviewUnits(values: unknown[]): {
  units: ReviewUnit[];
  dropped: number;
} {
  const units: ReviewUnit[] = [];
  let dropped = 0;

  for (const value of values) {
    const unit = sanitizeReviewUnit(value);
    if (unit) units.push(unit);
    else dropped += 1;
  }

  return { units, dropped };
}
