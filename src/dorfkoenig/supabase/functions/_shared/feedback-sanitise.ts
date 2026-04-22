/**
 * @module feedback-sanitise
 *
 * Sanitise captured bullets before they land in bajour_feedback_examples.
 * Rationale: captured bullets are raw LLM output that previously lived inside
 * a compose prompt. When we (eventually, per specs/followups/self-learning-system.md)
 * feed them back as few-shot examples, an adversarial payload could be persisted
 * per-village and influence every subsequent draft.
 *
 * Sanitisation runs at capture time even though the data is unused today —
 * cleaner to sanitise on write than retroactively sweep the backlog at activation.
 */

export interface SanitiseInput {
  bullet_text: string;
  article_url?: string | null;
  /** URLs that were cited by the compose pipeline from this draft's source units.
   *  Markdown link targets outside this list are stripped. */
  allowed_urls: string[];
}

export type SanitiseResult =
  | {
      ok: true;
      text: string;
      article_url: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 400;

/** Instruction-shaped strings we won't persist anywhere, even as "bad examples". */
const INSTRUCTION_MARKERS = [
  'ignoriere',
  'ignore previous',
  'ignore the above',
  'system:',
  'you are',
  'du bist',
  'assistant:',
  '<|',
  '|>',
  '[INST]',
  '[/INST]',
  '<<SYS>>',
  '<</SYS>>',
  // Few-shot boundary markers used in DRAFT_QUALITY.md §3.4.4 prompt blocks.
  '========== BEISPIELE-ANFANG',
  '========== BEISPIELE-ENDE',
];

const NON_LATIN_RUN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]{8,}/u;

/**
 * Sanitise a single bullet for persistence. Returns either a cleaned text+URL
 * (ok: true) or a rejection reason (ok: false). Callers are expected to drop
 * rejected bullets silently — the reason is for logging, not user feedback.
 */
export function sanitiseBulletForFeedback(input: SanitiseInput): SanitiseResult {
  let text = input.bullet_text ?? '';

  text = stripCodeFences(text);
  text = stripHtmlTags(text);
  text = stripMarkdownLinksExceptAllowlist(text, input.allowed_urls);
  text = text.trim();

  if (text.length < MIN_TEXT_LENGTH) {
    return { ok: false, reason: 'too_short' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH).trim();
  }

  const lower = text.toLowerCase();
  for (const marker of INSTRUCTION_MARKERS) {
    if (lower.includes(marker.toLowerCase())) {
      return { ok: false, reason: `instruction_marker:${marker}` };
    }
  }

  if (NON_LATIN_RUN.test(text)) {
    return { ok: false, reason: 'non_latin_run' };
  }

  const article_url = input.article_url && isUrlAllowed(input.article_url, input.allowed_urls)
    ? input.article_url
    : null;

  return { ok: true, text, article_url };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  // Triple backtick blocks (any fence marker) and inline code.
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '');
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^<>\n]{1,200}>/g, '');
}

function stripMarkdownLinksExceptAllowlist(text: string, allowed: string[]): string {
  const allowSet = new Set(allowed.map(normaliseUrl));
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label: string, url: string) => {
    return allowSet.has(normaliseUrl(url)) ? whole : label;
  });
}

function isUrlAllowed(url: string, allowed: string[]): boolean {
  const allowSet = new Set(allowed.map(normaliseUrl));
  return allowSet.has(normaliseUrl(url));
}

function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.trim();
  }
}
