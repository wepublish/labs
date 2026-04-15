/**
 * Deterministic Gemeinde matcher — Swiss German / German.
 *
 * Why not `\bName\b`: JS `\b` is ASCII-only even with /u, so `\bMünchenstein\b`
 * fires inside `Obermünchensteinstrasse`, and substrings like `Reinacher`,
 * `Reinachs`, `Reinachstrasse` all pass. Intl.Segmenter with de-CH locale
 * gives us correct word boundaries for umlauts and hyphenated compounds.
 *
 * Two guards on top of exact-token match:
 *   - Declension/compound suffix: reject if next token is `er|erin|ern|s|strasse|…`
 *     (catches `Reinach-Strasse`, `Reinacher-Hof`).
 *   - Reference prefix: reject mentions like `wie in Reinach`, `ähnlich Aesch`
 *     where the Gemeinde is cited as a comparison, not as the subject.
 *
 * Compounds written as a single token (`Reinachstrasse`, `Reinacher`) already
 * fail the exact name-equality check, so no extra guard needed for them.
 */

import gemeindenJson from './gemeinden.json' with { type: 'json' };

/** Minimal village shape needed by deterministic/LLM matchers. The full
 *  `gemeinden.json` record has canton/lat/lng/scout_id, but the matcher
 *  ladder only consumes id + name. Exported so sibling modules
 *  (`village-assignment.ts`, `unit-extraction.ts`) share one definition. */
export interface Village { id: string; name: string }

const villages = gemeindenJson as Village[];

const NAME_TO_ID = new Map<string, string>(
  villages.map((v) => [v.name.toLowerCase(), v.id]),
);

// After-context guard: reject if the Gemeinde token is followed by a compound
// suffix (optionally via a hyphen/space). Covers `Reinach-Strasse`, `Aesch-Weg`.
// Compounds like `Reinacher` / `Reinachstrasse` are already rejected at the
// name-equality check because Intl.Segmenter treats them as single tokens.
const DECLENSION_AFTER = /^[-\s]?(er|erin|ern|s|strasse|weg|platz|gasse|hof)/i;

const REFERENCE_PREFIX = /(vorbild|ähnlich|wie in|analog zu|gleich wie)\s+$/iu;

export type VillageMatch =
  | { kind: 'unique'; villageId: string; hits: number }
  | { kind: 'multiple'; villageIds: string[] }
  | { kind: 'none' };

export function matchVillagesDeterministic(text: string): VillageMatch {
  if (!text) return { kind: 'none' };

  const seg = new Intl.Segmenter('de-CH', { granularity: 'word' });
  const tokens = Array.from(seg.segment(text));
  const hits: Record<string, number> = {};

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.isWordLike) continue;
    const id = NAME_TO_ID.get(t.segment.toLowerCase());
    if (!id) continue;

    // Reject compounds where the token is followed by a hyphenated or spaced
    // declension/compound suffix (e.g. `Reinach-Strasse`).
    const afterIdx = t.index + t.segment.length;
    const ctxAfter = text.slice(afterIdx, afterIdx + 15);
    if (DECLENSION_AFTER.test(ctxAfter)) continue;

    // Reject reference-style mentions where the reference word sits
    // immediately before the Gemeinde (e.g. `wie in Reinach`, `ähnlich Aesch`).
    const ctxStart = Math.max(0, t.index - 30);
    const ctxBefore = text.slice(ctxStart, t.index);
    if (REFERENCE_PREFIX.test(ctxBefore)) continue;

    hits[id] = (hits[id] ?? 0) + 1;
  }

  const ids = Object.keys(hits);
  if (ids.length === 0) return { kind: 'none' };
  if (ids.length === 1) return { kind: 'unique', villageId: ids[0], hits: hits[ids[0]] };
  return { kind: 'multiple', villageIds: ids };
}
