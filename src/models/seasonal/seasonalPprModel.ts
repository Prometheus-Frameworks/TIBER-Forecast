/**
 * Seasonal PPR ridge-regression model (Issue #49).
 *
 * Predicts 2025 full-season PPR from 2024 input features. Deliberately simple
 * and auditable: a ridge (L2-regularized) linear regression over a handful of
 * 2024 features plus position dummies. Numeric features are standardized using
 * training statistics only, and the intercept is left unpenalized.
 *
 * No neural networks; no external ML dependencies. The closed-form normal
 * equations make every fit fully deterministic.
 */
import type { ScoringPosition } from '../../contracts/scoring.js';
import type { SeasonalPlayerObservation, SeasonalPprFeatureSpec } from '../../contracts/seasonalPprBacktest.js';
import { multiply, multiplyVector, solveLinearSystem, transpose, type Matrix } from './linearAlgebra.js';

const POSITIONS: readonly ScoringPosition[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * Numeric input features (2024 only). Order is fixed and load-bearing: it
 * defines the design-matrix column order and therefore the reported feature
 * list. `ppr_2024` is the strongest signal and is also the naive baseline.
 */
const NUMERIC_FEATURES: SeasonalPprFeatureSpec[] = [
  { name: 'ppr_2024', kind: 'numeric', description: '2024 full-season total PPR fantasy points.' },
  { name: 'ppr_per_game_2024', kind: 'numeric', description: '2024 PPR points per game played.' },
  { name: 'games_2024', kind: 'numeric', description: '2024 games played.' },
  { name: 'targets_2024', kind: 'numeric', description: '2024 total targets (receiving volume).' },
  { name: 'rush_attempts_2024', kind: 'numeric', description: '2024 total rush attempts (rushing volume).' },
];

const POSITION_FEATURE: SeasonalPprFeatureSpec = {
  name: 'position',
  kind: 'categorical',
  description: 'Player position (QB/RB/WR/TE), one-hot encoded; TE is the reference level.',
};

/** Public feature list for the report (numeric features + position). */
export const seasonalPprFeatureList: SeasonalPprFeatureSpec[] = [...NUMERIC_FEATURES, POSITION_FEATURE];

/** Numeric feature names a row can be "missing" (defaulted to 0) for coverage tracking. */
export const seasonalPprNumericFeatureNames: string[] = NUMERIC_FEATURES.map((feature) => feature.name);

const numericValue = (observation: SeasonalPlayerObservation, name: string): number => {
  switch (name) {
    case 'ppr_2024':
      return observation.ppr_2024;
    case 'ppr_per_game_2024':
      return observation.games_2024 > 0 ? observation.ppr_2024 / observation.games_2024 : 0;
    case 'games_2024':
      return observation.games_2024;
    case 'targets_2024':
      return observation.targets_2024;
    case 'rush_attempts_2024':
      return observation.rush_attempts_2024;
    default:
      return 0;
  }
};

const numericVector = (observation: SeasonalPlayerObservation): number[] =>
  NUMERIC_FEATURES.map((feature) => numericValue(observation, feature.name));

// Position dummies for QB/RB/WR; TE is the reference level (all zeros).
const positionDummies = (position: ScoringPosition): number[] =>
  POSITIONS.filter((candidate) => candidate !== 'TE').map((candidate) => (candidate === position ? 1 : 0));

/**
 * One additive term in the ridge prediction: `contribution = coefficient *
 * design_value`. Reported for interpretability only — it describes how the model
 * combined inputs, NOT any causal football effect.
 */
export interface SeasonalRidgeContribution {
  /** Feature label, e.g. `ppr_2024` or `position=WR`. */
  feature: string;
  kind: 'numeric' | 'position';
  /** Raw input value (e.g. 240 PPR, or 1 for the active position dummy). */
  input_value: number;
  /** Value actually fed to the model: standardized numeric, or 0/1 dummy. */
  standardized_value: number;
  /** Learned coefficient for this column. */
  coefficient: number;
  /** `coefficient * standardized_value`; sign shows push up/down. */
  contribution: number;
}

/**
 * Deterministic, additive decomposition of a single prediction:
 * `prediction = max(0, intercept + sum(contributions))`. Exposes the existing
 * learned coefficients; it does not change what `predict` returns.
 */
export interface SeasonalRidgeExplanation {
  intercept: number;
  /** intercept + sum of contributions (pre-clamp). */
  raw_prediction: number;
  /** max(0, raw_prediction) — matches `predict`. */
  prediction: number;
  /** True when the non-negativity clamp changed the raw prediction. */
  clamped: boolean;
  contributions: SeasonalRidgeContribution[];
}

export interface SeasonalRidgeModel {
  predict: (observation: SeasonalPlayerObservation) => number;
  /** Additive feature-contribution breakdown for one observation (mechanics only). */
  explain: (observation: SeasonalPlayerObservation) => SeasonalRidgeExplanation;
}

export interface TrainSeasonalRidgeOptions {
  /** L2 penalty. Default chosen for the small, low-dimensional seasonal design. */
  lambda?: number;
}

const DEFAULT_LAMBDA = 1.0;

/**
 * Fit a ridge model on the supplied training observations. Numeric columns are
 * standardized with training mean/std; the intercept term is never penalized.
 * Throws (fail closed) when training data is empty or the system is singular.
 */
export const trainSeasonalRidgeModel = (
  trainRows: SeasonalPlayerObservation[],
  options: TrainSeasonalRidgeOptions = {},
): SeasonalRidgeModel => {
  if (trainRows.length === 0) {
    throw new Error('trainSeasonalRidgeModel requires at least one training row.');
  }

  const lambda = options.lambda ?? DEFAULT_LAMBDA;

  const numericMatrix = trainRows.map((row) => numericVector(row));
  const featureCount = NUMERIC_FEATURES.length;

  // Standardization statistics from the training set only (no leakage).
  const means = new Array<number>(featureCount).fill(0);
  for (const vector of numericMatrix) {
    for (let i = 0; i < featureCount; i += 1) {
      means[i] += vector[i];
    }
  }
  for (let i = 0; i < featureCount; i += 1) {
    means[i] /= numericMatrix.length;
  }

  const stds = new Array<number>(featureCount).fill(0);
  for (const vector of numericMatrix) {
    for (let i = 0; i < featureCount; i += 1) {
      stds[i] += (vector[i] - means[i]) ** 2;
    }
  }
  for (let i = 0; i < featureCount; i += 1) {
    stds[i] = Math.sqrt(stds[i] / numericMatrix.length);
    // Guard against zero-variance columns so standardization stays finite.
    if (stds[i] < 1e-9) {
      stds[i] = 1;
    }
  }

  const standardize = (vector: number[]): number[] => vector.map((value, i) => (value - means[i]) / stds[i]);

  // Design row: [intercept=1, standardized numeric features..., position dummies...].
  const designRow = (observation: SeasonalPlayerObservation): number[] => [
    1,
    ...standardize(numericVector(observation)),
    ...positionDummies(observation.position),
  ];

  const designMatrix: Matrix = trainRows.map((row) => designRow(row));
  const targets = trainRows.map((row) => row.ppr_2025_actual as number);

  const xt = transpose(designMatrix);
  const xtx = multiply(xt, designMatrix);
  const dimension = xtx.length;

  // Ridge penalty on every coefficient except the intercept (column 0).
  for (let i = 1; i < dimension; i += 1) {
    xtx[i][i] += lambda;
  }

  const xty = multiplyVector(xt, targets);
  const coefficients = solveLinearSystem(xtx, xty);

  // Non-reference position columns, in the same order as `positionDummies`.
  const nonReferencePositions = POSITIONS.filter((candidate) => candidate !== 'TE');
  const numericCount = NUMERIC_FEATURES.length;

  const rawPrediction = (observation: SeasonalPlayerObservation): number =>
    designRow(observation).reduce((sum, value, index) => sum + value * coefficients[index], 0);

  return {
    predict: (observation) =>
      // PPR totals are non-negative; clamp to avoid implausible negatives.
      Math.max(0, rawPrediction(observation)),

    explain: (observation) => {
      const numeric = numericVector(observation);
      const standardized = standardize(numeric);
      const intercept = coefficients[0];

      const contributions: SeasonalRidgeContribution[] = NUMERIC_FEATURES.map((feature, i) => ({
        feature: feature.name,
        kind: 'numeric' as const,
        input_value: numeric[i],
        standardized_value: standardized[i],
        coefficient: coefficients[1 + i],
        contribution: coefficients[1 + i] * standardized[i],
      }));

      // Position is one-hot with TE as the reference level (absorbed into the
      // intercept). Report the player's own position column: its coefficient for
      // QB/RB/WR, or a zero contribution for the TE reference.
      const activeIndex = nonReferencePositions.findIndex((candidate) => candidate === observation.position);
      const positionCoefficient = activeIndex >= 0 ? coefficients[1 + numericCount + activeIndex] : 0;
      const positionDummy = activeIndex >= 0 ? 1 : 0;
      contributions.push({
        feature: `position=${observation.position}`,
        kind: 'position',
        input_value: positionDummy,
        standardized_value: positionDummy,
        coefficient: positionCoefficient,
        contribution: positionCoefficient * positionDummy,
      });

      const raw = rawPrediction(observation);
      const prediction = Math.max(0, raw);
      return { intercept, raw_prediction: raw, prediction, clamped: prediction !== raw, contributions };
    },
  };
};
