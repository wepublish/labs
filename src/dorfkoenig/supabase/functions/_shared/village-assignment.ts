/**
 * Pure village-assignment ladder — shared by web scouts (auto mode) and PDF uploads.
 *
 * Inputs: one LLM guess + the unit's statement. No Supabase, no scout context.
 * Output: the final village assignment plus a diagnostic `assignmentPath` for eval.
 *
 * Precedence (designed with ai-engineer critique, approved by big-tony review):
 *   high-confidence LLM ─────────────► trust LLM (note if det agrees)
 *   medium-confidence LLM + det disagrees ─► trust LLM, flag for review
 *   medium-confidence LLM (det agrees/none) ─► trust LLM
 *   low-confidence LLM + det unique ────► use det (LLM rescue)
 *   any LLM village in the 10-set ──────► trust LLM
 *   det unique with no LLM village ─────► use det
 *   LLM returned unknown village ───────► null + review_required
 *   nothing ────────────────────────────► Überregional (null)
 *
 * Confidence defaults to `'high'` when undefined so the PDF pipeline (whose
 * prompt doesn't emit `villageConfidence` yet) keeps today's trust-LLM behaviour.
 */

import gemeindenJson from './gemeinden.json' with { type: 'json' };
import { matchVillagesDeterministic } from './village-matcher.ts';

interface Village { id: string; name: string }

const villages = gemeindenJson as Village[];

// Accept both display names (`Münchenstein`) and IDs (`muenchenstein`) from the LLM.
const NAME_TO_ID = new Map<string, string>(
  villages.flatMap((v) => [
    [v.name.toLowerCase(), v.id],
    [v.id, v.id],
  ]),
);

export interface LlmVillageGuess {
  /** LLM's village output — may be display name or ID; null if LLM chose "no village". */
  village: string | null;
  /** Optional — PDF prompt doesn't emit this yet. Undefined defaults to 'high'. */
  villageConfidence?: 'high' | 'medium' | 'low';
  /** Optional — quoted span from input supporting the village choice. */
  villageEvidence?: string;
  /** Fallback evidence when `villageEvidence` is missing. */
  statement: string;
}

export type AssignmentPath =
  | 'llm_high'
  | 'llm_high_det_agree'
  | 'llm_medium'
  | 'llm_medium_det_disagree'
  | 'det_rescued_low_llm'
  | 'llm_low'
  | 'det_only'
  | 'hallucinated_to_review'
  | 'ueberregional';

export interface VillageAssignment {
  villageId: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  assignmentPath: AssignmentPath;
  reviewRequired: boolean;
}

export function assignVillage(guess: LlmVillageGuess): VillageAssignment {
  const confidence = guess.villageConfidence ?? 'high';
  const llmVillage = guess.village
    ? NAME_TO_ID.get(guess.village.toLowerCase()) ?? null
    : null;
  const evidenceText = guess.villageEvidence || guess.statement;
  const det = matchVillagesDeterministic(evidenceText);

  if (confidence === 'high' && llmVillage) {
    const agrees = det.kind === 'unique' && det.villageId === llmVillage;
    return {
      villageId: llmVillage,
      confidence,
      assignmentPath: agrees ? 'llm_high_det_agree' : 'llm_high',
      reviewRequired: false,
    };
  }

  if (confidence === 'medium' && llmVillage) {
    const disagrees = det.kind === 'unique' && det.villageId !== llmVillage;
    return {
      villageId: llmVillage,
      confidence,
      assignmentPath: disagrees ? 'llm_medium_det_disagree' : 'llm_medium',
      reviewRequired: disagrees,
    };
  }

  if (confidence === 'low' && det.kind === 'unique') {
    return {
      villageId: det.villageId,
      confidence,
      assignmentPath: 'det_rescued_low_llm',
      reviewRequired: false,
    };
  }

  if (llmVillage) {
    return {
      villageId: llmVillage,
      confidence,
      assignmentPath: 'llm_low',
      reviewRequired: false,
    };
  }

  if (det.kind === 'unique') {
    return {
      villageId: det.villageId,
      confidence: null,
      assignmentPath: 'det_only',
      reviewRequired: false,
    };
  }

  if (guess.village && !llmVillage) {
    return {
      villageId: null,
      confidence,
      assignmentPath: 'hallucinated_to_review',
      reviewRequired: true,
    };
  }

  return {
    villageId: null,
    confidence: null,
    assignmentPath: 'ueberregional',
    reviewRequired: false,
  };
}
