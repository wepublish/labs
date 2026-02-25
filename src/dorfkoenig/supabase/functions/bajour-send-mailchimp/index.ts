// Bajour Send to Mailchimp Edge Function
// Aggregates all verified (bestätigt) drafts and creates a Mailchimp campaign
// from the "Dorfkönig-Basis" template.

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import mailchimp from 'npm:@mailchimp/mailchimp_marketing@3.0.80';
import * as cheerio from 'npm:cheerio@1.0.0';

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

    // 4. Load the template campaign's HTML content
    const templateContent = await mailchimp.campaigns.getContent(templateCampaign.id);
    const templateHtml = templateContent.html;

    if (!templateHtml) {
      return errorResponse('Template-HTML nicht gefunden', 500, 'TEMPLATE_HTML_MISSING');
    }

    // 5. Build a map of village_id → draft body (use most recent per village)
    const villageDrafts = new Map<string, string>();
    for (const draft of drafts) {
      if (!villageDrafts.has(draft.village_id)) {
        villageDrafts.set(draft.village_id, draft.body);
      }
    }

    // 6. Replace text:{key} placeholders with draft content using cheerio
    const $ = cheerio.load(templateHtml);
    let replacedCount = 0;

    $('p').each(function () {
      const el = $(this);
      const text = el.text().trim();
      const match = text.match(/^text:(\w+)$/);
      if (match) {
        const villageId = match[1];
        const content = villageDrafts.get(villageId);
        if (content) {
          // Replace placeholder with draft content (convert newlines to <br>)
          el.html(content.replace(/\n/g, '<br>'));
          replacedCount++;
        } else {
          el.text('Heute leider keine News für dieses Dorf :(');
        }
      }
    });

    const modifiedHtml = $.html();

    // 7. Build today's campaign title
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const campaignTitle = `${TEMPLATE_CAMPAIGN_NAME} - ${today}`;

    // 8. Delete existing same-day campaign if it exists
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

    // 9. Create new campaign copying settings from template
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

    // 10. Set the modified HTML as campaign content
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
