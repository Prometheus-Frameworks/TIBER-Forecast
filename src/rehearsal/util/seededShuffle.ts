/**
 * Tiny deterministic seeded permutation utilities for control-arm scaffolding (e.g. the Run 2
 * shuffled-Teamstate sanity arm). Pure and self-contained — no crypto, no global RNG, no I/O. Given
 * the same `(n, seed)` it always returns the same permutation, so shuffled artifacts are reproducible
 * and independent of host state.
 */

/** mulberry32 PRNG: a small, fast, deterministic 32-bit generator returning floats in [0, 1). */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A deterministic permutation of `[0, n)` produced by a seeded Fisher–Yates shuffle. Same `(n, seed)`
 * → same array. Returns `[]` for n <= 0 and `[0]` for n === 1.
 */
export const seededPermutation = (n: number, seed: number): number[] => {
  const indices = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  if (indices.length < 2) return indices;
  const rand = mulberry32(seed);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  return indices;
};

/**
 * A deterministic permutation of `[0, n)` with **no fixed points** when `n >= 2` (a derangement), so
 * no element maps to its own index where that is feasible. For `n < 2` a derangement is impossible and
 * the identity permutation is returned (the caller should treat that as "identity unavoidable").
 *
 * It uses seeded rejection sampling: draw a {@link seededPermutation}, accept it if it is a
 * derangement, otherwise advance the seed deterministically and retry. Because derangements are a
 * constant fraction (~1/e) of all permutations, a derangement is found quickly, and — unlike a
 * fixed-point "repair" pass — different seeds genuinely select different derangements where more than
 * one exists. A deterministic cyclic-neighbour-swap fallback guarantees a derangement in the
 * astronomically unlikely event the retry budget is exhausted.
 */
export const seededDerangement = (n: number, seed: number): number[] => {
  if (n < 2) return seededPermutation(n, seed);
  let attemptSeed = seed >>> 0;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const perm = seededPermutation(n, attemptSeed);
    if (isDerangement(perm)) return perm;
    attemptSeed = (attemptSeed + 0x9e3779b9) | 0;
  }
  const perm = seededPermutation(n, seed);
  for (let i = 0; i < perm.length; i += 1) {
    if (perm[i] === i) {
      const swapWith = (i + 1) % perm.length;
      [perm[i], perm[swapWith]] = [perm[swapWith]!, perm[i]!];
    }
  }
  return perm;
};

/** True when `perm` (a permutation of `[0, n)`) has no fixed point — i.e. it is a derangement. */
export const isDerangement = (perm: readonly number[]): boolean => perm.every((value, index) => value !== index);
