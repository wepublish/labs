/**
 * @module compose-draft
 *
 * Pure LLM-compose step, extracted from `bajour-auto-draft/index.ts` so the benchmark
 * (specs/DRAFT_QUALITY.md §4) can exercise it without a database or WhatsApp.
 *
 * Two entry points:
 *   - composeDraftFromUnits     — v1 legacy schema (title/greeting/sections/outlook/sign_off)
 *   - composeDraftFromUnitsV2   — bullet-only schema (§3.1)
 *
 * Callers pick via feature flag (§3 rollback). Both preserve the scope cut:
 *   IN:  village info, pre-filtered units, prompt override
 *   OUT: parsed draft object (+ v1 also returns markdown body)
 *
 * Selection, save, mark-used, WhatsApp send stay in the edge function.
 */

import { openrouter } from './openrouter.ts';
import { COMPOSE_MODEL } from './constants.ts';
import {
  DRAFT_COMPOSE_PROMPT,
  DRAFT_COMPOSE_PROMPT_V2,
  buildDraftComposePromptV2,
  formatUnitsByType,
  formatUnitsForCompose,
} from './prompts.ts';
import {
  ANTI_PATTERNS,
  AGNOSTIC_POSITIVE_SEEDS,
  runValidatorChain,
  type Bullet,
  type DraftV2,
} from './draft-quality.ts';

export interface UnitForCompose {
  id?: string;
  statement: string;
  unit_type: string;
  source_domain: string;
  source_url: string;
  event_date?: string | null;
  created_at?: string | null;
  article_url?: string | null;
  is_listing_page?: boolean | null;
  quality_score?: number | null;
  sensitivity?: string | null;
  location?: { city?: string | null } | null;
}

export interface ComposeInput {
  village_id: string;
  village_name: string;
  /** Units to compose from — caller MUST pre-filter for village + quality. */
  selected_units: UnitForCompose[];
  /** compose_layer2 override — typically DRAFT_COMPOSE_PROMPT or a per-user override. */
  compose_layer2?: string;
  /** Override for testing; defaults to production model. */
  model?: string;
  /** Override for benchmark determinism; defaults to 0.2 (production). */
  temperature?: number;
  /** Max output tokens. */
  max_tokens?: number;
}

// ── v1 (legacy) ──────────────────────────────────────────────────────────

export interface ComposedDraftV1 {
  title?: string;
  greeting?: string;
  sections?: { heading: string; body: string }[];
  outlook?: string;
  sign_off?: string;
}

export interface ComposeResult {
  draft: ComposedDraftV1;
  body_md: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Pure compose (v1 schema): input units → LLM call → parsed draft + markdown.
 * No DB access. No WhatsApp. No side effects beyond the OpenRouter call.
 */
export async function composeDraftFromUnits(input: ComposeInput): Promise<ComposeResult> {
  const {
    village_id,
    village_name,
    selected_units,
    compose_layer2 = DRAFT_COMPOSE_PROMPT,
    model = COMPOSE_MODEL,
    temperature = 0.2,
    max_tokens = 2500,
  } = input;

  if (!village_id || !village_name) {
    throw new Error('village_id and village_name are required');
  }

  const formattedUnits = formatUnitsByType(selected_units, true);

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

  const systemPrompt = `${layer1}\n\n${compose_layer2}\n\n${layer3}`;

  const response = await openrouter.chat({
    ...(model && { model }),
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Hier sind die Informationseinheiten für den Newsletter:\n\n${formattedUnits}\n` +
          `Erstelle den Newsletter basierend auf diesen Informationen.`,
      },
    ],
    temperature,
    max_tokens,
    response_format: { type: 'json_object' },
  });

  let draft: ComposedDraftV1;
  try {
    draft = JSON.parse(response.choices[0].message.content) as ComposedDraftV1;
  } catch {
    throw new Error('Failed to parse draft generation LLM response');
  }

  const body_md = renderDraftToMarkdown(draft);

  return { draft, body_md, usage: response.usage };
}

/** Assemble v1 markdown body from parsed draft. Matches current renderer exactly. */
export function renderDraftToMarkdown(draft: ComposedDraftV1): string {
  let body = '';
  if (draft.greeting) body += `${draft.greeting}\n\n`;
  for (const section of draft.sections || []) {
    body += `## ${section.heading}\n\n${section.body}\n\n`;
  }
  if (draft.outlook) body += `## Ausblick\n\n${draft.outlook}\n\n`;
  if (draft.sign_off) body += `---\n\n${draft.sign_off}`;
  return body.trim();
}

// ── v2 (bullet-only, §3.1) ──────────────────────────────────────────────

export interface ComposeResultV2 {
  draft: DraftV2;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Pure compose (v2 bullet schema). Runs the deterministic post-validation chain
 * (§3.5) before returning — repairs never retry the LLM.
 *
 * `allowed_urls` is derived from the provided units so `validateUrlWhitelist` can
 * strip any URL the LLM invented outside the unit set.
 */
export async function composeDraftFromUnitsV2(input: ComposeInput): Promise<ComposeResultV2> {
  const {
    village_id,
    village_name,
    selected_units,
    compose_layer2,
    model = COMPOSE_MODEL,
    temperature = 0.2,
    max_tokens = 2500,
  } = input;

  if (!village_id || !village_name) {
    throw new Error('village_id and village_name are required');
  }

  const layer1 = `Du bist ein KI-Assistent für den Wochen-Newsletter der Gemeinde ${village_name}.
Schreibe AUSSCHLIESSLICH basierend auf den bereitgestellten Einheiten, AUSSCHLIESSLICH für ${village_name}.
ERFINDE nichts. Wenn etwas unsicher ist, gib "bullets": [] zurück statt zu spekulieren.`;

  const composePrompt = buildDraftComposePromptV2({
    composeLayer2: compose_layer2 ?? DRAFT_COMPOSE_PROMPT_V2,
    antiPatterns: ANTI_PATTERNS,
    positiveExamples: AGNOSTIC_POSITIVE_SEEDS,
  });

  const systemPrompt = `${layer1}\n\n${composePrompt}`;
  const formattedUnits = formatUnitsForCompose(selected_units);

  const response = await openrouter.chat({
    ...(model && { model }),
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Einheiten für ${village_name} (${new Date().toISOString().slice(0, 10)}):\n\n${formattedUnits}\n\n` +
          `Erstelle den Digest gemäss den Regeln.`,
      },
    ],
    temperature,
    max_tokens,
    response_format: { type: 'json_object' },
  });

  let raw: unknown;
  try {
    raw = JSON.parse(response.choices[0].message.content);
  } catch {
    throw new Error('Failed to parse compose LLM response (v2)');
  }

  const draft = normaliseDraftV2(raw, village_name);
  const allowedUrls = collectAllowedUrls(selected_units);
  const validated = runValidatorChain(draft, allowedUrls);

  return { draft: validated, usage: response.usage };
}

/** Coerce untrusted LLM output into a DraftV2 with safe defaults. */
function normaliseDraftV2(raw: unknown, village_name: string): DraftV2 {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawBullets = Array.isArray(r.bullets) ? r.bullets : [];
  const bullets: Bullet[] = rawBullets
    .map((b): Bullet | null => {
      const row = (b ?? {}) as Record<string, unknown>;
      const text = typeof row.text === 'string' ? row.text.trim() : '';
      if (!text) return null;
      const rawKind = typeof row.kind === 'string' ? row.kind : 'secondary';
      const kind: Bullet['kind'] = (['lead', 'secondary', 'event', 'good_news'] as const)
        .includes(rawKind as Bullet['kind'])
        ? (rawKind as Bullet['kind'])
        : 'secondary';
      return {
        emoji: typeof row.emoji === 'string' && row.emoji.length > 0 ? row.emoji : '📍',
        kind,
        text,
        article_url: typeof row.article_url === 'string' ? row.article_url : null,
        source_domain: typeof row.source_domain === 'string' ? row.source_domain : null,
        source_unit_ids: Array.isArray(row.source_unit_ids)
          ? row.source_unit_ids.filter((x): x is string => typeof x === 'string')
          : [],
      };
    })
    .filter((b): b is Bullet => b !== null);

  const notes = Array.isArray(r.notes_for_editor)
    ? r.notes_for_editor.filter((n): n is string => typeof n === 'string')
    : [];

  return {
    title:
      typeof r.title === 'string' && r.title.length > 0
        ? r.title
        : `${village_name} — ${new Date().toISOString().slice(0, 10)}`,
    bullets,
    notes_for_editor: notes,
  };
}

function collectAllowedUrls(units: UnitForCompose[]): string[] {
  const urls: string[] = [];
  for (const u of units) {
    if (u.source_url) urls.push(u.source_url);
    if (u.article_url) urls.push(u.article_url);
  }
  return urls;
}

/** Render a v2 DraftV2 to Markdown for backward-compat body column. */
export function renderDraftV2ToMarkdown(draft: DraftV2): string {
  if (draft.bullets.length === 0) {
    const note = draft.notes_for_editor.join(' — ');
    return note ? `_Heute keine Meldungen — ${note}_` : '';
  }
  const lines = draft.bullets.map((b) => `- ${b.emoji} ${b.text}`);
  return lines.join('\n\n');
}
