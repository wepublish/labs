import { describe, expect, it } from 'vitest';
import {
  assignVillage,
  type LlmVillageGuess,
} from '../../supabase/functions/_shared/village-assignment';

function guess(partial: Partial<LlmVillageGuess>): LlmVillageGuess {
  return {
    village: null,
    statement: '',
    ...partial,
  };
}

describe('assignVillage', () => {
  it('high-confidence LLM wins (no deterministic signal)', () => {
    const r = assignVillage(
      guess({
        village: 'aesch',
        villageConfidence: 'high',
        villageEvidence: 'Eine Aktion in Aesch',
        statement: 'Eine Aktion in Aesch findet statt.',
      }),
    );
    expect(r).toMatchObject({
      villageId: 'aesch',
      confidence: 'high',
      reviewRequired: false,
    });
    // Det matches 'aesch' too, so path is det_agree.
    expect(r.assignmentPath).toBe('llm_high_det_agree');
  });

  it('high-confidence LLM overrides deterministic disagreement (reference-mention trap)', () => {
    // Classic trap: "Ein Reinacher besuchte das Fest in Aesch"
    // Deterministic rejects "Reinacher" via declension guard, but evidence says Aesch.
    // High-confidence LLM wins either way.
    const r = assignVillage(
      guess({
        village: 'aesch',
        villageConfidence: 'high',
        villageEvidence: 'Fest in Aesch',
        statement: 'Ein Reinacher besuchte das Fest in Aesch.',
      }),
    );
    expect(r.villageId).toBe('aesch');
    expect(r.assignmentPath).toBe('llm_high_det_agree');
  });

  it('medium LLM with det disagreement flags review', () => {
    const r = assignVillage(
      guess({
        village: 'aesch',
        villageConfidence: 'medium',
        villageEvidence: 'Reinach',
        statement: 'Reinach war das Thema, aber Aktion in Aesch.',
      }),
    );
    expect(r.villageId).toBe('aesch');
    expect(r.assignmentPath).toBe('llm_medium_det_disagree');
    expect(r.reviewRequired).toBe(true);
  });

  it('medium LLM with det agreement does not flag review', () => {
    const r = assignVillage(
      guess({
        village: 'reinach',
        villageConfidence: 'medium',
        villageEvidence: 'Gemeinderat Reinach',
        statement: 'Gemeinderat Reinach entscheidet.',
      }),
    );
    expect(r.villageId).toBe('reinach');
    expect(r.assignmentPath).toBe('llm_medium');
    expect(r.reviewRequired).toBe(false);
  });

  it('low-confidence LLM rescued by deterministic unique match', () => {
    const r = assignVillage(
      guess({
        village: null,
        villageConfidence: 'low',
        villageEvidence: '',
        statement: 'Der Gemeinderat Reinach hat entschieden.',
      }),
    );
    expect(r.villageId).toBe('reinach');
    expect(r.assignmentPath).toBe('det_rescued_low_llm');
  });

  it('low-confidence LLM with no det match falls through to ueberregional', () => {
    const r = assignVillage(
      guess({
        village: null,
        villageConfidence: 'low',
        villageEvidence: '',
        statement: 'Der Bundesrat hat beschlossen.',
      }),
    );
    expect(r.villageId).toBeNull();
    expect(r.assignmentPath).toBe('ueberregional');
  });

  it('det-only: no LLM village, deterministic match', () => {
    const r = assignVillage(
      guess({
        village: null,
        statement: 'Der Gemeinderat Riehen hat entschieden.',
      }),
    );
    expect(r.villageId).toBe('riehen');
    expect(r.assignmentPath).toBe('det_only');
    expect(r.confidence).toBeNull();
  });

  it('hallucinated village → null + review_required', () => {
    const r = assignVillage(
      guess({
        village: 'oberwil',
        villageConfidence: 'high',
        villageEvidence: 'In Oberwil',
        statement: 'In Oberwil findet ein Fest statt.',
      }),
    );
    expect(r.villageId).toBeNull();
    expect(r.reviewRequired).toBe(true);
    expect(r.assignmentPath).toBe('hallucinated_to_review');
  });

  it('Überregional: no LLM village and no det match', () => {
    const r = assignVillage(
      guess({
        village: null,
        statement: 'Der Bundesrat hat neue Regeln erlassen.',
      }),
    );
    expect(r.villageId).toBeNull();
    expect(r.assignmentPath).toBe('ueberregional');
    expect(r.reviewRequired).toBe(false);
  });

  it('defaults undefined confidence to high (PDF backward compat)', () => {
    const r = assignVillage(
      guess({
        village: 'reinach',
        // no villageConfidence — PDF prompt doesn't emit it yet
        statement: 'Gemeinderat Reinach entscheidet.',
      }),
    );
    expect(r.confidence).toBe('high');
    expect(r.villageId).toBe('reinach');
  });

  it('accepts display name (e.g. "Münchenstein") from LLM', () => {
    const r = assignVillage(
      guess({
        village: 'Münchenstein',
        villageConfidence: 'high',
        villageEvidence: 'In Münchenstein',
        statement: 'In Münchenstein findet ein Fest statt.',
      }),
    );
    expect(r.villageId).toBe('muenchenstein');
  });

  it('uses statement as evidence when villageEvidence is missing', () => {
    const r = assignVillage(
      guess({
        village: null,
        statement: 'Die Gemeindeversammlung von Pratteln findet am Montag statt.',
      }),
    );
    expect(r.villageId).toBe('pratteln');
    expect(r.assignmentPath).toBe('det_only');
  });
});
