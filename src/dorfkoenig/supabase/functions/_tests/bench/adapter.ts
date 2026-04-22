/**
 * Adapter layer: convert the pipeline's raw output to the bullet-shaped
 * `BenchOutput` the metrics expect.
 *
 * Phase 0 accepts the v1 schema (title/greeting/sections/outlook/sign_off + body_md)
 * and heuristically splits body_md into bullets for scoring. Phase 1 replaces this
 * with a direct pass-through once `composeDraftFromUnits` returns the new bullet schema.
 */

import type { BenchOutput } from './types.ts';

export interface V1Draft {
  title?: string;
  greeting?: string;
  sections?: { heading: string; body: string }[];
  outlook?: string;
  sign_off?: string;
}

const EMOJI_LEAD_RE = /^([\p{Emoji_Presentation}\p{Extended_Pictographic}](?:️)?)\s*/u;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Adapt v1 compose output to BenchOutput. The heuristics:
 *   - Concatenate greeting + sections' body into a single stream.
 *   - Split on blank lines + bullet markers (`- `, `* `, numbered list).
 *   - For each fragment ≥ 10 chars: treat as a bullet. Extract leading emoji + URLs.
 *   - Greeting/outlook/sign_off ALSO flow into body_text so the filler check catches them.
 */
export function adaptV1Draft(draft: V1Draft, bodyMd: string): BenchOutput {
  const sections: string[] = [];
  if (draft.greeting) sections.push(draft.greeting);
  for (const s of draft.sections ?? []) {
    sections.push(`${s.heading}\n${s.body}`);
  }
  if (draft.outlook) sections.push(`Ausblick\n${draft.outlook}`);
  if (draft.sign_off) sections.push(draft.sign_off);

  const flat = sections.join('\n\n');
  const bullets = extractBulletsFromMarkdown(flat);

  return {
    bullets,
    notes_for_editor: [],
    body_text: bodyMd,
  };
}

/** Adapt a direct bullet-shaped draft (Phase 1+). */
export function adaptBulletDraft(draft: {
  bullets?: Array<{
    emoji?: string;
    kind?: BenchOutput['bullets'][number]['kind'];
    text?: string;
    article_url?: string | null;
    source_unit_ids?: string[];
  }>;
  notes_for_editor?: string[];
}): BenchOutput {
  const bulletsIn = draft.bullets ?? [];
  const bullets = bulletsIn.map((b) => {
    const text = b.text ?? '';
    const link_urls = Array.from(text.matchAll(MARKDOWN_LINK_RE)).map((m) => m[2]);
    if (b.article_url && !link_urls.includes(b.article_url)) link_urls.push(b.article_url);
    return {
      emoji: b.emoji ?? null,
      kind: b.kind ?? null,
      text,
      link_urls,
      source_unit_ids: b.source_unit_ids ?? [],
    };
  });

  const bodyText = bullets.map((b) => `${b.emoji ?? ''} ${b.text}`).join('\n\n');

  return {
    bullets,
    notes_for_editor: draft.notes_for_editor ?? [],
    body_text: bodyText,
  };
}

function extractBulletsFromMarkdown(markdown: string): BenchOutput['bullets'] {
  // Split on blank lines or list-marker lines
  const chunks = markdown
    .split(/\n(?=\s*(?:[-*]\s|\d+\.\s|#{1,3}\s|$))/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 10)
    // Drop pure-heading chunks
    .filter((c) => !/^#{1,3}\s/.test(c));

  return chunks.map((chunk) => {
    // Strip leading list marker
    const cleaned = chunk.replace(/^\s*(?:[-*]\s+|\d+\.\s+)/, '');
    const emojiMatch = cleaned.match(EMOJI_LEAD_RE);
    const emoji = emojiMatch ? emojiMatch[1] : null;
    const text = emojiMatch ? cleaned.slice(emojiMatch[0].length) : cleaned;
    const link_urls = Array.from(cleaned.matchAll(MARKDOWN_LINK_RE)).map((m) => m[2]);
    return {
      emoji,
      kind: null,
      text,
      link_urls,
      source_unit_ids: [],
    };
  });
}
