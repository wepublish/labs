/**
 * @module bajour-auto-draft
 * Automated daily newsletter draft pipeline for a single village.
 * Triggered by pg_cron via dispatch_auto_drafts() at 18:00 Europe/Zurich.
 *
 * Pipeline: idempotency check → select units (LLM) → generate draft (LLM) → save → verify (WhatsApp)
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { buildInformationSelectPrompt, DRAFT_COMPOSE_PROMPT, INFORMATION_SELECT_PROMPT, formatUnitsForSelection, formatUnitsByType, UNIT_FOR_COMPOSE_COLUMNS } from '../_shared/prompts.ts';
import { getCorrespondentsForVillage, sendWhatsAppMessage, truncateForTemplateParam } from '../_shared/correspondents.ts';
import { MAX_UNITS_PER_COMPOSE } from '../_shared/constants.ts';

const PUBLIC_APP_URL =
  Deno.env.get('PUBLIC_APP_URL') || 'https://wepublish.github.io/labs/dorfkoenig';

interface AutoDraftRequest {
  village_id: string;
  village_name: string;
  user_id: string;
}

const RECENCY_DAYS = 2;

// --- Helpers ---

function zurichToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
}

// --- Main handler ---

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Methode nicht erlaubt', 405);
  }

  const supabase = createServiceClient();
  const body: AutoDraftRequest = await req.json();
  const { village_id, village_name, user_id } = body;

  if (!village_id || !village_name || !user_id) {
    return errorResponse('village_id, village_name, user_id erforderlich', 400);
  }

  const today = zurichToday();
  let runId: number | null = null;

  try {
    // --- 1. Idempotency check ---
    const { data: existingDraft } = await supabase
      .from('bajour_drafts')
      .select('id')
      .eq('village_id', village_id)
      .eq('publication_date', today)
      .neq('verification_status', 'abgelehnt')
      .limit(1)
      .maybeSingle();

    if (existingDraft) {
      console.log(`Auto-draft skipped: draft already exists for ${village_id} on ${today}`);
      await supabase.from('auto_draft_runs').insert({
        village_id,
        status: 'skipped',
        error_message: 'Draft already exists for today',
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

    // --- 3. Select units ---
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RECENCY_DAYS);

    // Kick off per-user override queries in parallel with the units query (both land in the
    // single `await Promise.all` below, so an early return can't leak a pending promise).
    const [
      { data: units, error: unitsError },
      { data: selectRow },
      { data: composeRow },
      { data: maxUnitsRow },
    ] = await Promise.all([
      supabase
        .from('information_units')
        .select('id, statement, unit_type, event_date, created_at')
        .eq('location->>city', village_id)
        .eq('user_id', user_id)
        .eq('used_in_article', false)
        .gte('created_at', cutoffDate.toISOString())
        .order('event_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('user_prompts').select('content')
        .eq('user_id', user_id).eq('prompt_key', 'information_select').maybeSingle(),
      supabase.from('user_prompts').select('content')
        .eq('user_id', user_id).eq('prompt_key', 'draft_compose_layer2').maybeSingle(),
      supabase.from('user_settings').select('value')
        .eq('user_id', user_id).eq('key', 'max_units_per_compose').maybeSingle(),
    ]);

    const selectTemplate = selectRow?.content ?? INFORMATION_SELECT_PROMPT;
    const composeLayer2 = composeRow?.content ?? DRAFT_COMPOSE_PROMPT;
    const maxUnits = typeof maxUnitsRow?.value === 'number' && Number.isInteger(maxUnitsRow.value)
      ? maxUnitsRow.value
      : MAX_UNITS_PER_COMPOSE;

    if (unitsError) throw new Error(`Unit query failed: ${unitsError.message}`);

    if (!units || units.length === 0) {
      console.log(`Auto-draft skipped: no units for ${village_id}`);
      if (runId) {
        await supabase.from('auto_draft_runs')
          .update({ status: 'skipped', error_message: 'No unused units available', completed_at: new Date().toISOString() })
          .eq('id', runId);
      }
      return jsonResponse({ data: { status: 'skipped', reason: 'no_units' } });
    }

    // Format units for LLM
    const formattedUnits = formatUnitsForSelection(units);

    // Call LLM to select units
    const selectResponse = await openrouter.chat({
      messages: [
        { role: 'system', content: buildInformationSelectPrompt(today, RECENCY_DAYS, selectTemplate) },
        { role: 'user', content: `Hier sind die verfügbaren Informationseinheiten:\n\n${formattedUnits}\n\nWähle die relevantesten Einheiten für den Newsletter aus.` },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    let selectedIds: string[];
    try {
      const parsed = JSON.parse(selectResponse.choices[0].message.content);
      const validIds = new Set(units.map(u => u.id));
      selectedIds = (parsed.selected_unit_ids || []).filter((id: string) => validIds.has(id));
    } catch {
      console.error('Failed to parse LLM selection response');
      selectedIds = [];
    }

    // Fallback: if empty, use first `maxUnits` units
    if (selectedIds.length === 0) {
      selectedIds = units.slice(0, maxUnits).map(u => u.id);
    }

    // Cap at per-user `maxUnits`
    if (selectedIds.length > maxUnits) {
      selectedIds = selectedIds.slice(0, maxUnits);
    }

    // --- 4. Generate draft ---
    const { data: selectedUnitsRaw, error: selectedError } = await supabase
      .from('information_units')
      .select(UNIT_FOR_COMPOSE_COLUMNS + ', location')
      .in('id', selectedIds);

    if (selectedError) throw new Error(`Selected units fetch failed: ${selectedError.message}`);

    // Server-side village re-check: defense-in-depth against extraction-time
    // mislabels (unit stored with location.city = village_id but statement
    // actually about a different Gemeinde). Drop mismatches before the LLM
    // sees them so cross-village leaks can't land in the final draft.
    const selectedUnits = (selectedUnitsRaw || []).filter((u: { location?: { city?: string } | null }) => {
      const city = u.location?.city;
      if (city === village_id) return true;
      console.warn(`auto-draft: dropping unit with location.city=${city} from ${village_id} draft`);
      return false;
    });

    // Format units grouped by type for draft generation
    const formattedSelected = formatUnitsByType(selectedUnits, true);

    // Build 3-layer newsletter prompt
    const layer1 = `Du bist ein KI-Assistent für den Newsletter "${village_name} — Wochenüberblick".
Du schreibst AUSSCHLIEßLICH basierend auf den bereitgestellten Informationseinheiten und AUSSCHLIESSLICH für die Gemeinde ${village_name}.
ERFINDE KEINE Informationen. Wenn etwas unklar ist, kennzeichne es als "nicht bestätigt".
Einheiten, die primär eine andere Gemeinde als ${village_name} betreffen, dürfen NICHT als eigenständige Meldungen auftauchen — auch dann nicht, wenn ${village_name} beiläufig erwähnt wird.`;

    const layer3 = `Schreibe den gesamten Newsletter auf Deutsch.

Ausgabeformat (JSON):
{
  "title": "Wochentitel",
  "greeting": "Kurze Begrüssung (1 Satz)",
  "sections": [
    {
      "heading": "Abschnittsüberschrift",
      "body": "Inhalt mit **Hervorhebungen** und [Quellen]"
    }
  ],
  "outlook": "Ausblick auf nächste Woche",
  "sign_off": "Abschlussgruss"
}`;

    const systemPrompt = `${layer1}\n\n${composeLayer2}\n\n${layer3}`;

    const draftResponse = await openrouter.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Hier sind die Informationseinheiten für den Newsletter:\n\n${formattedSelected}\nErstelle den Newsletter basierend auf diesen Informationen.` },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    let draft;
    try {
      draft = JSON.parse(draftResponse.choices[0].message.content);
    } catch {
      throw new Error('Failed to parse draft generation LLM response');
    }

    // Convert structured draft to markdown body
    let body_md = '';
    if (draft.greeting) body_md += `${draft.greeting}\n\n`;
    for (const section of draft.sections || []) {
      body_md += `## ${section.heading}\n\n${section.body}\n\n`;
    }
    if (draft.outlook) body_md += `## Ausblick\n\n${draft.outlook}\n\n`;
    if (draft.sign_off) body_md += `---\n\n${draft.sign_off}`;

    // --- 5. Save draft ---
    const { data: savedDraft, error: saveError } = await supabase
      .from('bajour_drafts')
      .insert({
        user_id,
        village_id,
        village_name,
        title: draft.title || `${village_name} — ${today}`,
        body: body_md.trim(),
        selected_unit_ids: selectedIds,
        publication_date: today,
        verification_status: 'ausstehend',
      })
      .select('id')
      .single();

    if (saveError) throw new Error(`Draft save failed: ${saveError.message}`);

    const draftId = savedDraft.id;

    // Mark units as used
    await supabase
      .from('information_units')
      .update({ used_in_article: true, used_at: new Date().toISOString() })
      .in('id', selectedIds);

    // --- 6. Send WhatsApp verification (non-fatal) ---
    let verificationSent = false;
    try {
      const correspondents = await getCorrespondentsForVillage(village_id);

      if (correspondents.length > 0) {
        const allMessageIds: string[] = [];

        const bodyParam = await truncateForTemplateParam(
          body_md.trim(),
          PUBLIC_APP_URL,
          draftId
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
                    { type: 'text', text: today },
                    { type: 'text', text: bodyParam },
                  ],
                },
              ],
            },
          });
          allMessageIds.push(templateResult.message_id);
        }

        // Update draft with verification metadata
        const now = new Date();
        const timeoutAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        await supabase
          .from('bajour_drafts')
          .update({
            verification_sent_at: now.toISOString(),
            verification_timeout_at: timeoutAt.toISOString(),
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

    console.log(`Auto-draft completed for ${village_id}: draft ${draftId}, units: ${selectedIds.length}, verification: ${verificationSent}`);

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

    // Update run log with failure
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
