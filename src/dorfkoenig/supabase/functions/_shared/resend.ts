// Resend API client for email notifications

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_BASE_URL = 'https://api.resend.com';

interface SendEmailOptions {
  to: string;
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
  const { to, subject, html, from = 'coJournalist <noreply@resend.dev>' } = options;

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
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .header .subtitle {
      margin: 8px 0 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 24px;
    }
    .summary {
      font-size: 18px;
      color: #374151;
      margin-bottom: 24px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 4px solid #6366f1;
    }
    .findings {
      background: #fefefe;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .findings h3 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .findings ul {
      margin: 0;
      padding-left: 20px;
    }
    .findings li {
      margin-bottom: 8px;
      color: #374151;
    }
    .cta {
      display: inline-block;
      background: #6366f1;
      color: white;
      padding: 14px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
    }
    .cta:hover {
      background: #4f46e5;
    }
    .footer {
      padding: 24px;
      text-align: center;
      color: #9ca3af;
      font-size: 13px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Scout-Alarm</h1>
      <p class="subtitle">${scoutName}${locationLabel}</p>
    </div>
    <div class="content">
      <div class="summary">
        ${summary}
      </div>
      ${
        keyFindings.length > 0
          ? `
      <div class="findings">
        <h3>Kernpunkte</h3>
        <ul>
          ${keyFindings.map((f) => `<li>${f}</li>`).join('')}
        </ul>
      </div>
      `
          : ''
      }
      <a href="${sourceUrl}" class="cta">Quelle ansehen</a>
    </div>
    <div class="footer">
      <p>Diese E-Mail wurde automatisch von coJournalist-Lite gesendet.</p>
    </div>
  </div>
</body>
</html>`;
}

// Export as module
export const resend = {
  sendEmail,
  buildScoutAlertEmail,
};
