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
  EMOJI_PALETTE,
  runValidatorChain,
  type AntiPattern,
  type Bullet,
  type DraftV2,
  type PositiveSeed,
} from './draft-quality.ts';
import { isArticleLevelUrl } from './source-url.ts';

export interface UnitForCompose {
  id?: string;
  statement: string;
  unit_type: string;
  source_domain: string;
  source_url: string;
  event_date?: string | null;
  publication_date?: string | null;
  created_at?: string | null;
  article_url?: string | null;
  is_listing_page?: boolean | null;
  quality_score?: number | null;
  sensitivity?: string | null;
  location?: { city?: string | null } | null;
  source_citation?: {
    publication?: string | null;
    issue_date?: string | null;
    issue_label?: string | null;
    page?: string | null;
    article_title?: string | null;
    section?: string | null;
    citation_label?: string | null;
  } | null;
}

export interface ComposeInput {
  village_id: string;
  village_name: string;
  /** Units to compose from — caller MUST pre-filter for village + quality. */
  selected_units: UnitForCompose[];
  /** compose_layer2 override — typically DRAFT_COMPOSE_PROMPT or a per-user override. */
  compose_layer2?: string;
  /** Optional retrieved examples; when omitted, static defaults are used. */
  antiPatterns?: readonly AntiPattern[];
  positiveExamples?: readonly PositiveSeed[];
  /** Override for testing; defaults to production model. */
  model?: string;
  /** Override for benchmark determinism; defaults to 0.2 (production). */
  temperature?: number;
  /** Max output tokens. */
  max_tokens?: number;
  /** Optional diagnostic context — surfaces in parse-failure logs + thrown error. */
  ctx?: { village_id?: string; run_id?: string | number };
  /** ISO date the draft is being composed on (Zurich today). Drives date framing. */
  currentDate?: string;
  /** ISO date the draft will be published (typically currentDate + 1). */
  publicationDate?: string;
}

/**
 * Tolerant JSON extractor for text-mode LLM responses. Fallback only — the
 * happy path for v2 is Anthropic tool_use via OpenRouter (see SUBMIT_DIGEST_TOOL),
 * which returns a schema-validated JSON arguments blob and never falls into
 * this parser. Kept for the v1 path and for providers that ignore tool_choice.
 */
export function parseLlmJson(
  content: string,
  variant: 'v1' | 'v2',
  ctx?: { village_id?: string; run_id?: string | number },
): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      // fall through
    }
  }
  const preview = content.slice(0, 300).replace(/\s+/g, ' ');
  console.error(
    `compose ${variant} parse failed` +
      (ctx?.village_id ? ` village=${ctx.village_id}` : '') +
      (ctx?.run_id != null ? ` run=${ctx.run_id}` : '') +
      `; raw (2k):`,
    content.slice(0, 2000),
  );
  const legacy =
    variant === 'v2'
      ? 'Failed to parse compose LLM response (v2)'
      : 'Failed to parse draft generation LLM response';
  throw new Error(`${legacy} [len=${content.length}] ${preview}`);
}

/**
 * Tool schema for v2 compose. Claude (via OpenRouter) is forced to invoke this
 * tool instead of free-form text, guaranteeing well-formed JSON arguments.
 * The schema mirrors DraftV2 from draft-quality.ts — keep in sync.
 */
const SUBMIT_DIGEST_TOOL: import('./openrouter.ts').ChatTool = {
  type: 'function',
  function: {
    name: 'submit_digest',
    description:
      'Submit the weekly village digest. Call this exactly once with the final draft.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'bullets', 'notes_for_editor'],
      properties: {
        title: { type: 'string', description: 'Wochentitel für die Gemeinde.' },
        bullets: {
          type: 'array',
          description: 'Bullets des Digests (max. 4).',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['emoji', 'kind', 'text', 'article_url', 'source_domain', 'source_unit_ids'],
            properties: {
              emoji: { type: 'string' },
              kind: {
                type: 'string',
                enum: ['lead', 'secondary', 'event', 'good_news'],
              },
              text: { type: 'string' },
              article_url: { type: ['string', 'null'] },
              source_domain: { type: ['string', 'null'] },
              source_unit_ids: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
        notes_for_editor: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },
};

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
    ctx,
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

  const draft = parseLlmJson(
    response.choices[0].message.content ?? '',
    'v1',
    ctx,
  ) as ComposedDraftV1;

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
    antiPatterns,
    positiveExamples,
    model = COMPOSE_MODEL,
    temperature = 0.2,
    max_tokens = 2500,
    ctx,
    currentDate,
    publicationDate,
  } = input;

  if (!village_id || !village_name) {
    throw new Error('village_id and village_name are required');
  }

  const layer1 = `Du bist ein KI-Assistent für den Wochen-Newsletter der Gemeinde ${village_name}.
Schreibe AUSSCHLIESSLICH basierend auf den bereitgestellten Einheiten, AUSSCHLIESSLICH für ${village_name}.
ERFINDE nichts. Wenn etwas unsicher ist, gib "bullets": [] zurück statt zu spekulieren.`;

  const composePrompt = buildDraftComposePromptV2({
    composeLayer2: compose_layer2 ?? DRAFT_COMPOSE_PROMPT_V2,
    antiPatterns: antiPatterns ?? ANTI_PATTERNS,
    positiveExamples: positiveExamples ?? AGNOSTIC_POSITIVE_SEEDS,
    currentDate,
    publicationDate,
  });

  const systemPrompt = `${layer1}\n\n${composePrompt}`;
  const formattedUnits = formatUnitsForCompose(selected_units);
  const userDateLabel = publicationDate ?? currentDate ?? new Date().toISOString().slice(0, 10);

  const response = await openrouter.chat({
    ...(model && { model }),
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Einheiten für ${village_name} (Erscheinung: ${userDateLabel}):\n\n${formattedUnits}\n\n` +
          `Erstelle den Digest gemäss den Regeln und rufe das Tool "submit_digest" mit dem Ergebnis auf.`,
      },
    ],
    temperature,
    max_tokens,
    tools: [SUBMIT_DIGEST_TOOL],
    tool_choice: { type: 'function', function: { name: 'submit_digest' } },
  });

  // Happy path: Claude/OpenRouter returns a tool_call whose `arguments` are
  // a JSON string already validated against the tool schema.
  const toolCall = response.choices[0].message.tool_calls?.find(
    (c) => c.function?.name === 'submit_digest',
  );
  let raw: unknown;
  if (toolCall) {
    try {
      raw = JSON.parse(toolCall.function.arguments);
    } catch {
      // extremely rare — OpenRouter handed us malformed tool arguments. Try the
      // tolerant parser so we at least salvage partial output.
      raw = parseLlmJson(toolCall.function.arguments, 'v2', ctx);
    }
  } else {
    // Fallback: some providers ignore tool_choice and emit text content.
    raw = parseLlmJson(response.choices[0].message.content ?? '', 'v2', ctx);
  }

  const draft = normaliseDraftV2(raw, village_name);
  const allowedUrls = collectAllowedUrls(selected_units);
  const repaired = repairMissingSourceLinks(draft, selected_units);
  let validated = runValidatorChain(repaired, allowedUrls);
  if (validated.bullets.length === 0) {
    validated = buildFallbackDraftV2({
      villageName: village_name,
      selectedUnits: selected_units,
      allowedUrls,
      publicationDate,
      existingNotes: draft.notes_for_editor,
    });
  }

  return { draft: validated, usage: response.usage };
}

function buildFallbackDraftV2(args: {
  villageName: string;
  selectedUnits: UnitForCompose[];
  allowedUrls: string[];
  publicationDate?: string;
  existingNotes: string[];
}): DraftV2 {
  const bullets: Bullet[] = [];
  const seenStories: UnitForCompose[] = [];

  for (const unit of args.selectedUnits) {
    if (bullets.length >= 3) break;
    if (!isFallbackBulletUnit(unit)) continue;
    if (seenStories.some((seen) => sameFallbackStory(seen.statement, unit.statement))) continue;

    const url = unit.article_url && !unit.is_listing_page && isArticleLevelUrl(unit.article_url)
      ? unit.article_url
      : null;
    const domain = unit.source_domain || 'Quelle';
    const text = fallbackBulletText(unit, domain, url);
    if (!text) continue;

    bullets.push({
      emoji: fallbackEmoji(unit),
      kind: unit.unit_type === 'event' ? 'event' : 'secondary',
      text,
      article_url: url,
      source_domain: domain,
      source_unit_ids: unit.id ? [unit.id] : [],
    });
    seenStories.push(unit);
  }

  const draft: DraftV2 = {
    title: `${args.villageName} — ${args.publicationDate ?? new Date().toISOString().slice(0, 10)}`,
    bullets,
    notes_for_editor: [
      ...args.existingNotes,
      ...(bullets.length > 0
        ? ['Fallback: Modell lieferte keine Bullets; deterministisch aus ausgewählten Einheiten erstellt.']
        : []),
    ],
  };
  return runValidatorChain(draft, args.allowedUrls);
}

function isFallbackBulletUnit(unit: UnitForCompose): boolean {
  if (!unit.id || !unit.statement.trim()) return false;
  if ((unit.quality_score ?? 0) < 40) return false;
  if (unit.sensitivity && unit.sensitivity !== 'none') return false;
  if (unit.unit_type === 'event') {
    return Boolean(unit.event_date || unit.article_url);
  }
  return hasCivicOrServiceSignal(unit.statement) || Boolean(unit.article_url);
}

function fallbackBulletText(unit: UnitForCompose, domain: string, url: string | null): string {
  const statement = trimTrailingPunctuation(unit.statement);
  if (!statement) return '';
  if (!url) return statement + '.';
  return `${statement}, wie [${domain}](${url}) meldet.`;
}

function fallbackEmoji(unit: UnitForCompose): string {
  const text = unit.statement.toLocaleLowerCase('de-CH');
  if (/\b(sperrung|vollsperrung|baustelle|bauarbeiten|strasse|weg|verkehr)\b/i.test(text)) return '🚧';
  if (/\b(gemeinderat|landrat|verwaltung|wahl|kommission|behörde|nationalrat)\b/i.test(text)) return '🏛️';
  if (unit.unit_type === 'event') return '📅';
  return (EMOJI_PALETTE as readonly string[]).includes('📍') ? '📍' : '🏠';
}

function hasCivicOrServiceSignal(statement: string): boolean {
  return /\b(gemeinderat|einwohnerrat|landrat|abstimmung|initiative|budget|planung|verwaltung|kehricht|wahl|nationalrat|behörde|kommission|baugesuch|sperrung|strasse|weg|schule|kindergarten)\b/i
    .test(statement);
}

function sameFallbackStory(a: string, b: string): boolean {
  const left = new Set(fallbackTokens(a));
  const right = fallbackTokens(b);
  const overlap = right.filter((token) => left.has(token)).length;
  return overlap >= 2;
}

function fallbackTokens(value: string): string[] {
  const generic = new Set([
    'findet', 'statt', 'gemeinde', 'montag', 'dienstag', 'mittwoch',
    'donnerstag', 'freitag', 'samstag', 'sonntag', 'wurde', 'wird',
    'erstmalig', 'heute', 'morgen', 'april',
  ]);
  return value
    .toLocaleLowerCase('de-CH')
    .replace(/\b\d{1,2}\.?\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .split(/[^a-z0-9äöüß]+/i)
    .filter((token) => token.length >= 5 && !generic.has(token));
}

/**
 * The model sometimes cites `source_unit_ids` but leaves `article_url` empty.
 * Repair that deterministically from the selected units so downstream quality
 * gates and renderers keep the source trace instead of withholding a good item.
 */
function repairMissingSourceLinks(draft: DraftV2, units: UnitForCompose[]): DraftV2 {
  const unitsById = new Map(units.filter((u) => u.id).map((u) => [u.id as string, u]));
  const bullets = draft.bullets.map((bullet) => {
    if (bullet.article_url || bullet.text.includes('](')) return bullet;

    const sourceUnits = bullet.source_unit_ids
      .map((id) => unitsById.get(id))
      .filter((unit): unit is UnitForCompose => Boolean(unit));
    const citedUnit = sourceUnits.find((unit) =>
      unit.article_url && !unit.is_listing_page && isArticleLevelUrl(unit.article_url)
    );
    if (!citedUnit?.article_url) return bullet;

    const domain = bullet.source_domain || citedUnit.source_domain || 'Quelle';
    return {
      ...bullet,
      text: `${trimTrailingPunctuation(bullet.text)}, wie [${domain}](${citedUnit.article_url}) meldet.`,
      article_url: citedUnit.article_url,
      source_domain: domain,
    };
  });

  return { ...draft, bullets };
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

function trimTrailingPunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/u, '');
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
