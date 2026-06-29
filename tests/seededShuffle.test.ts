import { describe, expect, it } from 'vitest';
import { isDerangement, mulberry32, seededDerangement, seededPermutation } from '../src/public/index.js';

describe('seeded shuffle utilities', () => {
  it('mulberry32 is deterministic for a given seed and varies across seeds', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const c = mulberry32(124);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  it('seededPermutation returns a real, deterministic permutation', () => {
    const perm = seededPermutation(8, 42);
    expect([...perm].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(seededPermutation(8, 42)).toEqual(perm);
    expect(seededPermutation(0, 1)).toEqual([]);
    expect(seededPermutation(1, 1)).toEqual([0]);
  });

  it('seededDerangement has no fixed points for n >= 2 and is deterministic', () => {
    for (const seed of [0, 1, 2, 7, 42, 999, 123456]) {
      for (const n of [2, 3, 5, 12]) {
        const perm = seededDerangement(n, seed);
        expect([...perm].sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(isDerangement(perm)).toBe(true);
      }
    }
    expect(seededDerangement(5, 42)).toEqual(seededDerangement(5, 42));
  });

  it('returns the identity when a derangement is infeasible (n < 2)', () => {
    expect(seededDerangement(1, 5)).toEqual([0]);
    expect(seededDerangement(0, 5)).toEqual([]);
  });

  it('selects different derangements for different seeds where more than one exists', () => {
    // n=3 has exactly two derangements ([1,2,0] and [2,0,1]); seeds 0 and 1 land on different ones.
    expect(seededDerangement(3, 0)).not.toEqual(seededDerangement(3, 1));
  });
});
