import type { BajourDraft, VerificationStatus } from './types';

/**
 * Optimistic display status: if timeout has passed and still ausstehend,
 * show as bestätigt while waiting for server-side resolution.
 */
export function displayStatus(draft: BajourDraft): VerificationStatus {
  if (
    draft.verification_status === 'ausstehend' &&
    draft.verification_timeout_at &&
    new Date(draft.verification_timeout_at).getTime() < Date.now()
  ) {
    return 'bestätigt';
  }
  return draft.verification_status;
}

/**
 * Escape HTML then convert a limited markdown subset to safe HTML.
 * Handles: ## headings, **bold**, and [source] references.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape HTML then convert inline markdown (**bold**, [source]) to safe HTML.
 */
export function processInlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]/g, '<span class="source-ref">[$1]</span>');
  return html;
}

/**
 * Render a markdown body string (as stored in the database) into HTML.
 * Converts ## headings, **bold**, [source] refs, and paragraph breaks.
 */
export function renderMarkdownBody(body: string): string {
  const lines = body.split('\n');
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      parts.push('');
      continue;
    }

    const headingMatch = trimmed.match(/^##\s+(.+)$/);
    if (headingMatch) {
      parts.push(`<h3>${escapeHtml(headingMatch[1])}</h3>`);
    } else {
      parts.push(`<p>${processInlineMarkdown(trimmed)}</p>`);
    }
  }

  return parts.filter(Boolean).join('\n');
}
