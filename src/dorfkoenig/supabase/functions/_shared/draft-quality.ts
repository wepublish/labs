/**
 * @module draft-quality
 *
 * Scaffolding for the Dorfkönig draft quality overhaul (specs/DRAFT_QUALITY.md).
 *
 * Phase 0: palette, banlist, anti-pattern table. Validator implementations land in Phase 1.
 * Phase 1 adds: validateUrlWhitelist, validateForbiddenPhrases, validateEmojiPalette, validateKindCounts.
 */

/**
 * Closed emoji palette (§3.1.2). Approved 2026-04-22.
 * Expanded 2026-04-26: feedback rows 4–5 used emojis the editor reached for
 * naturally (events, food, weather, lifestyle, transport, animals) that the
 * original 16-glyph palette stripped. Keep additions semantically distinct;
 * validateEmojiPalette still strips anything not in this list.
 */
export const EMOJI_PALETTE = [
  // Original palette (approved 2026-04-22)
  '🏠', '🏗️', '🗳️', '🚗', '🚧', '📚', '🎶', '🌿',
  '⚖️', '🏢', '👤', '📍', '📅', '🐈', '⚠️', '✅',
  // 2026-04-26 expansion — events, lifestyle, weather, transport, food, fauna
  '🤿', '🏆', '👗', '🎂', '🎭', '🎨', '🎉', '🎁',
  '🌳', '🍴', '☕', '🌧️', '☀️', '🚲', '🚌', '🐾',
  // 2026-04-27 expansion — common civic/event symbols seen in regenerated drafts
  '💧', '🎵', '🚴', '💰', '🛠️', '🏭', '🏛️',
] as const;

export function isAllowedEmoji(emoji: string): boolean {
  return (EMOJI_PALETTE as readonly string[]).includes(emoji);
}

/**
 * Forbidden phrase banlist (§2.3). Post-validation (Phase 1) strips hits and
 * appends a warning to notes_for_editor. Does not fail the draft.
 */
export const FORBIDDEN_PHRASE_PATTERNS: readonly RegExp[] = [
  /Bis zur nächsten Ausgabe/i,
  /Ihre Redaktion/i,
  /Vielen Dank für Ihr Interesse/i,
  /Wochenüberblick/i,
  /^#+\s*Ausblick\b/im,
  /^Ausblick$/im,
  /weiter[en]* spannende(n)? Veranstaltungen/i,
  /Liebe Leserinnen und Leser/i,
];

export interface ForbiddenPhraseHit {
  pattern: RegExp;
  match: string;
  index: number;
}

export function findForbiddenPhrases(text: string): ForbiddenPhraseHit[] {
  const hits: ForbiddenPhraseHit[] = [];
  for (const pattern of FORBIDDEN_PHRASE_PATTERNS) {
    const m = text.match(pattern);
    if (m && m.index !== undefined) {
      hits.push({ pattern, match: m[0], index: m.index });
    }
  }
  return hits;
}

/**
 * Anti-pattern table (§2.4). Inlined in the compose prompt as labelled negatives.
 * Phase 1 adds real feedback examples; for Phase 0 this is the seed.
 */
export interface AntiPattern {
  bullet: string;
  reason: string;
}

export const ANTI_PATTERNS: readonly AntiPattern[] = [
  {
    bullet: '"Aus dem Gemeinderat: Der Gemeinderat ist wieder komplett [arlesheim.ch](https://arlesheim.ch/)"',
    reason: '6 Wochen alt, Link nur auf Hauptseite.',
  },
  {
    bullet: '"--- Bis zur nächsten Ausgabe — Ihre Redaktion"',
    reason: 'Verbotene Grussformel.',
  },
  {
    bullet: '"Ausblick: Nächste Woche erwarten uns weitere spannende Veranstaltungen"',
    reason: 'Generischer Ausblick ohne Substanz.',
  },
  {
    bullet: '"[arlesheim.ch](https://arlesheim.ch/)(https://www.arlesheim.ch/de/veranstaltungen/)"',
    reason: 'Doppelter Link — genau ein Markdown-Link pro Bullet.',
  },
  {
    bullet: '"Blick über die Gemeindegrenze: Die Spitex Münchenstein wird angeklagt [bzbasel.ch](...)"',
    reason: 'Nachbargemeinde als eigenständige Meldung ist nicht vorgesehen.',
  },
];

/**
 * Positive seed examples (§3.7.4). Used by the compose prompt as labelled positives.
 * Derived from the gold briefings in Feedback Dorfkönig.md.
 * Village-agnostic; per-village examples live in bajour_feedback_examples (capture-only in this scope).
 */
export interface PositiveSeed {
  bullet: string;
  source_domain: string;
}

export const AGNOSTIC_POSITIVE_SEEDS: readonly PositiveSeed[] = [
  {
    bullet:
      '🏠 Die Villa Kaelin, erbaut 1930 von einem Schüler Rudolf Steiners, darf abgerissen werden, wie die [bz Basel](https://www.bzbasel.ch/basel/baselland/trotz-historischem-wert-gericht-gibt-gruenes-licht-fuer-abriss-in-arlesheim-ld.4135667) berichtet.',
    source_domain: 'bz Basel',
  },
  {
    bullet:
      '🏗️ Die Bauarbeiten am Kindergarten «Im Lee» liegen gut im Zeitplan, [meldet die Gemeinde](https://www.arlesheim.ch/de/aktuelles/aktuelle_meldungen/Aktuelles-zum-Kindergarten-Im-Lee.php).',
    source_domain: 'Gemeinde Arlesheim',
  },
  {
    bullet:
      '🚧 Heute beginnen erste Vorarbeiten für den Belageinbau am Bärenbrunnenweg, [wie die Gemeinde mitteilt](https://www.arlesheim.ch/de/aktuelles/baustelleninfo/Bauinfo-03-Baerenbrunnenweg-2026.pdf).',
    source_domain: 'Gemeinde Arlesheim',
  },
  {
    bullet:
      '🏢 Straumann eröffnet im Mai den neuen Hauptsitz beim Bahnhof Dornach-Arlesheim; bis zu 300 Personen sollen dort arbeiten, schreibt die [bz Basel](https://www.bzbasel.ch/basel/baselland/straumann-neuer-hauptsitz-am-bahnhof-dornach-arlesheim-ld.4136413).',
    source_domain: 'bz Basel',
  },
  {
    bullet:
      '📚 In der Bibliothek findet heute die Gschichtezyt für Kinder bis fünf Jahre statt, [meldet die Gemeinde](https://www.arlesheim.ch/de/aktuelles/veranstaltungen/detail.php?i=1).',
    source_domain: 'Gemeinde Arlesheim',
  },
  {
    bullet:
      '🎭 Das Neue Theater sucht Freiwillige für Gastronomie und Veranstaltungsbetreuung, [wie die Gemeinde mitteilt](https://www.arlesheim.ch/de/aktuelles/aktuelle_meldungen/Neue-Theater-am-Bahnhof-sucht-Freiwillige.php).',
    source_domain: 'Gemeinde Arlesheim',
  },
  {
    bullet:
      '🤿 Wegen anhaltender Trockenheit bittet die Gemeinde, private Pools vorerst nicht zu füllen und Wasser sparsam zu nutzen.',
    source_domain: 'Gemeinde Arlesheim',
  },
  {
    bullet:
      '🎂 Die Gemeinde gratuliert mehreren Einwohnerinnen und Einwohnern zu hohen Geburtstagen, [meldet Arlesheim](https://www.arlesheim.ch/de/aktuelles/aktuelle_meldungen/Wir-gratulieren-im-April.php).',
    source_domain: 'Gemeinde Arlesheim',
  },
];

/**
 * Draft kind caps (§3.1). Enforced by validateKindCounts.
 */
export const KIND_CAPS = {
  lead: 1,
  secondary: 2,
  event: 2,
  good_news: 1,
} as const;

export type BulletKind = keyof typeof KIND_CAPS;

export const MAX_BULLETS_PER_DRAFT = 4;

// ──────────────────────────────────────────────────────────────────────
// Validators (§3.5) — deterministic repair, never regeneration.
// Each returns the (possibly mutated) draft + warnings to append to
// notes_for_editor. Validators never throw; on unrecoverable bullet state
// the bullet is dropped and a warning is logged.
// ──────────────────────────────────────────────────────────────────────

export interface Bullet {
  emoji: string;
  kind: BulletKind;
  text: string;
  article_url: string | null;
  source_domain: string | null;
  source_unit_ids: string[];
}

export interface DraftV2 {
  title: string;
  bullets: Bullet[];
  notes_for_editor: string[];
}

export interface ValidationResult {
  draft: DraftV2;
  warnings: string[];
}

/** Strip any Markdown link whose URL is not in the allowed set. */
export function validateUrlWhitelist(draft: DraftV2, allowedUrls: string[]): ValidationResult {
  const allow = new Set(allowedUrls.map(normaliseUrl));
  const warnings: string[] = [];
  const bullets: Bullet[] = [];

  for (let i = 0; i < draft.bullets.length; i++) {
    const b = draft.bullets[i];
    let text = b.text;
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_whole, label: string, url: string) => {
      if (allow.has(normaliseUrl(url))) return `[${label}](${url})`;
      warnings.push(`Link in Bullet ${i + 1} entfernt — nicht in Quellen (was: ${url})`);
      return label;
    });

    let article_url = b.article_url;
    if (article_url && !allow.has(normaliseUrl(article_url))) {
      warnings.push(`article_url in Bullet ${i + 1} entfernt — nicht in Quellen (was: ${article_url})`);
      article_url = null;
    }

    if (text.trim().length === 0) {
      warnings.push(`Bullet ${i + 1} entfernt — leer nach URL-Bereinigung`);
      continue;
    }

    bullets.push({ ...b, text, article_url });
  }

  return { draft: { ...draft, bullets }, warnings };
}

/** Replace forbidden-phrase hits with a marker; drop emptied bullets. */
export function validateForbiddenPhrases(draft: DraftV2): ValidationResult {
  const warnings: string[] = [];
  const bullets: Bullet[] = [];

  for (let i = 0; i < draft.bullets.length; i++) {
    const b = draft.bullets[i];
    let text = b.text;
    for (const pattern of FORBIDDEN_PHRASE_PATTERNS) {
      if (pattern.test(text)) {
        const m = text.match(pattern);
        warnings.push(`Füllsatz in Bullet ${i + 1} entfernt: "${m?.[0] ?? ''}"`);
        text = text.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
      }
    }

    if (text.length === 0) {
      warnings.push(`Bullet ${i + 1} entfernt — leer nach Filler-Entfernung`);
      continue;
    }

    bullets.push({ ...b, text });
  }

  return { draft: { ...draft, bullets }, warnings };
}

/** Strip emoji not in the approved palette. Bullet text survives. */
export function validateEmojiPalette(draft: DraftV2): ValidationResult {
  const warnings: string[] = [];
  const bullets = draft.bullets.map((b, i) => {
    if (isAllowedEmoji(b.emoji)) return b;
    warnings.push(`Emoji in Bullet ${i + 1} ersetzt (war "${b.emoji}", nicht in Palette)`);
    // Default fallback by kind — closer to the gold style than an empty string.
    const fallback: Record<BulletKind, string> = {
      lead: '📍',
      secondary: '📍',
      event: '📅',
      good_news: '✅',
    };
    return { ...b, emoji: fallback[b.kind] };
  });
  return { draft: { ...draft, bullets }, warnings };
}

/** Enforce per-kind caps and the overall MAX_BULLETS_PER_DRAFT ceiling. */
export function validateKindCounts(draft: DraftV2): ValidationResult {
  const warnings: string[] = [];
  const counts: Record<BulletKind, number> = { lead: 0, secondary: 0, event: 0, good_news: 0 };
  const bullets: Bullet[] = [];

  for (let i = 0; i < draft.bullets.length; i++) {
    const b = draft.bullets[i];

    // Overall cap
    if (bullets.length >= MAX_BULLETS_PER_DRAFT) {
      warnings.push(`Bullet ${i + 1} verworfen — Gesamtmaximum ${MAX_BULLETS_PER_DRAFT} erreicht`);
      continue;
    }

    let kind: BulletKind = b.kind;
    if (counts[kind] >= KIND_CAPS[kind]) {
      // Try to demote lead/event to secondary when there's room.
      if ((kind === 'lead' || kind === 'event') && counts.secondary < KIND_CAPS.secondary) {
        warnings.push(`Bullet ${i + 1} von "${kind}" zu "secondary" herabgestuft — Limit erreicht`);
        kind = 'secondary';
      } else {
        warnings.push(`Bullet ${i + 1} verworfen — "${kind}"-Limit (${KIND_CAPS[kind]}) erreicht`);
        continue;
      }
    }

    counts[kind]++;
    bullets.push({ ...b, kind });
  }

  return { draft: { ...draft, bullets }, warnings };
}

/**
 * Run all validators in the canonical order. Each stage's output feeds the next.
 * Warnings append to notes_for_editor so editors see them alongside the draft.
 */
export function runValidatorChain(draft: DraftV2, allowedUrls: string[]): DraftV2 {
  const allWarnings: string[] = [];
  let current = draft;

  for (const step of [
    (d: DraftV2) => validateUrlWhitelist(d, allowedUrls),
    validateForbiddenPhrases,
    validateEmojiPalette,
    validateKindCounts,
  ]) {
    const { draft: next, warnings } = step(current);
    current = next;
    allWarnings.push(...warnings);
  }

  return {
    ...current,
    notes_for_editor: [...current.notes_for_editor, ...allWarnings],
  };
}

function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.trim();
  }
}
