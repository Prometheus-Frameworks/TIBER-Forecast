import { describe, expect, it } from 'vitest';
import {
  parsePointScenarioLabSeasonQuery,
  parsePointScenarioLabSeasonToken,
} from '../src/services/pointScenarioLab/season.js';

describe('point-scenario lab season validation', () => {
  describe('parsePointScenarioLabSeasonToken (present value)', () => {
    it('accepts in-range integer seasons', () => {
      expect(parsePointScenarioLabSeasonToken('2025')).toEqual({ ok: true, season: 2025 });
      expect(parsePointScenarioLabSeasonToken(' 2000 ')).toEqual({ ok: true, season: 2000 });
      expect(parsePointScenarioLabSeasonToken('2100')).toEqual({ ok: true, season: 2100 });
    });

    it('rejects empty / whitespace tokens', () => {
      expect(parsePointScenarioLabSeasonToken('').ok).toBe(false);
      expect(parsePointScenarioLabSeasonToken('   ').ok).toBe(false);
    });

    it('rejects non-numeric and non-integer tokens', () => {
      expect(parsePointScenarioLabSeasonToken('abc').ok).toBe(false);
      expect(parsePointScenarioLabSeasonToken('2025.5').ok).toBe(false);
      expect(parsePointScenarioLabSeasonToken('20a5').ok).toBe(false);
    });

    it('rejects out-of-range seasons', () => {
      expect(parsePointScenarioLabSeasonToken('1999').ok).toBe(false);
      expect(parsePointScenarioLabSeasonToken('2101').ok).toBe(false);
      expect(parsePointScenarioLabSeasonToken('0').ok).toBe(false);
    });
  });

  describe('parsePointScenarioLabSeasonQuery (optional value)', () => {
    it('treats undefined / empty as "no season filter"', () => {
      expect(parsePointScenarioLabSeasonQuery(undefined)).toEqual({ ok: true, season: undefined });
      expect(parsePointScenarioLabSeasonQuery('')).toEqual({ ok: true, season: undefined });
      expect(parsePointScenarioLabSeasonQuery('   ')).toEqual({ ok: true, season: undefined });
    });

    it('accepts a valid present season', () => {
      expect(parsePointScenarioLabSeasonQuery('2025')).toEqual({ ok: true, season: 2025 });
    });

    it('rejects an invalid present season', () => {
      expect(parsePointScenarioLabSeasonQuery('abc').ok).toBe(false);
      expect(parsePointScenarioLabSeasonQuery('1999').ok).toBe(false);
    });
  });
});
