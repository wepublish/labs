/**
 * @module auto-draft-quality
 *
 * Traceable quality policy for bajour-auto-draft. The edge function should
 * orchestrate; this module owns decisions that decide whether a generated draft
 * is strong enough to send to correspondents.
 */

import type { DraftV2 } from './draft-quality.ts';
import type { RankedSelectionUnit, UnitForSelectionRanking } from './selection-ranking.ts';
import { addDaysIso } from './prompts.ts';
import { isArticleLevelUrl } from './source-url.ts';
import { isWeekdayPublicationDate, nextPublicationDateFromZurichRunDate } from './publication-calendar.ts';

export type WithheldReason =
  | 'selection_empty'
  | 'weak_sources'
  | 'title_body_mismatch'
  | 'missing_required_context'
  | 'date_framing_risk'
  | 'not_enough_data';

export interface QualityWarning {
  reason: WithheldReason;
  severity: 'blocker' | 'warning';
  message: string;
  unit_ids?: string[];
}

export interface DraftRunContext {
  /** Date the system is drafting from. Normal cron: Zurich today. */
  runDate: string;
  /** Reader-facing issue date. Normal cron: next weekday issue or null on non-publication days. */
  publicationDate: string | null;
  /** True when the operator requested a historical publication date. */
  isBackfill: boolean;
}

export interface QualityAssessment {
  decision: 'send' | 'withhold';
  warnings: QualityWarning[];
}

interface ComposeUnit {
  id?: string;
  statement: string;
  unit_type: string;
  event_date?: string | null;
  article_url?: string | null;
  source_url?: string | null;
  source_domain?: string | null;
  source_citation?: { citation_label?: string | null } | null;
}

export function subtractDaysIso(isoDate: string, days: number): string {
  return addDaysIso(isoDate, -days);
}

/**
 * Resolve dates once at the top of the pipeline so selection and compose share
 * the same reader-facing semantics. Backfills pass publication_date; normal
 * cron omits it and drafts for tomorrow's issue.
 */
export function resolveDraftRunContext(opts: {
  requestedPublicationDate?: string;
  zurichToday: string;
}): DraftRunContext {
  if (opts.requestedPublicationDate) {
    return {
      runDate: subtractDaysIso(opts.requestedPublicationDate, 1),
      publicationDate: isWeekdayPublicationDate(opts.requestedPublicationDate)
        ? opts.requestedPublicationDate
        : null,
      isBackfill: true,
    };
  }
  return {
    runDate: opts.zurichToday,
    publicationDate: nextPublicationDateFromZurichRunDate(opts.zurichToday),
    isBackfill: false,
  };
}

/**
 * Deterministic fallback when the selector returns nothing. Keep it narrow:
 * enough to produce a draft from strong units, never a sweep of weak leftovers.
 */
export function selectFallbackUnitIds<T extends UnitForSelectionRanking>(
  ranked: RankedSelectionUnit<T>[],
  maxUnits: number,
): string[] {
  const selected: string[] = [];
  const seenStatements = new Set<string>();

  for (const row of ranked) {
    if (selected.length >= maxUnits) break;
    if (!isFallbackEligible(row)) continue;

    const fingerprint = statementFingerprint(row.unit.statement);
    if ([...seenStatements].some((seen) => fingerprintsOverlap(seen, fingerprint))) continue;
    seenStatements.add(fingerprint);
    selected.push(row.unit.id);
  }

  return selected;
}

export function isFallbackEligible<T extends UnitForSelectionRanking>(
  row: RankedSelectionUnit<T>,
): boolean {
  if (row.score < 70) return false;
  if (row.reasons.includes('stale_sensitive')) return false;
  if (row.reasons.includes('low_village_confidence')) return false;
  if (row.reasons.includes('weak_url') && row.score < 95) return false;
  return true;
}

export function assessDraftQuality(args: {
  draft: DraftV2;
  selectedUnits: ComposeUnit[];
  rankedSelection: RankedSelectionUnit[];
  selectedIds: string[];
  context: DraftRunContext;
}): QualityAssessment {
  const warnings: QualityWarning[] = [];
  const draftText = renderDraftSearchText(args.draft);
  const bulletSourceIds = new Set(args.draft.bullets.flatMap((b) => b.source_unit_ids));

  const titleMisses = findTitleBodyMismatch(args.draft.title, draftText);
  for (const term of titleMisses) {
    warnings.push({
      reason: 'title_body_mismatch',
      severity: 'blocker',
      message: `Titel nennt "${term}", aber kein Bullet greift das Thema auf.`,
    });
  }

  for (const note of args.draft.notes_for_editor) {
    const classified = classifyEditorNote(note);
    if (classified) warnings.push(classified);
  }

  for (const row of args.rankedSelection.slice(0, 8)) {
    if (!row.mandatory || !args.selectedIds.includes(row.unit.id)) continue;
    if (bulletSourceIds.has(row.unit.id)) continue;
    warnings.push({
      reason: 'missing_required_context',
      severity: 'blocker',
      message: `Starke ausgewählte Einheit fehlt im Entwurf: ${row.unit.statement.slice(0, 140)}`,
      unit_ids: [row.unit.id],
    });
  }

  for (const bullet of args.draft.bullets) {
    const sourceUnits = args.selectedUnits.filter((u) => u.id && bullet.source_unit_ids.includes(u.id));
    const hasStructuredCitation = sourceUnits.some((u) => Boolean(u.source_citation?.citation_label));
    if (!bullet.article_url && !hasStructuredCitation && sourceUnits.some((u) => isArticleLevelUrl(u.article_url))) {
      warnings.push({
        reason: 'weak_sources',
        severity: 'blocker',
        message: `Bullet fehlt Quellenlink trotz verfügbarer Artikel-URL: ${bullet.text.slice(0, 140)}`,
        unit_ids: bullet.source_unit_ids,
      });
    }

    const hasEvent = sourceUnits.some((u) => u.unit_type === 'event');
    if (!hasEvent) continue;
    const hasUrl = Boolean(bullet.article_url);
    const sufficientContext = hasSufficientEventContext(bullet.text, sourceUnits);
    if (!hasUrl && !sufficientContext) {
      warnings.push({
        reason: 'missing_required_context',
        severity: 'blocker',
        message: `Event-Bullet hat zu wenig Kontext: ${bullet.text.slice(0, 140)}`,
        unit_ids: bullet.source_unit_ids,
      });
    }
  }

  const eventSourceCount = args.selectedUnits.filter((u) => u.unit_type === 'event').length;
  const civicOrSafetyCount = args.selectedUnits.filter((u) => hasCivicOrSafetySignal(u.statement)).length;
  if (args.selectedUnits.length >= 3 && eventSourceCount >= args.selectedUnits.length - 1 && civicOrSafetyCount === 0) {
    warnings.push({
      reason: 'not_enough_data',
      severity: 'warning',
      message: 'Auswahl besteht fast nur aus weichen Veranstaltungshinweisen; kein klarer News-/Service-Lead erkennbar.',
      unit_ids: args.selectedIds,
    });
  }

  if (args.context.isBackfill && /\b(heute|morgen|gestern|seit gestern)\b/i.test(draftText)) {
    warnings.push({
      reason: 'date_framing_risk',
      severity: 'warning',
      message: 'Backfill enthält relative Datumswörter; bitte prüfen, ob sie zum Erscheinungsdatum passen.',
    });
  }

  return {
    decision: warnings.some((w) => w.severity === 'blocker') ? 'withhold' : 'send',
    warnings,
  };
}

export function qualityWarningsToEditorNotes(warnings: QualityWarning[]): string[] {
  return warnings.map((w) => `[${w.severity}] ${w.message}`);
}

export function formatWithheldReasons(warnings: QualityWarning[]): string[] {
  if (warnings.length === 0) return ['Entwurf wurde ohne Detailgrund zurückgehalten.'];
  return warnings.map((w) => `${w.reason}: ${w.message}`);
}

function classifyEditorNote(note: string): QualityWarning | null {
  if (/Emoji .* ersetzt|herabgestuft/i.test(note)) {
    return { reason: 'missing_required_context', severity: 'warning', message: note };
  }
  if (
    /URL:NO_LINK|kein direkter Link|kein Link verfügbar|Keine URL|NO_LINK|URL verfügbar/i.test(note) &&
    /lokal relevant|lokale? Relevanz|Quality\s*(?:[6-9]\d|100)/i.test(note)
  ) {
    return { reason: 'weak_sources', severity: 'warning', message: note };
  }
  if (/generische .*URL|kein direkter Link|kein Link verfügbar|Keine URL|NO_LINK|URL verfügbar/i.test(note)) {
    return { reason: 'weak_sources', severity: 'blocker', message: note };
  }
  if (/fehlt|Bitte prüfen|Bitte verifizieren|Bitte ergänzen|Bitte.*nachfragen|Details.*prüfen/i.test(note)) {
    return { reason: 'missing_required_context', severity: 'blocker', message: note };
  }
  if (/verworfen/i.test(note)) {
    return { reason: 'missing_required_context', severity: 'blocker', message: note };
  }
  return null;
}

function hasCivicOrSafetySignal(statement: string): boolean {
  return /\b(unfall|kollision|brand|polizei|feuerwehr|sperrung|strasse gesperrt|gemeinderat|einwohnerrat|landrat|abstimmung|initiative|budget|kredit|planung|kantonsstrasse|talboden|dreispitz|schwimmbad|schule|verwaltung|kehricht|wahl|nationalrat|behörde|kommission|baugesuch)\b/i
    .test(statement);
}

function hasSufficientEventContext(text: string, sourceUnits: ComposeUnit[]): boolean {
  const haystack = `${text} ${sourceUnits.map((u) => u.statement).join(' ')}`;
  const hasExplicitDate =
    /\b\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+|\b\d{4}-\d{2}-\d{2}|\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\b/i
      .test(text);
  const hasRelativeTiming =
    /\b(heute|morgen|gestern|übermorgen|ab heute|ab morgen|bis\s+(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)|noch bis|seit heute|seit gestern|ganztägig)\b/i
      .test(text);
  const hasSourceDate = sourceUnits.some((u) => Boolean(u.event_date));
  const hasTiming = hasExplicitDate || hasRelativeTiming || hasSourceDate;
  const hasCivicContext = hasCivicOrSafetySignal(haystack);
  const hasPlaceOrService =
    /\b(?:Uhr|Restaurant|Kirche|Areal|Strasse|Straße|Weg|Gasse|Kreuzung|Kreuzungsbereich|Saal|Treffpunkt|Anmeldung|Start|Ort|Sperrung|Vollsperrung|Bauarbeiten|Baustelle|Kehricht|Abfall|Verwaltung|Schalter|Schule|Kindergarten|Wasser|Strom)\b/i
      .test(haystack) || hasCivicContext;
  return hasTiming && hasPlaceOrService;
}

function findTitleBodyMismatch(title: string, bodyText: string): string[] {
  const titleTokens = importantTitleTokens(title);
  const body = normaliseText(bodyText);
  return titleTokens.filter((token) => !body.includes(token));
}

function importantTitleTokens(title: string): string[] {
  const stop = new Set([
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'mit', 'für',
    'von', 'vom', 'im', 'in', 'am', 'an', 'zu', 'zur', 'zum', 'aus',
    'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
    'januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'dezember',
    'arlesheim', 'münchenstein', 'muenchenstein',
  ]);
  return normaliseText(title)
    .split(/[^a-z0-9äöüß]+/i)
    .filter((t) => t.length >= 5 && !stop.has(t));
}

function renderDraftSearchText(draft: DraftV2): string {
  return draft.bullets.map((b) => b.text).join(' ');
}

function normaliseText(value: string): string {
  return value.toLocaleLowerCase('de-CH').replace(/[-–—]/g, ' ');
}

function statementFingerprint(statement: string): string {
  return normaliseText(statement)
    .replace(/\b\d{1,2}\.?\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .split(/[^a-z0-9äöüß]+/i)
    .filter((t) => t.length >= 4)
    .map(stemToken)
    .slice(0, 8)
    .sort()
    .join('|');
}

function stemToken(token: string): string {
  return token
    .replace(/ungen$/, 'ung')
    .replace(/führungen$/, 'führung')
    .replace(/ungen$/, 'ung')
    .replace(/(en|er|es|e|t)$/u, '');
}

function fingerprintsOverlap(a: string, b: string): boolean {
  const aa = new Set(a.split('|').filter(Boolean));
  const bb = new Set(b.split('|').filter(Boolean));
  if (aa.size === 0 || bb.size === 0) return false;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap++;
  return overlap / Math.min(aa.size, bb.size) >= 0.6;
}
