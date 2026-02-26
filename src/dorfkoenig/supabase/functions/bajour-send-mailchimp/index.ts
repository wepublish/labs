// Bajour Send to Mailchimp Edge Function
// Aggregates all verified (bestätigt) drafts and creates a Mailchimp campaign
// from the "Dorfkönig-Basis" template.

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import mailchimp from 'npm:@mailchimp/mailchimp_marketing@3.0.80';
import { TEMPLATE_HTML } from './template.ts';

const MAILCHIMP_API_KEY = Deno.env.get('MAILCHIMP_API_KEY')!;
const MAILCHIMP_SERVER = Deno.env.get('MAILCHIMP_SERVER')!;
const TEMPLATE_CAMPAIGN_NAME = 'Dorfkönig-Basis';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const supabase = createServiceClient();

    // 1. Fetch all verified drafts for this user
    const { data: drafts, error: draftsError } = await supabase
      .from('bajour_drafts')
      .select('*')
      .eq('user_id', userId)
      .eq('verification_status', 'bestätigt')
      .order('created_at', { ascending: false });

    if (draftsError) {
      console.error('Fetch drafts error:', draftsError);
      return errorResponse('Fehler beim Laden der Entwürfe', 500);
    }

    if (!drafts || drafts.length === 0) {
      return errorResponse('Keine bestätigten Entwürfe vorhanden', 400, 'NO_VERIFIED_DRAFTS');
    }

    // 2. Configure Mailchimp
    mailchimp.setConfig({
      apiKey: MAILCHIMP_API_KEY,
      server: MAILCHIMP_SERVER,
    });

    // 3. Find the template campaign "Dorfkönig-Basis"
    const campaignsResponse = await mailchimp.campaigns.list({
      count: 100,
      sort_field: 'create_time',
      sort_dir: 'DESC',
    });

    const templateCampaign = campaignsResponse.campaigns?.find(
      (c: { settings?: { title?: string } }) => c.settings?.title === TEMPLATE_CAMPAIGN_NAME
    );

    if (!templateCampaign) {
      return errorResponse(
        `Template-Kampagne "${TEMPLATE_CAMPAIGN_NAME}" nicht gefunden`,
        404,
        'TEMPLATE_NOT_FOUND'
      );
    }

    // 4. Use embedded template HTML (getContent returns degraded 7k HTML, see docs/MAILCHIMP.md)
    const templateHtml = TEMPLATE_HTML;

    // 5. Build a map of village_id → draft (use most recent per village)
    const villageDrafts = new Map<string, { village_name: string; body: string }>();
    for (const draft of drafts) {
      if (!villageDrafts.has(draft.village_id)) {
        villageDrafts.set(draft.village_id, {
          village_name: draft.village_name,
          body: draft.body,
        });
      }
    }

    // 6. Build combined village HTML from all drafts
    const villageContentParts: string[] = [];
    for (const [, { village_name, body }] of villageDrafts) {
      const bodyHtml = body.replace(/\n/g, '<br>');
      villageContentParts.push(`<strong>${village_name}</strong><br>${bodyHtml}`);
    }
    const combinedContent = villageContentParts.join('<br><br>');

    // 7. Replace text:{key} placeholders with combined village content via regex
    // First placeholder gets all village content, remaining placeholders are cleared.
    // This decouples the function from which specific placeholder IDs exist in the template.
    let isFirstPlaceholder = true;
    const modifiedHtml = templateHtml.replace(/text:\w+/g, () => {
      if (isFirstPlaceholder) {
        isFirstPlaceholder = false;
        return combinedContent;
      }
      return '';
    });

    const replacedCount = villageDrafts.size;

    // 8. Build today's campaign title
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const campaignTitle = `${TEMPLATE_CAMPAIGN_NAME} - ${today}`;

    // 9. Delete existing same-day campaign if it exists
    const existingCampaigns = await mailchimp.campaigns.list({
      count: 100,
      sort_field: 'create_time',
      sort_dir: 'DESC',
    });

    for (const c of existingCampaigns.campaigns || []) {
      if (c.settings?.title === campaignTitle && c.id !== templateCampaign.id) {
        try {
          await mailchimp.campaigns.remove(c.id);
          console.log(`Deleted existing campaign: ${c.id}`);
        } catch (delErr) {
          console.warn(`Could not delete campaign ${c.id}:`, delErr);
        }
      }
    }

    // 10. Create new campaign copying settings from template
    const newCampaign = await mailchimp.campaigns.create({
      type: 'regular',
      recipients: {
        list_id: templateCampaign.recipients?.list_id || '851436c80e',
      },
      settings: {
        subject_line: templateCampaign.settings?.subject_line || `Dorfkönig Newsletter - ${today}`,
        from_name: templateCampaign.settings?.from_name || 'Bajour',
        reply_to: templateCampaign.settings?.reply_to || 'redaktion@bajour.ch',
        title: campaignTitle,
      },
    });

    // 11. Set the modified HTML as campaign content
    await mailchimp.campaigns.setContent(newCampaign.id, {
      html: modifiedHtml,
    });

    console.log(`Created Mailchimp campaign ${newCampaign.id} with ${replacedCount} villages`);

    return jsonResponse({
      data: {
        campaign_id: newCampaign.id,
        village_count: replacedCount,
      },
    });
  } catch (error) {
    console.error('bajour-send-mailchimp error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message || 'Interner Fehler', 500);
  }
});
