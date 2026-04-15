// Resend API client for email notifications

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_BASE_URL = 'https://api.resend.com';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const { to, subject, html, from = 'Dorfkönig <noreply@labs.wepublish.cloud>' } = options;

  try {
    const response = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.message || `Resend API error: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      id: data.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Escape HTML special characters to prevent XSS in email templates
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sanitize a URL for safe use in href attributes.
 * Only allows http/https protocols to prevent javascript: and data: injection.
 * Also escapes HTML entities to prevent attribute breakout.
 */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '#';
    }
  } catch {
    return '#';
  }
  return escapeHtml(trimmed);
}

/**
 * Build scout alert email HTML
 */
export function buildScoutAlertEmail(params: {
  scoutName: string;
  summary: string;
  keyFindings: string[];
  sourceUrl: string;
  locationCity?: string;
}): string {
  const { scoutName, summary, keyFindings, sourceUrl, locationCity } = params;
  const locationLabel = locationCity ? ` (${locationCity})` : '';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1c1917;
      margin: 0;
      padding: 0;
      background-color: #fafaf9;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    .header {
      background: #ea726e;
      color: white;
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-family: 'Crimson Pro', Georgia, serif;
      font-size: 24px;
      font-weight: 600;
    }
    .header .subtitle {
      margin: 8px 0 0;
      font-family: 'DM Sans', -apple-system, sans-serif;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 24px;
    }
    .summary {
      font-size: 18px;
      color: #1c1917;
      margin-bottom: 24px;
      padding: 16px;
      background: #fafaf9;
      border-radius: 8px;
      border-left: 4px solid #ea726e;
    }
    .findings {
      background: #fefefe;
      border: 1px solid #e7e5e4;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .findings h3 {
      margin: 0 0 12px;
      font-family: 'Crimson Pro', Georgia, serif;
      font-size: 14px;
      font-weight: 600;
      color: #57534e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .findings ul {
      margin: 0;
      padding-left: 20px;
    }
    .findings li {
      margin-bottom: 8px;
      color: #1c1917;
    }
    .cta {
      display: inline-block;
      background: #ea726e;
      color: white;
      padding: 14px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
    }
    .cta:hover {
      background: #d45a56;
    }
    .footer {
      padding: 24px;
      text-align: center;
      color: #a8a29e;
      font-size: 13px;
      border-top: 1px solid #e7e5e4;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Scout-Alarm</h1>
      <p class="subtitle">${escapeHtml(scoutName)}${escapeHtml(locationLabel)}</p>
    </div>
    <div class="content">
      <div class="summary">
        ${escapeHtml(summary)}
      </div>
      ${
        keyFindings.length > 0
          ? `
      <div class="findings">
        <h3>Kernpunkte</h3>
        <ul>
          ${keyFindings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
      `
          : ''
      }
      <a href="${sanitizeUrl(sourceUrl)}" class="cta">Quelle ansehen</a>
    </div>
    <div class="footer">
      <p>Diese E-Mail wurde automatisch von Dorfkönig gesendet.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Build civic promise digest email HTML (German, accountability-framed).
 */
export function buildCivicPromiseDigestEmail(params: {
  scoutName: string;
  promises: { promise_text: string; due_date: string | null; source_url: string | null }[];
}): string {
  const { scoutName, promises } = params;

  const promiseRows = promises.map((p) => {
    const dueLabel = p.due_date ? `<strong>Frist:</strong> ${escapeHtml(p.due_date)}` : '';
    const sourceLink = p.source_url
      ? `<a href="${sanitizeUrl(p.source_url)}" style="color: #ea726e; text-decoration: none; font-size: 13px;">Quelldokument</a>`
      : '';
    return `
      <div style="padding: 12px 16px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin-bottom: 8px;">
        <p style="margin: 0 0 6px; font-size: 15px; color: #1c1917; font-weight: 500;">${escapeHtml(p.promise_text)}</p>
        <div style="display: flex; gap: 12px; font-size: 13px; color: #78716c;">
          ${dueLabel}${dueLabel && sourceLink ? ' · ' : ''}${sourceLink}
        </div>
      </div>`;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="font-family: 'DM Sans', -apple-system, sans-serif; line-height: 1.6; color: #1c1917; margin: 0; padding: 0; background-color: #fafaf9;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
    <div style="background: #d97706; color: white; padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; font-family: 'Crimson Pro', Georgia, serif; font-size: 22px; font-weight: 600;">Versprechen zur Überprüfung</h1>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">${escapeHtml(scoutName)}</p>
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 15px; color: #57534e; margin: 0 0 20px;">
        Die folgenden Versprechen nähern sich ihrer Frist. Prüfen Sie, ob sie eingehalten wurden.
      </p>
      ${promiseRows}
    </div>
    <div style="padding: 24px; text-align: center; color: #a8a29e; font-size: 13px; border-top: 1px solid #e7e5e4;">
      <p style="margin: 0;">Diese E-Mail wurde automatisch von Dorfkönig gesendet.</p>
    </div>
  </div>
</body>
</html>`;
}

interface PriorResponse {
  name: string;
  response: 'bestätigt' | 'abgelehnt';
}

/**
 * Build draft-rejection alert email (German).
 * Fires when any Bajour correspondent replies `abgelehnt` — the admin mailbox gets
 * a red-accented summary with the rejecter's name and a signed deep-link to the draft.
 */
export function buildDraftRejectionEmail(params: {
  draftTitle: string;
  villageName: string;
  correspondentName: string;
  respondedAt: string;
  draftUrl: string;
  priorResponses: PriorResponse[];
}): string {
  const { draftTitle, villageName, correspondentName, respondedAt, draftUrl, priorResponses } = params;

  const respondedAtLabel = (() => {
    try {
      return new Date(respondedAt).toLocaleString('de-CH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return respondedAt;
    }
  })();

  const priorRows = priorResponses.length
    ? `
      <div class="prior">
        <h3>Bisherige Rückmeldungen</h3>
        <ul>
          ${priorResponses
            .map(
              (r) =>
                `<li><strong>${escapeHtml(r.name)}</strong> — ${
                  r.response === 'abgelehnt' ? '❌ abgelehnt' : '✅ bestätigt'
                }</li>`
            )
            .join('')}
        </ul>
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1c1917; margin: 0; padding: 0; background-color: #fafaf9; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
    .header { background: #dc2626; color: white; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-family: 'Crimson Pro', Georgia, serif; font-size: 24px; font-weight: 600; }
    .header .subtitle { margin: 8px 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 24px; }
    .summary { font-size: 16px; color: #1c1917; margin-bottom: 20px; padding: 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626; }
    .summary strong { color: #991b1b; }
    .meta { background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; color: #57534e; }
    .meta-row { display: flex; gap: 8px; padding: 4px 0; }
    .meta-label { color: #78716c; min-width: 96px; }
    .prior { background: #fefefe; border: 1px solid #e7e5e4; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .prior h3 { margin: 0 0 10px; font-family: 'Crimson Pro', Georgia, serif; font-size: 14px; font-weight: 600; color: #57534e; text-transform: uppercase; letter-spacing: 0.5px; }
    .prior ul { margin: 0; padding-left: 20px; }
    .prior li { margin-bottom: 6px; color: #1c1917; }
    .cta { display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 16px; }
    .cta:hover { background: #991b1b; }
    .footer { padding: 24px; text-align: center; color: #a8a29e; font-size: 13px; border-top: 1px solid #e7e5e4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Entwurf abgelehnt</h1>
      <p class="subtitle">${escapeHtml(villageName)}</p>
    </div>
    <div class="content">
      <div class="summary">
        <strong>${escapeHtml(correspondentName)}</strong> hat den Entwurf abgelehnt.
      </div>
      <div class="meta">
        <div class="meta-row"><span class="meta-label">Titel:</span><span>${escapeHtml(draftTitle || '(ohne Titel)')}</span></div>
        <div class="meta-row"><span class="meta-label">Gemeinde:</span><span>${escapeHtml(villageName)}</span></div>
        <div class="meta-row"><span class="meta-label">Zeitpunkt:</span><span>${escapeHtml(respondedAtLabel)}</span></div>
      </div>
      ${priorRows}
      <p style="margin: 0 0 16px; color: #57534e; font-size: 14px;">
        Der Entwurf wurde automatisch auf <strong>abgelehnt</strong> gesetzt. Über den Link unten kannst du ihn direkt einsehen.
      </p>
      <a href="${sanitizeUrl(draftUrl)}" class="cta">Entwurf ansehen</a>
    </div>
    <div class="footer">
      <p>Diese E-Mail wurde automatisch von Dorfkönig gesendet.</p>
    </div>
  </div>
</body>
</html>`;
}

// Export as module
export const resend = {
  sendEmail,
  buildScoutAlertEmail,
  buildCivicPromiseDigestEmail,
  buildDraftRejectionEmail,
};
