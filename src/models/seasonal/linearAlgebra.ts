/**
 * Minimal, dependency-free, deterministic linear algebra for the seasonal ridge
 * model. Kept intentionally tiny: the seasonal backtest fits a handful of
 * coefficients over a few dozen rows, so a plain Gaussian-elimination solve is
 * exact, auditable, and fully deterministic.
 */

export type Matrix = number[][];
export type Vector = number[];

/** Transpose an m x n matrix into n x m. */
export const transpose = (matrix: Matrix): Matrix => {
  const rows = matrix.length;
  const cols = rows === 0 ? 0 : matrix[0].length;
  const result: Matrix = Array.from({ length: cols }, () => new Array<number>(rows).fill(0));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      result[c][r] = matrix[r][c];
    }
  }
  return result;
};

/** Multiply an m x n matrix by an n x p matrix. */
export const multiply = (left: Matrix, right: Matrix): Matrix => {
  const m = left.length;
  const n = right.length;
  const p = n === 0 ? 0 : right[0].length;
  const result: Matrix = Array.from({ length: m }, () => new Array<number>(p).fill(0));
  for (let i = 0; i < m; i += 1) {
    for (let k = 0; k < n; k += 1) {
      const leftValue = left[i][k];
      if (leftValue === 0) {
        continue;
      }
      for (let j = 0; j < p; j += 1) {
        result[i][j] += leftValue * right[k][j];
      }
    }
  }
  return result;
};

/** Multiply an m x n matrix by an n-vector. */
export const multiplyVector = (matrix: Matrix, vector: Vector): Vector =>
  matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));

/**
 * Solve `A x = b` for a square, symmetric-positive-definite-ish system using
 * Gaussian elimination with partial pivoting. Throws when the system is
 * singular so callers fail closed rather than emit silent garbage.
 */
export const solveLinearSystem = (a: Matrix, b: Vector): Vector => {
  const n = a.length;
  if (n === 0) {
    return [];
  }
  // Work on an augmented copy so the caller's matrices are untouched.
  const augmented: Matrix = a.map((row, index) => [...row, b[index]]);

  for (let pivot = 0; pivot < n; pivot += 1) {
    let maxRow = pivot;
    let maxValue = Math.abs(augmented[pivot][pivot]);
    for (let r = pivot + 1; r < n; r += 1) {
      const candidate = Math.abs(augmented[r][pivot]);
      if (candidate > maxValue) {
        maxValue = candidate;
        maxRow = r;
      }
    }

    if (maxValue < 1e-12) {
      throw new Error('Singular matrix: seasonal ridge system has no unique solution.');
    }

    if (maxRow !== pivot) {
      const tmp = augmented[pivot];
      augmented[pivot] = augmented[maxRow];
      augmented[maxRow] = tmp;
    }

    const pivotValue = augmented[pivot][pivot];
    for (let r = 0; r < n; r += 1) {
      if (r === pivot) {
        continue;
      }
      const factor = augmented[r][pivot] / pivotValue;
      if (factor === 0) {
        continue;
      }
      for (let c = pivot; c <= n; c += 1) {
        augmented[r][c] -= factor * augmented[pivot][c];
      }
    }
  }

  // Elimination above zeroed every off-diagonal entry, so the system is now
  // diagonal: x[i] = augmented[i][n] / augmented[i][i].
  return augmented.map((row, index) => row[n] / row[index]);
};
