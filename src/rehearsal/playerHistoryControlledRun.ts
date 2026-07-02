/**
 * Isolated controlled player-history experiment (Forecast #111).
 *
 * The first — and only — module in this chain allowed to compute experimental metrics, strictly
 * inside its own report. It executes the three-arm design from #101/PR #102 over the #109 mirrors:
 *
 *   1. baseline_only                      — train-fold position mean of the 2025 outcome; consumes
 *                                           NO player-history payloads. Chosen (rather than reusing
 *                                           the old n=38 fixture backtest baseline) because it is
 *                                           reproducible on the real 610-player population without
 *                                           production rewiring and cannot leak the held-out outcome.
 *   2. real_player_history_features       — ridge regression on position dummies + the #104
 *                                           scaffold's feature families (inspectable, separable).
 *   3. shuffled_player_history_control    — identical model/schema, but the player-history feature
 *                                           block is deterministically deranged WITHIN position among
 *                                           joined players (seeded, pre-outcome-independent).
 *
 * Validation: leave-one-out cross-validation over the target population. Per fold, imputation
 * (train-fold means via the #104 primitives) and standardization are fit on TRAINING rows only; the
 * held-out row's outcome never influences its own features, imputers, scalers, or fitted parameters.
 *
 * Every result is marked `experimental_candidate_result_not_production_signal`. The decision enum has
 * NO value that authorizes production binding. No production Forecast behavior is touched: this
 * module never imports seasonalPprModel.ts, routes, or product surfaces.
 */

import {
  buildPlayerHistoryFeatures,
  computePlayerHistoryTrainFoldMeans,
  imputePlayerHistoryValue,
  type PlayerHistoryFeatureRow,
  type PlayerHistoryImputationRow,
  type PlayerHistoryInputRow,
} from './playerHistoryFeatureScaffold.js';
import type { PlayerHistoryOutcomeMirror, PlayerHistoryRunPopulationInputMirror } from './playerHistoryRunPopulationMirrors.js';
import {
  OVERLAP_MIN_JOINED_ROWS_OVERALL,
  OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
  OVERLAP_MIN_JOINED_SHARE,
  OVERLAP_REQUIRED_POSITIONS,
} from './playerHistoryMirrorOverlapGate.js';
import { seededDerangement } from './util/seededShuffle.js';

export const PLAYER_HISTORY_CONTROLLED_RUN_VERSION = 'player-history-controlled-run-v1' as const;

export const CONTROLLED_RUN_RESULT_MARKING = 'experimental_candidate_result_not_production_signal' as const;

export const CONTROLLED_RUN_ARMS = ['baseline_only', 'real_player_history_features', 'shuffled_player_history_control'] as const;

export type ControlledRunArm = (typeof CONTROLLED_RUN_ARMS)[number];

/** Deterministic default seed for the shuffled-control arm. Assignment depends only on ids + seed. */
export const CONTROLLED_RUN_SHUFFLE_SEED = 20260702;

export const CONTROLLED_RUN_RIDGE_LAMBDA = 1.0;

/**
 * The allowed decisions. There is deliberately NO value that authorizes production binding, feature
 * wiring, promotion, or product output.
 */
export const CONTROLLED_RUN_DECISIONS = [
  'candidate_player_history_signal_observed_requires_followup',
  'no_player_history_signal_observed',
  'inconclusive_player_history_result',
  'run_invalid_must_not_use',
] as const;

export type ControlledRunDecision = (typeof CONTROLLED_RUN_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------------
// Preflight: the run must not execute unless every prior gate passed and the mirrors are in scope.
// ---------------------------------------------------------------------------------------------------

export interface ControlledRunPriorGateEvidence {
  source_gate_reverification_decision: string;
  target_population_gate_decision: string;
  mirror_overlap_gate_decision: string;
  dry_run_matrix_status: string;
  dry_run_joined_rows: number;
  dry_run_scored_target_rows: number;
  dry_run_joined_rows_by_position: Record<string, number>;
}

const FORBIDDEN_AVAILABILITY_KEYS: readonly string[] = ['active_status', 'ownership_status', 'roster_status', 'active_roster_status'];

/**
 * Fail-closed preconditions. Throws with a specific reason on the first violated condition; the
 * controlled run must not execute if this throws.
 */
export const assertControlledRunPreconditions = (
  gates: ControlledRunPriorGateEvidence,
  outcomeMirror: PlayerHistoryOutcomeMirror,
  inputMirror: PlayerHistoryRunPopulationInputMirror,
): void => {
  const fail = (reason: string): never => {
    throw new Error(`controlled run BLOCKED (fail closed): ${reason}`);
  };
  if (gates.source_gate_reverification_decision !== 'may_continue_mirror_build')
    fail(`source-gate re-verification decision is ${gates.source_gate_reverification_decision}, expected may_continue_mirror_build`);
  if (gates.target_population_gate_decision !== 'may_continue_to_overlap_gate')
    fail(`target-population gate decision is ${gates.target_population_gate_decision}, expected may_continue_to_overlap_gate`);
  if (gates.mirror_overlap_gate_decision !== 'may_authorize_run_issue')
    fail(`mirror-overlap gate decision is ${gates.mirror_overlap_gate_decision}, expected may_authorize_run_issue`);
  if (gates.dry_run_matrix_status !== 'dry_run_only_not_model_ready')
    fail(`dry-run matrix status is ${gates.dry_run_matrix_status}, expected dry_run_only_not_model_ready`);
  if (gates.dry_run_joined_rows < OVERLAP_MIN_JOINED_ROWS_OVERALL)
    fail(`joined rows ${gates.dry_run_joined_rows} below the #107 floor ${OVERLAP_MIN_JOINED_ROWS_OVERALL}`);
  for (const position of OVERLAP_REQUIRED_POSITIONS) {
    const joined = gates.dry_run_joined_rows_by_position[position] ?? 0;
    if (joined < OVERLAP_MIN_JOINED_ROWS_PER_POSITION)
      fail(`joined rows for ${position} (${joined}) below the #107 floor ${OVERLAP_MIN_JOINED_ROWS_PER_POSITION}`);
  }
  if (gates.dry_run_scored_target_rows <= 0 || gates.dry_run_joined_rows / gates.dry_run_scored_target_rows < OVERLAP_MIN_JOINED_SHARE)
    fail(`joined share below the #107 floor ${OVERLAP_MIN_JOINED_SHARE}`);
  const badInputSeason = inputMirror.rows.filter((row) => row.season >= outcomeMirror.target_season);
  if (badInputSeason.length > 0)
    fail(`${badInputSeason.length} input mirror rows at or beyond target season ${outcomeMirror.target_season} (2025 rows must never be input features)`);
  for (const row of [...inputMirror.rows, ...outcomeMirror.rows]) {
    for (const key of FORBIDDEN_AVAILABILITY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) fail(`row for ${row.player_id} carries forbidden availability field ${key}`);
    }
  }
  const outcomeLeak = inputMirror.rows.filter((row) =>
    ['season_ppr_2025', 'ppr_2025_actual', 'target_outcome'].some((key) => Object.prototype.hasOwnProperty.call(row, key)),
  );
  if (outcomeLeak.length > 0) fail(`${outcomeLeak.length} input mirror rows carry outcome-valued fields`);
  if (outcomeMirror.governed_source.artifactStatus !== 'candidate_evidence_artifact_not_promoted')
    fail(`outcome mirror artifact status is ${outcomeMirror.governed_source.artifactStatus}, expected candidate_evidence_artifact_not_promoted`);
};

// ---------------------------------------------------------------------------------------------------
// Feature vectorization: family-separable numeric columns from the #104 scaffold's feature rows.
// ---------------------------------------------------------------------------------------------------

export interface ControlledRunFeatureColumn {
  name: string;
  family: 'coverage' | 'production' | 'usage' | 'age_career' | 'team_context' | 'structural';
}

/** The player-history feature block (shuffled in arm 3). Position dummies + has_history stay own-row. */
export const CONTROLLED_RUN_HISTORY_COLUMNS: readonly ControlledRunFeatureColumn[] = [
  { name: 'prior_seasons_observed_count', family: 'coverage' },
  { name: 'prior_weeks_observed_total', family: 'coverage' },
  { name: 'prior_weeks_observed_mean', family: 'coverage' },
  { name: 'missingness_rate', family: 'coverage' },
  { name: 'ppr_2024', family: 'production' },
  { name: 'ppr_2023', family: 'production' },
  { name: 'ppr_2022', family: 'production' },
  { name: 'ppg_2024', family: 'production' },
  { name: 'trailing_2yr_ppr_total', family: 'production' },
  { name: 'trailing_3yr_ppr_total', family: 'production' },
  { name: 'trailing_2yr_ppr_mean', family: 'production' },
  { name: 'trailing_3yr_ppr_mean', family: 'production' },
  { name: 'year_over_year_ppr_trend', family: 'production' },
  { name: 'targets_2024', family: 'usage' },
  { name: 'receptions_2024', family: 'usage' },
  { name: 'rushing_attempts_2024', family: 'usage' },
  { name: 'receiving_air_yards_2024', family: 'usage' },
  { name: 'target_share_2024', family: 'usage' },
  { name: 'air_yards_share_2024', family: 'usage' },
  { name: 'wopr_2024', family: 'usage' },
  { name: 'racr_2024', family: 'usage' },
  { name: 'latest_pre_target_season_age', family: 'age_career' },
  { name: 'latest_pre_target_career_year', family: 'age_career' },
  { name: 'undrafted_indicator', family: 'age_career' },
  { name: 'multi_team_prior_season_indicator', family: 'team_context' },
  { name: 'multi_team_season_count', family: 'team_context' },
];

const STRUCTURAL_COLUMNS: readonly string[] = ['has_player_history', 'pos_QB', 'pos_RB', 'pos_WR'];

const numeric = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const boolToNum = (value: boolean | null | undefined): number | null => (value === true ? 1 : value === false ? 0 : null);

/** Extract the player-history feature block (nulls preserved) from a #104 scaffold feature row. */
export const historyValuesFromFeatureRow = (features: PlayerHistoryFeatureRow): Record<string, number | null> => ({
  prior_seasons_observed_count: numeric(features.coverage?.prior_seasons_observed_count),
  prior_weeks_observed_total: numeric(features.coverage?.prior_weeks_observed_total),
  prior_weeks_observed_mean: numeric(features.coverage?.prior_weeks_observed_mean),
  missingness_rate: numeric(features.coverage?.missingness_rate),
  ppr_2024: numeric(features.production?.season_ppr_by_season[2024]),
  ppr_2023: numeric(features.production?.season_ppr_by_season[2023]),
  ppr_2022: numeric(features.production?.season_ppr_by_season[2022]),
  ppg_2024: numeric(features.production?.season_ppg_by_season[2024]),
  trailing_2yr_ppr_total: numeric(features.production?.trailing_2yr_ppr_total),
  trailing_3yr_ppr_total: numeric(features.production?.trailing_3yr_ppr_total),
  trailing_2yr_ppr_mean: numeric(features.production?.trailing_2yr_ppr_mean),
  trailing_3yr_ppr_mean: numeric(features.production?.trailing_3yr_ppr_mean),
  year_over_year_ppr_trend: numeric(features.production?.year_over_year_ppr_trend),
  targets_2024: numeric(features.usage?.targets_by_season[2024]),
  receptions_2024: numeric(features.usage?.receptions_by_season[2024]),
  rushing_attempts_2024: numeric(features.usage?.rushing_attempts_by_season[2024]),
  receiving_air_yards_2024: numeric(features.usage?.receiving_air_yards_by_season[2024]),
  target_share_2024: numeric(features.usage?.target_share_by_season[2024]),
  air_yards_share_2024: numeric(features.usage?.air_yards_share_by_season[2024]),
  wopr_2024: numeric(features.usage?.wopr_by_season[2024]),
  racr_2024: numeric(features.usage?.racr_by_season[2024]),
  latest_pre_target_season_age: numeric(features.age_career?.latest_pre_target_season_age),
  latest_pre_target_career_year: numeric(features.age_career?.latest_pre_target_career_year),
  undrafted_indicator: boolToNum(features.age_career?.undrafted_indicator),
  multi_team_prior_season_indicator: boolToNum(features.team_context?.multi_team_prior_season_indicator),
  multi_team_season_count: numeric(features.team_context?.multi_team_season_count),
});

export interface ControlledRunRow {
  player_id: string;
  player_name: string;
  position: string;
  /** The 2025 target outcome (never appears in any feature column). */
  outcome: number;
  has_player_history: boolean;
  /** Real player-history feature block (nulls preserved); all-null when no history. */
  real_history_values: Record<string, number | null>;
  /** Shuffled-control feature block (within-position derangement among joined rows). */
  shuffled_history_values: Record<string, number | null>;
  shuffled_donor_player_id: string | null;
}

const EMPTY_HISTORY: Record<string, number | null> = Object.fromEntries(
  CONTROLLED_RUN_HISTORY_COLUMNS.map((column) => [column.name, null]),
);

/**
 * Assemble the run rows: join outcome mirror to #104 features (built from the input mirror with the
 * full fail-closed boundary set), then assign the deterministic within-position shuffled block.
 * The shuffle depends only on player_ids and the seed — never on outcomes.
 */
export const buildControlledRunRows = (
  outcomeMirror: PlayerHistoryOutcomeMirror,
  inputRows: readonly PlayerHistoryInputRow[],
  shuffleSeed: number = CONTROLLED_RUN_SHUFFLE_SEED,
): ControlledRunRow[] => {
  const featureRows = buildPlayerHistoryFeatures(inputRows, {
    targetSeason: outcomeMirror.target_season,
    inputSeasons: [2022, 2023, 2024],
  });
  const featuresByPlayer = new Map(featureRows.map((row) => [row.player_id, row]));

  const rows: ControlledRunRow[] = [];
  for (const target of [...outcomeMirror.rows].sort((a, b) => (a.player_id < b.player_id ? -1 : 1))) {
    if (typeof target.season_ppr !== 'number') continue; // no observed outcome -> cannot be evaluated; reported upstream
    const features = featuresByPlayer.get(target.player_id);
    const matched = features !== undefined && features.position === target.position;
    rows.push({
      player_id: target.player_id,
      player_name: target.player_name,
      position: target.position,
      outcome: target.season_ppr,
      has_player_history: matched,
      real_history_values: matched ? historyValuesFromFeatureRow(features!) : { ...EMPTY_HISTORY },
      shuffled_history_values: { ...EMPTY_HISTORY },
      shuffled_donor_player_id: null,
    });
  }

  // Deterministic, pre-outcome-independent within-position derangement over joined rows.
  const positions = [...new Set(rows.map((row) => row.position))].sort();
  for (const position of positions) {
    const group = rows.filter((row) => row.position === position && row.has_player_history);
    if (group.length < 2) continue; // identity unavoidable; block stays all-null and is reported
    const groupSeed = (shuffleSeed + position.charCodeAt(0) * 7919) | 0;
    const perm = seededDerangement(group.length, groupSeed);
    for (let i = 0; i < group.length; i += 1) {
      const donor = group[perm[i]!]!;
      group[i]!.shuffled_history_values = { ...donor.real_history_values };
      group[i]!.shuffled_donor_player_id = donor.player_id;
    }
  }
  return rows;
};

// ---------------------------------------------------------------------------------------------------
// LOOCV engine: baseline = train-fold position mean; feature arms = train-fold-standardized ridge.
// ---------------------------------------------------------------------------------------------------

/** Solve (A)x = b for a small symmetric positive-definite system via Gaussian elimination. */
const solveLinearSystem = (matrix: number[][], rhs: number[]): number[] => {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const pivotValue = a[col]![col]!;
    if (Math.abs(pivotValue) < 1e-12) continue; // degenerate column; coefficient stays 0
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = a[r]![col]! / pivotValue;
      for (let c = col; c <= n; c += 1) a[r]![c]! -= factor * a[col]![c]!;
    }
  }
  return a.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
};

const historyImputationRow = (row: ControlledRunRow, values: Record<string, number | null>): PlayerHistoryImputationRow => ({
  player_id: row.player_id,
  values,
});

interface FoldModelInputs {
  columnNames: string[];
  trainVectors: number[][];
  trainOutcomes: number[];
  heldOutVector: number[];
}

const buildFoldVectors = (
  trainRows: readonly ControlledRunRow[],
  heldOut: ControlledRunRow,
  valuesOf: (row: ControlledRunRow) => Record<string, number | null>,
): FoldModelInputs => {
  const historyNames = CONTROLLED_RUN_HISTORY_COLUMNS.map((column) => column.name);
  // Train-fold-only imputation means (the #104 primitives). The held-out row never contributes.
  const trainImputation = trainRows.map((row) => historyImputationRow(row, valuesOf(row)));
  const means = computePlayerHistoryTrainFoldMeans(trainImputation, historyNames);

  const vectorFor = (row: ControlledRunRow): number[] => {
    const imputationRow = historyImputationRow(row, valuesOf(row));
    const history = historyNames.map((name) => imputePlayerHistoryValue(imputationRow, name, means));
    return [
      ...history,
      row.has_player_history ? 1 : 0,
      row.position === 'QB' ? 1 : 0,
      row.position === 'RB' ? 1 : 0,
      row.position === 'WR' ? 1 : 0,
    ];
  };
  return {
    columnNames: [...historyNames, ...STRUCTURAL_COLUMNS],
    trainVectors: trainRows.map(vectorFor),
    trainOutcomes: trainRows.map((row) => row.outcome),
    heldOutVector: vectorFor(heldOut),
  };
};

/** Ridge with train-fold standardization; the intercept is unpenalized. Returns held-out prediction. */
const ridgePredict = (inputs: FoldModelInputs, lambda: number): number => {
  const p = inputs.columnNames.length;
  const n = inputs.trainVectors.length;
  // Train-fold-only standardization stats.
  const means = new Array<number>(p).fill(0);
  const stds = new Array<number>(p).fill(0);
  for (let j = 0; j < p; j += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += inputs.trainVectors[i]![j]!;
    means[j] = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i += 1) variance += (inputs.trainVectors[i]![j]! - means[j]!) ** 2;
    stds[j] = Math.sqrt(variance / n) || 1;
  }
  const standardize = (vector: number[]): number[] => [1, ...vector.map((value, j) => (value - means[j]!) / stds[j]!)];
  const x = inputs.trainVectors.map(standardize);
  const dims = p + 1;
  const xtx: number[][] = Array.from({ length: dims }, () => new Array<number>(dims).fill(0));
  const xty = new Array<number>(dims).fill(0);
  for (let i = 0; i < n; i += 1) {
    const rowVector = x[i]!;
    for (let a = 0; a < dims; a += 1) {
      xty[a]! += rowVector[a]! * inputs.trainOutcomes[i]!;
      for (let b = a; b < dims; b += 1) xtx[a]![b]! += rowVector[a]! * rowVector[b]!;
    }
  }
  for (let a = 0; a < dims; a += 1) for (let b = 0; b < a; b += 1) xtx[a]![b] = xtx[b]![a]!;
  for (let a = 1; a < dims; a += 1) xtx[a]![a]! += lambda; // intercept (index 0) unpenalized
  const beta = solveLinearSystem(xtx, xty);
  const held = standardize(inputs.heldOutVector);
  let prediction = 0;
  for (let a = 0; a < dims; a += 1) prediction += beta[a]! * held[a]!;
  return prediction;
};

export interface ControlledRunPrediction {
  player_id: string;
  position: string;
  has_player_history: boolean;
  actual: number;
  predictions: Record<ControlledRunArm, number>;
}

/** LOOCV over the run rows. Deterministic: fold order is the (sorted) row order. */
export const runControlledLoocv = (rows: readonly ControlledRunRow[], lambda: number = CONTROLLED_RUN_RIDGE_LAMBDA): ControlledRunPrediction[] => {
  const predictions: ControlledRunPrediction[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const heldOut = rows[i]!;
    const trainRows = rows.filter((_, index) => index !== i);
    // baseline_only: train-fold position mean, no player-history payload consumed.
    const samePosition = trainRows.filter((row) => row.position === heldOut.position);
    const baselinePool = samePosition.length > 0 ? samePosition : trainRows;
    const baseline = baselinePool.reduce((sum, row) => sum + row.outcome, 0) / baselinePool.length;
    const real = ridgePredict(buildFoldVectors(trainRows, heldOut, (row) => row.real_history_values), lambda);
    const shuffled = ridgePredict(buildFoldVectors(trainRows, heldOut, (row) => row.shuffled_history_values), lambda);
    predictions.push({
      player_id: heldOut.player_id,
      position: heldOut.position,
      has_player_history: heldOut.has_player_history,
      actual: heldOut.outcome,
      predictions: { baseline_only: baseline, real_player_history_features: real, shuffled_player_history_control: shuffled },
    });
  }
  return predictions;
};

// ---------------------------------------------------------------------------------------------------
// Metrics (computed ONLY here, for the isolated report).
// ---------------------------------------------------------------------------------------------------

export interface ControlledRunMetrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  pearson: number | null;
  spearman: number | null;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const pearsonOf = (xs: readonly number[], ys: readonly number[]): number | null => {
  if (xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
};

const ranksOf = (values: readonly number[]): number[] => {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.value === indexed[i]!.value) j += 1;
    const averageRank = (i + j) / 2 + 1; // average rank for ties
    for (let k = i; k <= j; k += 1) ranks[indexed[k]!.index] = averageRank;
    i = j + 1;
  }
  return ranks;
};

export const computeControlledRunMetrics = (pairs: ReadonlyArray<{ actual: number; predicted: number }>): ControlledRunMetrics => {
  if (pairs.length === 0) return { n: 0, mae: null, rmse: null, pearson: null, spearman: null };
  const errors = pairs.map((pair) => Math.abs(pair.predicted - pair.actual));
  const actuals = pairs.map((pair) => pair.actual);
  const predicted = pairs.map((pair) => pair.predicted);
  return {
    n: pairs.length,
    mae: mean(errors),
    rmse: Math.sqrt(mean(errors.map((error) => error ** 2))),
    pearson: pearsonOf(predicted, actuals),
    spearman: pearsonOf(ranksOf(predicted), ranksOf(actuals)),
  };
};

// ---------------------------------------------------------------------------------------------------
// Comparisons + decision.
// ---------------------------------------------------------------------------------------------------

export interface ControlledRunArmComparison {
  comparison: string;
  subgroup: string;
  mae_delta: number | null;
  rmse_delta: number | null;
  better_on_mae: string;
}

export interface ControlledRunDecisionRationale {
  decision: ControlledRunDecision;
  primary_metric: 'joined_population_mae';
  real_beats_baseline_on_primary: boolean;
  real_beats_shuffled_on_primary: boolean;
  real_beats_shuffled_on_secondary: boolean;
  secondary_metric: 'joined_population_rmse';
  rationale: string;
}

/**
 * Pre-registered decision rule (from the #102 acceptance interpretation): the real arm must beat BOTH
 * baseline and shuffled control on the primary joined-population MAE, and beat the shuffled control on
 * at least one secondary metric, to be a candidate signal. Failing both comparisons on the primary is
 * no-signal; a mixed outcome is inconclusive. Thresholds are directional, not tuned post hoc.
 */
export const decideControlledRun = (
  joined: Record<ControlledRunArm, ControlledRunMetrics>,
): ControlledRunDecisionRationale => {
  const baselineMae = joined.baseline_only.mae;
  const realMae = joined.real_player_history_features.mae;
  const shuffledMae = joined.shuffled_player_history_control.mae;
  const realRmse = joined.real_player_history_features.rmse;
  const shuffledRmse = joined.shuffled_player_history_control.rmse;
  if (baselineMae === null || realMae === null || shuffledMae === null || realRmse === null || shuffledRmse === null) {
    return {
      decision: 'run_invalid_must_not_use',
      primary_metric: 'joined_population_mae',
      real_beats_baseline_on_primary: false,
      real_beats_shuffled_on_primary: false,
      real_beats_shuffled_on_secondary: false,
      secondary_metric: 'joined_population_rmse',
      rationale: 'A required joined-population metric is undefined; the run is invalid and must not be used.',
    };
  }
  const beatsBaseline = realMae < baselineMae;
  const beatsShuffled = realMae < shuffledMae;
  const beatsShuffledSecondary = realRmse < shuffledRmse;
  let decision: ControlledRunDecision;
  if (beatsBaseline && beatsShuffled && beatsShuffledSecondary) decision = 'candidate_player_history_signal_observed_requires_followup';
  else if (!beatsBaseline && !beatsShuffled) decision = 'no_player_history_signal_observed';
  else decision = 'inconclusive_player_history_result';
  return {
    decision,
    primary_metric: 'joined_population_mae',
    real_beats_baseline_on_primary: beatsBaseline,
    real_beats_shuffled_on_primary: beatsShuffled,
    real_beats_shuffled_on_secondary: beatsShuffledSecondary,
    secondary_metric: 'joined_population_rmse',
    rationale: beatsBaseline && beatsShuffled && beatsShuffledSecondary
      ? 'The real player-history arm beat both the baseline and the position-stratified shuffled control on joined-population MAE, and beat the shuffled control on RMSE. This is an experimental candidate result only -- not a production signal; a follow-up review issue is required before anything further.'
      : !beatsBaseline && !beatsShuffled
        ? 'The real player-history arm beat neither the baseline nor the shuffled control on joined-population MAE. No player-history signal is observed in this controlled run.'
        : 'The comparisons are mixed (the real arm beat one comparator but not the other, or failed the secondary check). The result is inconclusive; no signal is claimed.',
  };
};

// ---------------------------------------------------------------------------------------------------
// Full run + report assembly.
// ---------------------------------------------------------------------------------------------------

export interface ControlledRunReport {
  version: typeof PLAYER_HISTORY_CONTROLLED_RUN_VERSION;
  marking: typeof CONTROLLED_RUN_RESULT_MARKING;
  arms: readonly ControlledRunArm[];
  fold_design: {
    method: 'leave_one_out_cross_validation';
    folds: number;
    imputation: 'train_fold_mean_via_104_primitives';
    standardization: 'train_fold_only_z_score';
    ridge_lambda: number;
    shuffle_seed: number;
    shuffle_method: 'seeded_derangement_within_position_pre_outcome_independent';
  };
  population: {
    evaluated_rows: number;
    joined_rows: number;
    no_history_rows: number;
    by_position: Record<string, number>;
    shuffled_control_integrity: {
      donors_assigned: number;
      self_donations: number;
      cross_position_donations: number;
    };
  };
  metrics_by_arm: {
    overall: Record<ControlledRunArm, ControlledRunMetrics>;
    joined_only: Record<ControlledRunArm, ControlledRunMetrics>;
    no_history_only: Record<ControlledRunArm, ControlledRunMetrics>;
    per_position: Record<string, Record<ControlledRunArm, ControlledRunMetrics>>;
  };
  comparisons: ControlledRunArmComparison[];
  decision: ControlledRunDecisionRationale;
  boundary_statements: {
    isolated_controlled_experiment_only: true;
    source_artifact_remains_candidate_not_promoted: true;
    no_production_forecast_behavior_changed: true;
    no_feature_binding_occurred: true;
    no_product_facing_signal_claimed: true;
    no_fantasy_advice_or_rankings_output: true;
    metrics_exist_only_inside_this_report: true;
  };
}

const metricsForSubset = (
  predictions: readonly ControlledRunPrediction[],
  filter: (prediction: ControlledRunPrediction) => boolean,
): Record<ControlledRunArm, ControlledRunMetrics> => {
  const subset = predictions.filter(filter);
  return Object.fromEntries(
    CONTROLLED_RUN_ARMS.map((arm) => [
      arm,
      computeControlledRunMetrics(subset.map((prediction) => ({ actual: prediction.actual, predicted: prediction.predictions[arm] }))),
    ]),
  ) as Record<ControlledRunArm, ControlledRunMetrics>;
};

/** Execute the full controlled experiment. Pure given its inputs; deterministic for a fixed seed. */
export const executeControlledRun = (
  outcomeMirror: PlayerHistoryOutcomeMirror,
  inputMirror: PlayerHistoryRunPopulationInputMirror,
  gates: ControlledRunPriorGateEvidence,
  shuffleSeed: number = CONTROLLED_RUN_SHUFFLE_SEED,
  lambda: number = CONTROLLED_RUN_RIDGE_LAMBDA,
): { report: ControlledRunReport; predictions: ControlledRunPrediction[] } => {
  assertControlledRunPreconditions(gates, outcomeMirror, inputMirror);
  const rows = buildControlledRunRows(outcomeMirror, inputMirror.rows, shuffleSeed);
  const predictions = runControlledLoocv(rows, lambda);

  const byId = new Map(rows.map((row) => [row.player_id, row]));
  let donorsAssigned = 0;
  let selfDonations = 0;
  let crossPosition = 0;
  for (const row of rows) {
    if (row.shuffled_donor_player_id === null) continue;
    donorsAssigned += 1;
    if (row.shuffled_donor_player_id === row.player_id) selfDonations += 1;
    if (byId.get(row.shuffled_donor_player_id)!.position !== row.position) crossPosition += 1;
  }

  const byPosition: Record<string, number> = {};
  for (const row of rows) byPosition[row.position] = (byPosition[row.position] ?? 0) + 1;

  const overall = metricsForSubset(predictions, () => true);
  const joinedOnly = metricsForSubset(predictions, (prediction) => prediction.has_player_history);
  const noHistoryOnly = metricsForSubset(predictions, (prediction) => !prediction.has_player_history);
  const perPosition: Record<string, Record<ControlledRunArm, ControlledRunMetrics>> = {};
  for (const position of Object.keys(byPosition).sort()) {
    perPosition[position] = metricsForSubset(predictions, (prediction) => prediction.position === position);
  }

  const comparisonPairs: Array<[ControlledRunArm, ControlledRunArm]> = [
    ['baseline_only', 'real_player_history_features'],
    ['baseline_only', 'shuffled_player_history_control'],
    ['real_player_history_features', 'shuffled_player_history_control'],
  ];
  const comparisons: ControlledRunArmComparison[] = [];
  const subgroups: Array<[string, Record<ControlledRunArm, ControlledRunMetrics>]> = [
    ['overall', overall],
    ['joined_only', joinedOnly],
    ['no_history_only', noHistoryOnly],
    ...Object.entries(perPosition).map(([position, metrics]): [string, Record<ControlledRunArm, ControlledRunMetrics>] => [
      `position_${position}`,
      metrics,
    ]),
  ];
  for (const [subgroup, metrics] of subgroups) {
    for (const [armA, armB] of comparisonPairs) {
      const maeA = metrics[armA].mae;
      const maeB = metrics[armB].mae;
      const rmseA = metrics[armA].rmse;
      const rmseB = metrics[armB].rmse;
      comparisons.push({
        comparison: `${armA}_vs_${armB}`,
        subgroup,
        mae_delta: maeA !== null && maeB !== null ? maeB - maeA : null,
        rmse_delta: rmseA !== null && rmseB !== null ? rmseB - rmseA : null,
        better_on_mae: maeA === null || maeB === null ? 'undefined' : maeA < maeB ? armA : maeB < maeA ? armB : 'tie',
      });
    }
  }

  const decision = decideControlledRun(joinedOnly);

  return {
    report: {
      version: PLAYER_HISTORY_CONTROLLED_RUN_VERSION,
      marking: CONTROLLED_RUN_RESULT_MARKING,
      arms: CONTROLLED_RUN_ARMS,
      fold_design: {
        method: 'leave_one_out_cross_validation',
        folds: rows.length,
        imputation: 'train_fold_mean_via_104_primitives',
        standardization: 'train_fold_only_z_score',
        ridge_lambda: lambda,
        shuffle_seed: shuffleSeed,
        shuffle_method: 'seeded_derangement_within_position_pre_outcome_independent',
      },
      population: {
        evaluated_rows: rows.length,
        joined_rows: rows.filter((row) => row.has_player_history).length,
        no_history_rows: rows.filter((row) => !row.has_player_history).length,
        by_position: byPosition,
        shuffled_control_integrity: {
          donors_assigned: donorsAssigned,
          self_donations: selfDonations,
          cross_position_donations: crossPosition,
        },
      },
      metrics_by_arm: { overall, joined_only: joinedOnly, no_history_only: noHistoryOnly, per_position: perPosition },
      comparisons,
      decision,
      boundary_statements: {
        isolated_controlled_experiment_only: true,
        source_artifact_remains_candidate_not_promoted: true,
        no_production_forecast_behavior_changed: true,
        no_feature_binding_occurred: true,
        no_product_facing_signal_claimed: true,
        no_fantasy_advice_or_rankings_output: true,
        metrics_exist_only_inside_this_report: true,
      },
    },
    predictions,
  };
};
