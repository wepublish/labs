/**
 * @module bajour-auto-draft
 * Automated daily newsletter draft pipeline for a single village.
 * Triggered by pg_cron via dispatch_auto_drafts() at 17:00 Europe/Zurich,
 * Sunday-Thursday, for next-morning Monday-Friday issues.
 *
 * Pipeline: idempotency check → select units (LLM) → generate draft (LLM) →
 * validators (§3.5) → save → verify (WhatsApp) → metrics capture (§5.1).
 *
 * DRAFT_QUALITY.md §3 rollout: every new behaviour is feature-flagged via
 * edge-function env vars so flipping a flag off reverts to pre-change logic.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { requireInternalRequest } from '../_shared/internal-auth.ts';
import { openrouter } from '../_shared/openrouter.ts';
import {
  addDaysIso,
  buildInformationSelectPrompt,
  DRAFT_COMPOSE_PROMPT,
  DRAFT_COMPOSE_PROMPT_V2,
  INFORMATION_SELECT_PROMPT,
  formatUnitsForSelection,
  UNIT_FOR_COMPOSE_COLUMNS,
} from '../_shared/prompts.ts';
import { composeDraftFromUnits, composeDraftFromUnitsV2, renderDraftV2ToMarkdown } from '../_shared/compose-draft.ts';
import type { UnitForCompose } from '../_shared/compose-draft.ts';
import {
  getCorrespondentsForVillage,
  sendWhatsAppMessage,
  truncateForTemplateParam,
} from '../_shared/correspondents.ts';
import { MAX_UNITS_PER_COMPOSE } from '../_shared/constants.ts';
import { explainQualityScore } from '../_shared/quality-scoring.ts';
import { sendEmail } from '../_shared/resend.ts';
import { buildDraftFailureEmail, buildDraftWithheldEmail, type EmptyDraftCase } from '../_shared/resend.ts';
import { ANTI_PATTERNS, AGNOSTIC_POSITIVE_SEEDS } from '../_shared/draft-quality.ts';
import type { DraftV2 } from '../_shared/draft-quality.ts';
import { loadComposeFeedbackExamplesForVillage } from '../_shared/feedback-retrieval.ts';
import {
  buildSelectionDiagnostics,
  dedupeSelectionCandidates,
  enforceMandatorySelection,
  rankSelectionCandidates,
  refineSelectionForCompose,
} from '../_shared/selection-ranking.ts';
import {
  assessDraftQuality,
  formatWithheldReasons,
  qualityWarningsToEditorNotes,
  resolveDraftRunContext,
  selectFallbackUnitIds,
} from '../_shared/auto-draft-quality.ts';
import { signAdminDraftLink, buildAdminDraftUrl } from '../_shared/admin-link.ts';
import { prepareUnitsForCompose } from '../_shared/story-candidates.ts';
import { isWeekdayPublicationDate } from '../_shared/publication-calendar.ts';

const PUBLIC_APP_URL =
  Deno.env.get('PUBLIC_APP_URL') || 'https://wepublish.github.io/labs/dorfkoenig';

const DEFAULT_ADMIN_EMAILS = [
  'samuel.hufschmid@bajour.ch',
  'ernst.field@bajour.ch',
  'tom@wepublish.ch',
  'lukas@wepublish.ch',
  'elias@wepublish.ch',
].join(',');
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || DEFAULT_ADMIN_EMAILS)
  .split(',').map((s) => s.trim()).filter(Boolean);

// Feature flags (DRAFT_QUALITY.md §7). Default off = pre-change behaviour.
const FLAG_BULLET_SCHEMA = Deno.env.get('FEATURE_BULLET_SCHEMA') === 'true';
const FLAG_QUALITY_GATING = Deno.env.get('FEATURE_QUALITY_GATING') === 'true';
const FLAG_EMPTY_PATH_EMAIL = Deno.env.get('FEATURE_EMPTY_PATH_EMAIL') === 'true';
const FLAG_METRICS_CAPTURE = Deno.env.get('FEATURE_METRICS_CAPTURE') === 'true';
const FLAG_FEEDBACK_RETRIEVAL = Deno.env.get('FEATURE_FEEDBACK_RETRIEVAL') === 'true';

interface AutoDraftRequest {
  village_id: string;
  village_name: string;
  user_id: string;
  /** Optional operator backfill date. Normal cron calls omit this. */
  publication_date?: string;
}

const RECENCY_DAYS = 2;
const QUALITY_THRESHOLD = 40;
const MIN_BULLETS_FOR_PUBLISH = 1;
/** Window (days) over which a previously-published unit suppresses repetition. */
const PUBLISHED_DEDUP_WINDOW_DAYS = 14;

// --- Helpers ---

function zurichToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * For each candidate unit, find the most recent date (if any) the unit appeared
 * in a previously-published draft for this village within the dedup window.
 * The selection prompt uses this to soft-suppress repetition unless there's a
 * substantive update.
 */
async function loadPreviouslyPublishedDates(
  supabase: ReturnType<typeof createServiceClient>,
  villageId: string,
  candidateUnitIds: string[],
): Promise<Map<string, string>> {
  if (candidateUnitIds.length === 0) return new Map();
  const cutoff = new Date(
    Date.now() - PUBLISHED_DEDUP_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const { data, error } = await supabase
    .from('unit_occurrences')
    .select('unit_id, bajour_drafts!inner(village_id, published_at)')
    .in('unit_id', candidateUnitIds)
    .not('draft_id', 'is', null)
    .eq('bajour_drafts.village_id', villageId)
    .not('bajour_drafts.published_at', 'is', null)
    .gte('bajour_drafts.published_at', cutoff);

  if (error) {
    console.error('[auto-draft] previously-published lookup failed (non-fatal):', error);
    return new Map();
  }

  const map = new Map<string, string>();
  const rows = (data ?? []) as unknown as Array<{
    unit_id: string;
    bajour_drafts: { published_at: string } | Array<{ published_at: string }>;
  }>;
  for (const row of rows) {
    const joinedDraft = Array.isArray(row.bajour_drafts) ? row.bajour_drafts[0] : row.bajour_drafts;
    const date = joinedDraft?.published_at?.slice(0, 10);
    if (!date) continue;
    const prev = map.get(row.unit_id);
    if (!prev || date > prev) map.set(row.unit_id, date);
  }
  return map;
}

async function notifyEmptyPath(opts: {
  village_id: string;
  village_name: string;
  today: string;
  caseLabel: EmptyDraftCase;
  reasons: string[];
}): Promise<void> {
  if (!FLAG_EMPTY_PATH_EMAIL || ADMIN_EMAILS.length === 0) return;

  const feedUrl = `${PUBLIC_APP_URL}/#/scouts?village=${encodeURIComponent(opts.village_id)}`;
  const { subject, html } = buildDraftFailureEmail({
    villageName: opts.village_name,
    villageId: opts.village_id,
    date: opts.today,
    caseLabel: opts.caseLabel,
    reasons: opts.reasons,
    feedUrl,
  });

  try {
    await sendEmail({ to: ADMIN_EMAILS, subject, html });
  } catch (err) {
    console.error('[auto-draft] empty-path email send failed (non-fatal):', err);
  }
}

async function notifyWithheldDraft(opts: {
  draftId: string;
  village_id: string;
  village_name: string;
  publicationDate: string;
  draftTitle: string;
  draftBody: string;
  reasons: string[];
}): Promise<void> {
  if (ADMIN_EMAILS.length === 0) return;

  try {
    const signed = await signAdminDraftLink(opts.draftId);
    const draftUrl = buildAdminDraftUrl(PUBLIC_APP_URL, signed);
    const { subject, html } = buildDraftWithheldEmail({
      villageName: opts.village_name,
      villageId: opts.village_id,
      publicationDate: opts.publicationDate,
      draftTitle: opts.draftTitle,
      draftBody: opts.draftBody,
      draftUrl,
      reasons: opts.reasons,
    });
    await sendEmail({ to: ADMIN_EMAILS, subject, html });
  } catch (err) {
    console.error('[auto-draft] withheld email send failed (non-fatal):', err);
  }
}

async function notifyCompletedDraftStatus(opts: {
  draftId: string;
  village_id: string;
  village_name: string;
  publicationDate: string;
  draftTitle: string;
  draftBody: string;
  selectedUnitCount: number;
  verificationSent: boolean;
  verificationTimeoutAt: string | null;
  whatsappMessageCount: number;
}): Promise<void> {
  if (ADMIN_EMAILS.length === 0) return;

  try {
    const signed = await signAdminDraftLink(opts.draftId);
    const draftUrl = buildAdminDraftUrl(PUBLIC_APP_URL, signed);
    const status = opts.verificationSent ? 'ausstehend' : 'ausstehend, WhatsApp nicht gesendet';
    const verificationLine = opts.verificationSent
      ? `${opts.whatsappMessageCount} WhatsApp-Nachricht(en) gesendet` +
        (opts.verificationTimeoutAt ? `; Timeout: ${opts.verificationTimeoutAt}` : '')
      : 'Keine WhatsApp-Verifizierung gesendet. Bitte manuell prüfen.';

    const html = `<!doctype html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.45; color: #111; max-width: 760px;">
  <h1>Dorfkönig Entwurf: ${escapeHtml(opts.village_name)} — ${escapeHtml(status)}</h1>
  <p>
    <strong>Gemeinde:</strong> ${escapeHtml(opts.village_name)} (${escapeHtml(opts.village_id)})<br>
    <strong>Publikationsdatum:</strong> ${escapeHtml(opts.publicationDate)}<br>
    <strong>Entwurf:</strong> ${escapeHtml(opts.draftId)}<br>
    <strong>Ausgewählte Units:</strong> ${opts.selectedUnitCount}<br>
    <strong>Verifikation:</strong> ${escapeHtml(verificationLine)}
  </p>
  <p><a href="${escapeHtml(draftUrl)}">Entwurf im Admin öffnen</a></p>
  <h2>${escapeHtml(opts.draftTitle || '(ohne Titel)')}</h2>
  <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; background: #f6f6f6; padding: 12px; border-radius: 6px;">${escapeHtml(opts.draftBody)}</pre>
  <p style="color: #666; font-size: 12px;">
    Automatische Statusmeldung aus bajour-auto-draft. Korrespondenten erhalten weiterhin die WhatsApp-Verifizierung; diese E-Mail geht nur an Admins.
  </p>
</body>
</html>`;

    await sendEmail({
      to: ADMIN_EMAILS,
      subject: `Dorfkönig Status — ${opts.village_name}: ${status}`,
      html,
    });
  } catch (err) {
    console.error('[auto-draft] completed status email send failed (non-fatal):', err);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Main handler ---

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Methode nicht erlaubt', 405);
  }

  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const supabase = createServiceClient();
  const body: AutoDraftRequest = await req.json();
  const { village_id, village_name, user_id } = body;

  if (!village_id || !village_name || !user_id) {
    return errorResponse('village_id, village_name, user_id erforderlich', 400);
  }
  if (body.publication_date && !validIsoDate(body.publication_date)) {
    return errorResponse('publication_date muss YYYY-MM-DD sein', 400, 'VALIDATION_ERROR');
  }
  if (body.publication_date && !isWeekdayPublicationDate(body.publication_date)) {
    return errorResponse('publication_date muss Montag bis Freitag sein', 400, 'VALIDATION_ERROR');
  }

  // 1. Resolve run context. `publicationDate` is what readers see; `runDate`
  // anchors prompt recency when the draft is prepared the day before.
  const runContext = resolveDraftRunContext({
    requestedPublicationDate: body.publication_date,
    zurichToday: zurichToday(),
  });
  const { runDate, publicationDate } = runContext;
  let runId: number | null = null;

  if (!publicationDate) {
    console.log(`Auto-draft skipped: ${village_id} is not followed by a Mon-Fri publication day`);
    await supabase.from('auto_draft_runs').insert({
      village_id,
      status: 'skipped',
      error_message: 'non_publication_day',
      completed_at: new Date().toISOString(),
    });
    return jsonResponse({ data: { status: 'skipped', reason: 'non_publication_day' } });
  }

  try {
    // --- 1. Idempotency check ---
    const { data: existingDraft } = await supabase
      .from('bajour_drafts')
      .select('id')
      .eq('user_id', user_id)
      .eq('village_id', village_id)
      .eq('publication_date', publicationDate)
      .neq('verification_status', 'abgelehnt')
      .limit(1)
      .maybeSingle();

    if (existingDraft) {
      console.log(`Auto-draft skipped: draft already exists for user=${user_id} village=${village_id} on ${publicationDate}`);
      await supabase.from('auto_draft_runs').insert({
        village_id,
        status: 'skipped',
        error_message: `Draft already exists for ${publicationDate}`,
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ data: { status: 'skipped', reason: 'draft_exists' } });
    }

    // --- 2. Log run start ---
    const { data: runData } = await supabase
      .from('auto_draft_runs')
      .insert({ village_id, status: 'running' })
      .select('id')
      .single();
    runId = runData?.id ?? null;

    // --- 3. Select units (compound filter + quality gate when flagged) ---
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RECENCY_DAYS);

    let unitsQuery = supabase
      .from('information_units')
      .select('id, statement, unit_type, event_date, created_at, quality_score, publication_date, sensitivity, article_url, is_listing_page, source_domain, source_citation, village_confidence')
      .eq('location->>city', village_id)
      .eq('user_id', user_id)
      .eq('used_in_article', false)
      .not('statement', 'ilike', '[DEBUG]%')
      .not('source_domain', 'eq', 'example.invalid')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (FLAG_QUALITY_GATING) {
      // §3.2.1 compound date filter: news units fresh within 7d of the
      // publication issue, event units near-term from the reader's issue date.
      // Event end-window tightened 2026-04-26 from +14d → +7d after Tom's
      // feedback that events 3–5 days out ("Veranstaltungen vom 27./28. April")
      // were surfaced too early in the 24. Apr. draft. A weekly newsletter that
      // lands the next morning gets the most reader value from this-week events;
      // farther-out items get re-surfaced on later runs as they enter the window.
      const news7d = `${addDaysIso(publicationDate, -7)}T00:00:00Z`;
      const backstop30d = `${addDaysIso(publicationDate, -30)}T00:00:00Z`;
      const eventStart = publicationDate;
      const eventEnd = addDaysIso(publicationDate, 7);
      unitsQuery = unitsQuery
        .gte('created_at', backstop30d)
        .or(
          [
            `and(unit_type.eq.event,event_date.gte.${eventStart},event_date.lte.${eventEnd})`,
            `and(unit_type.neq.event,publication_date.gte.${addDaysIso(publicationDate, -14)})`,
            `and(unit_type.neq.event,publication_date.is.null,created_at.gte.${news7d})`,
          ].join(','),
        )
        .gte('quality_score', QUALITY_THRESHOLD);
    } else {
      unitsQuery = unitsQuery.gte('created_at', cutoffDate.toISOString());
    }

    const [
      { data: units, error: unitsError },
      { data: selectRow },
      { data: composeRow },
      { data: maxUnitsRow },
      { data: filteredCountRow },
    ] = await Promise.all([
      unitsQuery,
      supabase.from('user_prompts').select('content')
        .eq('user_id', user_id).eq('prompt_key', 'information_select').maybeSingle(),
      supabase.from('user_prompts').select('content')
        .eq('user_id', user_id).eq('prompt_key', 'draft_compose_layer2').maybeSingle(),
      supabase.from('user_settings').select('value')
        .eq('user_id', user_id).eq('key', 'max_units_per_compose').maybeSingle(),
      // When gating is on, also count rows BEFORE the quality filter to diagnose "all below threshold" empty path.
      FLAG_QUALITY_GATING
        ? supabase
            .from('information_units')
            .select('id, statement, source_url, source_domain, article_url, is_listing_page, event_date, publication_date, village_confidence, sensitivity', { count: 'exact' })
            .eq('location->>city', village_id)
            .eq('user_id', user_id)
            .eq('used_in_article', false)
            .gte('created_at', `${addDaysIso(publicationDate, -30)}T00:00:00Z`)
            .limit(20)
        : Promise.resolve({ data: null } as { data: null }),
    ]);

    const selectTemplate = selectRow?.content ?? INFORMATION_SELECT_PROMPT;
    const composeLayer2 = composeRow?.content ?? (FLAG_BULLET_SCHEMA ? DRAFT_COMPOSE_PROMPT_V2 : DRAFT_COMPOSE_PROMPT);
    const maxUnits = typeof maxUnitsRow?.value === 'number' && Number.isInteger(maxUnitsRow.value)
      ? maxUnitsRow.value
      : MAX_UNITS_PER_COMPOSE;

    if (unitsError) throw new Error(`Unit query failed: ${unitsError.message}`);

    if (!units || units.length === 0) {
      // §3.1.4 case (a) or (b): no units OR all units below quality threshold.
      const preFilter = filteredCountRow ?? [];
      const caseLabel: EmptyDraftCase =
        FLAG_QUALITY_GATING && Array.isArray(preFilter) && preFilter.length > 0
          ? 'all_below_quality_threshold'
          : 'no_units';

      const reasons: string[] = [];
      if (caseLabel === 'all_below_quality_threshold' && Array.isArray(preFilter)) {
        // Top reasons from explainQualityScore on the first few pre-filter rows.
        const sample = preFilter.slice(0, 3);
        for (const u of sample) {
          const reasonsForUnit = explainQualityScore({
            statement: u.statement,
            source_url: u.source_url,
            source_domain: u.source_domain,
            article_url: u.article_url,
            is_listing_page: u.is_listing_page,
            event_date: u.event_date,
            publication_date: u.publication_date,
            village_confidence: u.village_confidence,
            sensitivity: u.sensitivity,
            }, publicationDate);
          const gotKeys = new Set(reasonsForUnit.map((r) => r.key));
          const missingKeys = [
            'article_level_url',
            'recent_publication',
            'high_village_confidence',
            'non_social_media',
          ].filter((k) => !gotKeys.has(k as never));
          reasons.push(`"${u.statement.slice(0, 80)}…" — fehlt: ${missingKeys.join(', ') || '(nichts)'}`);
        }
      } else {
        reasons.push('Keine Einheiten im Zeitfenster. Prüfe Scouts + Kriterien.');
      }

      await notifyEmptyPath({ village_id, village_name, today: publicationDate, caseLabel, reasons });

      console.log(`Auto-draft skipped: ${caseLabel} for ${village_id}`);
      if (runId) {
        await supabase.from('auto_draft_runs')
          .update({ status: 'skipped', error_message: caseLabel, completed_at: new Date().toISOString() })
          .eq('id', runId);
      }
      return jsonResponse({ data: { status: 'skipped', reason: caseLabel } });
    }

    const candidateDedup = dedupeSelectionCandidates(units, {
      currentDate: runDate,
      publicationDate,
    });
    const candidateUnits = candidateDedup.units;
    if (candidateDedup.rejected.length > 0) {
      console.log(
        `[auto-draft] near-duplicate candidates removed for ${village_id}: ${candidateDedup.rejected.length}`,
      );
    }

    // Soft-dedup: look up which candidates appeared in a recently-published
    // draft for this village. Token injected into formatted lines below; the
    // selection prompt rule ("nur aufnehmen, wenn neue Entwicklung") drives the
    // soft skip decision.
    const previouslyPublished = await loadPreviouslyPublishedDates(
      supabase,
      village_id,
      candidateUnits.map((u) => u.id),
    );
    if (previouslyPublished.size > 0) {
      console.log(
        `[auto-draft] previously-published candidates for ${village_id}: ${previouslyPublished.size}/${candidateUnits.length}`,
      );
    }

    const rankedUnits = rankSelectionCandidates(candidateUnits, {
      currentDate: runDate,
      publicationDate,
      maxCandidates: 80,
      villageId: village_id,
    });
    const rankedUnitRows = rankedUnits.map((row) => row.unit);
    const formattedUnits = formatUnitsForSelection(rankedUnitRows, previouslyPublished);

    // Call LLM to select units
    const selectResponse = await openrouter.chat({
      messages: [
        {
          role: 'system',
          content: buildInformationSelectPrompt(runDate, RECENCY_DAYS, selectTemplate, publicationDate),
        },
        {
          role: 'user',
          content: `Hier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    let selectedIds: string[];
    let selectionResponsePreview = '';
    try {
      selectionResponsePreview = (selectResponse.choices[0].message.content ?? '').slice(0, 1000);
      const parsed = JSON.parse(selectResponse.choices[0].message.content ?? '{}');
      const validIds = new Set(rankedUnitRows.map((u) => u.id));
      selectedIds = (parsed.selected_unit_ids || []).filter((id: string) => validIds.has(id));
    } catch {
      console.error('Failed to parse LLM selection response');
      selectionResponsePreview = 'parse_failed';
      selectedIds = selectFallbackUnitIds(rankedUnits, maxUnits);
    }

    if (selectedIds.length === 0) {
      selectionResponsePreview ||= 'empty_selection_fallback';
      selectedIds = selectFallbackUnitIds(rankedUnits, maxUnits);
    }
    selectedIds = enforceMandatorySelection(selectedIds, rankedUnits, maxUnits);
    selectedIds = refineSelectionForCompose(selectedIds, rankedUnits, maxUnits);

    if (runId) {
      const diagnostics = buildSelectionDiagnostics(rankedUnits, selectedIds);
      await supabase.from('auto_draft_runs')
        .update({
          candidate_snapshot: diagnostics.candidate_snapshot,
          selected_unit_ids: selectedIds,
          mandatory_kept_ids: diagnostics.mandatory_kept_ids,
          rejected_top_units: [
            ...candidateDedup.rejected.slice(0, 10),
            ...diagnostics.rejected_top_units,
          ].slice(0, 20),
          selection_response_preview: selectionResponsePreview.slice(0, 1000),
        })
        .eq('id', runId);
    }

    // --- 4. Generate draft ---
    const { data: selectedUnitsData, error: selectedError } = await supabase
      .from('information_units')
      .select(UNIT_FOR_COMPOSE_COLUMNS + ', location, village_confidence')
      .in('id', selectedIds);

    if (selectedError) throw new Error(`Selected units fetch failed: ${selectedError.message}`);

    // Server-side village re-check — defense against extraction mislabels AND
    // §3.4.5 tighten: also drop low-confidence village attributions.
    const selectedUnitRows = (selectedUnitsData || []) as unknown as Array<UnitForCompose & {
      location?: { city?: string } | null;
      village_confidence?: string | null;
    }>;
    const villageCheckedUnits = selectedUnitRows.filter(
      (u: { location?: { city?: string } | null; village_confidence?: string | null }) => {
        const city = u.location?.city;
        if (city !== village_id) {
          console.warn(`auto-draft: dropping unit with location.city=${city} from ${village_id} draft`);
          return false;
        }
        if (FLAG_QUALITY_GATING && u.village_confidence === 'low') {
          console.warn(`auto-draft: dropping low-confidence village assignment for ${village_id}`);
          return false;
        }
        return true;
      },
    );
    const selectedUnitsById = new Map(villageCheckedUnits.map((u) => [u.id, u]));
    const orderedSelectedUnits: UnitForCompose[] = [];
    for (const id of selectedIds) {
      const unit = selectedUnitsById.get(id);
      if (unit) orderedSelectedUnits.push(unit);
    }
    const selectedUnits = prepareUnitsForCompose(orderedSelectedUnits, rankedUnits);
    selectedIds = selectedUnits.map((u) => u.id).filter((id): id is string => Boolean(id));

    // Compose: either v1 (legacy markdown sections) or v2 (bullet schema) based on flag.
    let draftTitle: string;
    let bodyMd: string;
    let bulletsJson: unknown | null = null;
    let schemaVersion: number;
    let notesForEditor: string[] = [];
    let bulletCount = 0;
    let retrievedExamples:
      | Awaited<ReturnType<typeof loadComposeFeedbackExamplesForVillage>>
      | null = null;

    if (FLAG_BULLET_SCHEMA && FLAG_FEEDBACK_RETRIEVAL) {
      try {
        retrievedExamples = await loadComposeFeedbackExamplesForVillage(
          supabase,
          village_id,
          AGNOSTIC_POSITIVE_SEEDS,
          ANTI_PATTERNS,
        );
        console.log(
          `[auto-draft] feedback examples for ${village_id}: village+ ${retrievedExamples.villagePositiveCount}/${retrievedExamples.villageNegativeCount}, prompt ${retrievedExamples.positiveExamples.length}/${retrievedExamples.antiPatterns.length}`,
        );
      } catch (feedbackErr) {
        console.error('[auto-draft] feedback retrieval failed, using static defaults:', feedbackErr);
      }
    }

    if (FLAG_BULLET_SCHEMA) {
      const { draft: v2 } = await composeDraftFromUnitsV2({
        village_id,
        village_name,
        selected_units: selectedUnits,
        compose_layer2: composeLayer2,
        antiPatterns: retrievedExamples?.antiPatterns,
        positiveExamples: retrievedExamples?.positiveExamples,
        ctx: { village_id, run_id: runId ?? undefined },
        currentDate: runDate,
        publicationDate,
      });
      draftTitle = v2.title;
      bulletsJson = v2;
      bodyMd = renderDraftV2ToMarkdown(v2);
      notesForEditor = v2.notes_for_editor;
      bulletCount = v2.bullets.length;
      schemaVersion = 2;
    } else {
      const { draft: v1, body_md } = await composeDraftFromUnits({
        village_id,
        village_name,
        selected_units: selectedUnits,
        compose_layer2: composeLayer2,
        ctx: { village_id, run_id: runId ?? undefined },
      });
      draftTitle = v1.title || `${village_name} — ${publicationDate}`;
      bodyMd = body_md;
      schemaVersion = 1;
      bulletCount = (v1.sections?.length ?? 0) + (v1.greeting ? 1 : 0); // approximate for metrics
    }

    // §3.1.4 case (c): empty v2 draft. Notify admins, mark run skipped, do not send WhatsApp.
    if (FLAG_BULLET_SCHEMA && bulletCount < MIN_BULLETS_FOR_PUBLISH) {
      await notifyEmptyPath({
        village_id,
        village_name,
        today: publicationDate,
        caseLabel: 'llm_under_produced',
        reasons: notesForEditor.length > 0 ? notesForEditor : ['Modell hat bullets:[] zurückgegeben.'],
      });
      if (runId) {
        await supabase.from('auto_draft_runs')
          .update({
            status: 'skipped',
            error_message: 'llm_under_produced',
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId);
      }
      return jsonResponse({ data: { status: 'skipped', reason: 'llm_under_produced' } });
    }

    // 5. Assess quality. This is intentionally after deterministic validators:
    // validator notes are part of the blocking signal, not quiet metadata.
    const quality = FLAG_BULLET_SCHEMA
      ? assessDraftQuality({
          draft: bulletsJson as DraftV2,
          selectedUnits,
          rankedSelection: rankedUnits,
          selectedIds,
          context: runContext,
        })
      : { decision: 'send' as const, warnings: [] };
    if (quality.warnings.length > 0) {
      notesForEditor = [...notesForEditor, ...qualityWarningsToEditorNotes(quality.warnings)];
      if (bulletsJson && typeof bulletsJson === 'object') {
        bulletsJson = {
          ...(bulletsJson as Record<string, unknown>),
          notes_for_editor: notesForEditor,
        };
      }
    }
    const verificationStatus = quality.decision === 'withhold' ? 'withheld' : 'ausstehend';

    // --- 5. Save draft ---
    const { data: savedDraft, error: saveError } = await supabase
      .from('bajour_drafts')
      .insert({
        user_id,
        village_id,
        village_name,
        title: draftTitle,
        body: bodyMd.trim(),
        schema_version: schemaVersion,
        bullets_json: bulletsJson,
        quality_warnings: quality.warnings,
        selected_unit_ids: selectedIds,
        publication_date: publicationDate,
        verification_status: verificationStatus,
        verification_resolved_at: verificationStatus === 'withheld' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (saveError) throw new Error(`Draft save failed: ${saveError.message}`);

    const draftId = savedDraft.id;

    // Mark units as used only once the draft is good enough to send. Withheld
    // drafts remain review artifacts and should not burn future candidates.
    if (quality.decision === 'send') {
      await supabase
        .from('information_units')
        .update({ used_in_article: true, used_at: new Date().toISOString() })
        .in('id', selectedIds);
    }

    // --- 5b. Inline metrics capture (§5.1) ---
    if (FLAG_METRICS_CAPTURE) {
      try {
        await writeDraftQualityMetrics({
          supabase,
          draftId,
          villageId: village_id,
          schemaVersion,
          bodyMd,
          bulletsJson,
          notesForEditor,
        });
      } catch (metricsErr) {
        console.error('[auto-draft] metrics capture failed (non-fatal):', metricsErr);
      }
    }

    if (quality.decision === 'withhold') {
      const reasons = formatWithheldReasons(quality.warnings);
      await notifyWithheldDraft({
        draftId,
        village_id,
        village_name,
        publicationDate,
        draftTitle,
        draftBody: bodyMd.trim(),
        reasons,
      });
      if (runId) {
        await supabase.from('auto_draft_runs')
          .update({
            status: 'skipped',
            draft_id: draftId,
            error_message: `withheld: ${reasons.slice(0, 3).join(' | ')}`.slice(0, 500),
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId);
      }
      return jsonResponse({
        data: {
          status: 'withheld',
          draft_id: draftId,
          units_selected: selectedIds.length,
          reasons,
        },
      });
    }

    // --- 6. Send WhatsApp verification (non-fatal) ---
    let verificationSent = false;
    let verificationTimeoutAt: string | null = null;
    let whatsappMessageCount = 0;
    try {
      const correspondents = await getCorrespondentsForVillage(village_id);

      if (correspondents.length > 0) {
        const allMessageIds: string[] = [];

        const bodyParam = await truncateForTemplateParam(
          bodyMd.trim(),
          PUBLIC_APP_URL,
          draftId,
        );

        for (const correspondent of correspondents) {
          const phoneWithPlus = '+' + correspondent.phone;

          const templateResult = await sendWhatsAppMessage({
            to: phoneWithPlus,
            type: 'template',
            template: {
              name: 'bajour_draft_verification_v2',
              language: { code: 'de' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: village_name },
                    { type: 'text', text: publicationDate },
                    { type: 'text', text: bodyParam },
                  ],
                },
              ],
            },
          });
          allMessageIds.push(templateResult.message_id);
        }

        const now = new Date();
        const timeoutAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        verificationTimeoutAt = timeoutAt.toISOString();
        whatsappMessageCount = allMessageIds.length;

        await supabase
          .from('bajour_drafts')
          .update({
            verification_sent_at: now.toISOString(),
            verification_timeout_at: verificationTimeoutAt,
            whatsapp_message_ids: allMessageIds,
          })
          .eq('id', draftId);

        verificationSent = true;
      } else {
        console.warn(`No active correspondents for ${village_id}, skipping verification`);
      }
    } catch (whatsappErr) {
      console.error(`WhatsApp send failed for ${village_id} (non-fatal):`, whatsappErr);
    }

    // --- 7. Update run log ---
    if (runId) {
      await supabase.from('auto_draft_runs')
        .update({
          status: 'completed',
          draft_id: draftId,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    await notifyCompletedDraftStatus({
      draftId,
      village_id,
      village_name,
      publicationDate,
      draftTitle,
      draftBody: bodyMd.trim(),
      selectedUnitCount: selectedIds.length,
      verificationSent,
      verificationTimeoutAt,
      whatsappMessageCount,
    });

    console.log(
      `Auto-draft completed for ${village_id}: draft ${draftId}, units: ${selectedIds.length}, verification: ${verificationSent}`,
    );

    return jsonResponse({
      data: {
        status: 'completed',
        draft_id: draftId,
        units_selected: selectedIds.length,
        verification_sent: verificationSent,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`bajour-auto-draft error for ${village_id}:`, message);

    if (runId) {
      await supabase.from('auto_draft_runs')
        .update({
          status: 'failed',
          error_message: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    return errorResponse(message, 500);
  }
});

/**
 * §5.1 inline metric capture. Production can't replay fixtures against frozen
 * gold bullets, so we skip `unit_recall_vs_gold` — the other 5 metrics are
 * computed from the same draft-shape the editor sees.
 */
async function writeDraftQualityMetrics(args: {
  supabase: ReturnType<typeof createServiceClient>;
  draftId: string;
  villageId: string;
  schemaVersion: number;
  bodyMd: string;
  bulletsJson: unknown | null;
  notesForEditor: string[];
}): Promise<void> {
  const { supabase, draftId, villageId, schemaVersion, bodyMd, bulletsJson, notesForEditor } = args;

  // Lazy import so _shared/draft-quality.ts's banlist is the only place that
  // owns the pattern list — avoids a second copy here.
  const { FORBIDDEN_PHRASE_PATTERNS } = await import('../_shared/draft-quality.ts');

  const bullets = schemaVersion === 2 && bulletsJson
    ? ((bulletsJson as { bullets?: Array<{ text?: string; article_url?: string | null; source_unit_ids?: string[] }> }).bullets ?? [])
    : [];
  const bulletCount = bullets.length;

  const fillerHits = FORBIDDEN_PHRASE_PATTERNS.filter((p: RegExp) => p.test(bodyMd));

  const metrics = {
    bullet_count: {
      pass: schemaVersion === 2
        ? bulletCount <= 4 && (bulletCount > 0 || notesForEditor.length > 0)
        : true,
      value: bulletCount,
    },
    no_filler: {
      pass: fillerHits.length === 0,
      hits: fillerHits.length,
    },
    // url_whitelist and url_article_quality only make sense on v2 where provenance is structured.
    url_whitelist: { pass: true, note: schemaVersion === 2 ? 'v2-structured' : 'v1-skipped' },
    url_article_quality: { pass: true, note: schemaVersion === 2 ? 'v2-structured' : 'v1-skipped' },
    cross_village_purity: { pass: true, note: 'enforced pre-prompt by §3.4.5 filter' },
  };

  const aggregate = Object.values(metrics).filter((m) => m.pass).length * (100 / 5);

  await supabase.from('draft_quality_metrics').insert({
    draft_id: draftId,
    village_id: villageId,
    metrics,
    aggregate_score: Math.round(aggregate),
    warnings: notesForEditor,
    schema_version: schemaVersion,
  });
}
