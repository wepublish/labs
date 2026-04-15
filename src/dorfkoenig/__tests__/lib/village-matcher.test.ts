import { describe, expect, it } from 'vitest';
import { matchVillagesDeterministic } from '../../supabase/functions/_shared/village-matcher';

describe('matchVillagesDeterministic', () => {
  describe('unique matches', () => {
    it('matches a standalone Gemeinde name', () => {
      const r = matchVillagesDeterministic('Der Gemeinderat Reinach hat beschlossen.');
      expect(r).toEqual({ kind: 'unique', villageId: 'reinach', hits: 1 });
    });

    it('matches an umlaut Gemeinde', () => {
      const r = matchVillagesDeterministic('In Münchenstein wurde ein Fest gefeiert.');
      expect(r).toEqual({ kind: 'unique', villageId: 'muenchenstein', hits: 1 });
    });

    it('matches case-insensitively', () => {
      const r = matchVillagesDeterministic('aesch ist eine Gemeinde.');
      expect(r).toEqual({ kind: 'unique', villageId: 'aesch', hits: 1 });
    });

    it('counts repeated mentions', () => {
      const r = matchVillagesDeterministic('Reinach. Reinach! Reinach?');
      expect(r).toEqual({ kind: 'unique', villageId: 'reinach', hits: 3 });
    });
  });

  describe('multi-Gemeinde', () => {
    it('returns multiple when two Gemeinden are named', () => {
      const r = matchVillagesDeterministic('Die Zusammenarbeit von Reinach und Aesch wird vertieft.');
      expect(r.kind).toBe('multiple');
      if (r.kind === 'multiple') {
        expect(r.villageIds.sort()).toEqual(['aesch', 'reinach']);
      }
    });
  });

  describe('declension rejections', () => {
    it('rejects Reinacher (adjective form)', () => {
      const r = matchVillagesDeterministic('Ein Reinacher Unternehmer eröffnete in Aesch.');
      // Reinacher is a compound, not a Gemeinde match; Aesch is the only hit.
      expect(r).toEqual({ kind: 'unique', villageId: 'aesch', hits: 1 });
    });

    it('rejects Reinachstrasse (street compound)', () => {
      const r = matchVillagesDeterministic('Die Reinachstrasse wird saniert.');
      expect(r).toEqual({ kind: 'none' });
    });

    it('rejects Reinach-Strasse (hyphenated compound via declension suffix)', () => {
      const r = matchVillagesDeterministic('Die Reinach-Strasse wird saniert.');
      expect(r).toEqual({ kind: 'none' });
    });
  });

  describe('reference-prefix rejections', () => {
    it('rejects "wie in Reinach"', () => {
      const r = matchVillagesDeterministic('Ähnliche Massnahmen wie in Reinach sind geplant.');
      // "wie in" fires both the reference guard AND the "ähnlich" check.
      expect(r).toEqual({ kind: 'none' });
    });

    it('rejects immediate-prefix "Vorbild Reinach"', () => {
      // Current regex only catches the reference word immediately before the
      // Gemeinde. Patterns with intervening words (e.g. "Vorbild ist Reinach")
      // are not caught and rely on the LLM for disambiguation.
      const r = matchVillagesDeterministic('Nach dem Vorbild Reinach handelt Aesch.');
      // Reinach gets rejected, Aesch is the only remaining hit.
      expect(r).toEqual({ kind: 'unique', villageId: 'aesch', hits: 1 });
    });

    it('rejects "analog zu Reinach"', () => {
      const r = matchVillagesDeterministic('Analog zu Reinach wird die Steuer gesenkt.');
      expect(r).toEqual({ kind: 'none' });
    });
  });

  describe('none', () => {
    it('returns none for text without any Gemeinde', () => {
      const r = matchVillagesDeterministic('Der Bundesrat hat beschlossen.');
      expect(r).toEqual({ kind: 'none' });
    });

    it('returns none for empty text', () => {
      expect(matchVillagesDeterministic('')).toEqual({ kind: 'none' });
    });

    it('returns none for non-Gemeinde place (Zürich)', () => {
      const r = matchVillagesDeterministic('Das Ereignis fand in Zürich statt.');
      expect(r).toEqual({ kind: 'none' });
    });
  });
});
