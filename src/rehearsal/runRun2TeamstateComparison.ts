import type { ScoringPosition } from '../contracts/scoring.js';
import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import {
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_TARGET_DEFINITION,
  SEASONAL_PPR_TARGET_SEASON,
  type SeasonalPprErrorSummary,
} from '../contracts/seasonalPprBacktest.js';
import {
  summarizeSeasonalErrors,
  summarizeSeasonalErrorsByPosition,
  type ScoredPair,
} from '../datasets/seasonal/evaluateSeasonalPpr.js';
import { multiply, multiplyVector, solveLinearSystem, transpose } from '../models/seasonal/linearAlgebra.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../services/result.js';
import type { Run2FeatureExclusion } from './runRun2FeatureInclusionPreflight.js';
import {
  bindRun2GovernedTeamstateValues,
  type BindRun2GovernedTeamstateValuesInput,
  type Run2BoundCandidateRow,
  type Run2RecordedCutoff,
} from './runRun2GovernedTeamstateValueBinding.js';
import {
  buildRun2ShuffledTeamstateSanityArm,
  type Run2ShuffledCandidateRow,
} from './runRun2ShuffledTeamstateSanityArm.js';

export const RUN2_TEAMSTATE_COMPARISON_VERSION = 'run2-teamstate-comparison-v1' as const;
/** Ridge L2 penalty; identical to the Run 1 seasonal backtest so the model family/setup is unchanged. */
export const RUN2_COMPARISON_RIDGE_LAMBDA = 1.0;
/** Null Teamstate feature values are imputed to the per-fold training mean — explicit, non-leaky, never raw zero-fill. */
export const RUN2_COMPARISON_NULL_HANDLING = 'train_fold_mean_imputation' as const;
const IMPROVEMENT_EPSILON = 1e-9;
const POSITIONS: readonly ScoringPosition[] = ['QB', 'RB', 'WR', 'TE'];
// Defensive leakage guards: a Teamstate input column must never name pressure / fantasy / target / future.
const FORBIDDEN_FEATURE_SIGNALS = ['pressure', 'fantasy', 'target', 'label', 'outcome', 'future', 'nextseason'];

export type Run2ComparisonStatus = 'completed' | 'fail_closed';

export type Run2SignalInterpretation =
  | 'possible_teamstate_signal'
  | 'suspicious_shuffle_also_improves'
  | 'no_measured_teamstate_lift_in_this_setup'
  | 'failed_sanity_control'
  | 'no_metric_claim_fail_closed';

export type Run2ArmName = 'run1_baseline' | 'real_teamstate_run2' | 'shuffled_teamstate_control';

export interface Run2ArmMetrics {
  arm: Run2ArmName;
  description: string;
  feature_columns: string[];
  teamstate_feature_columns: string[];
  overall: SeasonalPprErrorSummary;
  by_position: Partial<Record<ScoringPosition, SeasonalPprErrorSummary>>;
}

export interface Run2MetricDelta {
  comparison: string;
  /** arm.mae - reference.mae; negative means the arm improved (lower error). */
  mae_delta: number;
  rmse_delta: number;
  correlation_delta: number | null;
  rank_correlation_delta: number | null;
  /** True when MAE strictly decreased (improved) versus the reference. */
  improved: boolean;
}

export interface Run2ComparisonInterpretation {
  primary_metric: 'mae';
  real_teamstate_improved_vs_run1: boolean;
  shuffled_improved_vs_run1: boolean;
  real_improved_vs_shuffled: boolean;
  signal_interpretation: Run2SignalInterpretation;
  failure_reason_if_any: string | null;
  recommendation_for_next_step: string;
  caveats: string[];
}

export interface Run2ArmParity {
  population_player_count: number;
  population_parity_verified: boolean;
  target_definition: string;
  target_parity_verified: boolean;
  input_season: number;
  target_season: number;
  evaluation_method: string;
  fold_parity_verified: boolean;
  run1_feature_values_unchanged_verified: boolean;
}

export interface Run2NullHandlingSummary {
  method: typeof RUN2_COMPARISON_NULL_HANDLING;
  note: string;
  real_run2_imputed_null_cells: number;
  shuffled_control_imputed_null_cells: number;
}

export interface Run2CoverageSummary {
  observation_count: number;
  scored_row_count: number;
  unavailable_row_count: number;
  teamstate_matched_rows: number;
  teamstate_unmatched_rows: number;
  shuffled_rows: number;
}

export interface Run2TeamstateComparisonReport {
  comparison_version: typeof RUN2_TEAMSTATE_COMPARISON_VERSION;
  comparison_status: Run2ComparisonStatus;
  output_kind: 'controlled-backtest-comparison';
  models_trained: boolean;
  evaluation_method: string;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  target_definition: typeof SEASONAL_PPR_TARGET_DEFINITION;
  ridge_lambda: number;
  arm_parity: Run2ArmParity | null;
  coverage: Run2CoverageSummary | null;
  null_handling: Run2NullHandlingSummary | null;
  run1_feature_columns: string[];
  teamstate_feature_columns: string[];
  excluded_columns: Run2FeatureExclusion[];
  pressure_status: 'unavailable_insufficient_data_deferred_excluded';
  target_leakage_status: 'no_target_derived_fields_included';
  arms: Run2ArmMetrics[] | null;
  deltas: Run2MetricDelta[] | null;
  interpretation: Run2ComparisonInterpretation;
  recorded_cutoff: Run2RecordedCutoff | null;
  teamstate_governance: unknown;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  bound_ref: { binding_version: string; binding_status: string; row_count: number } | null;
  shuffled_ref: { sanity_arm_version: string; sanity_arm_status: string; row_count: number } | null;
  readiness_ref: { readiness_version: string; readiness_status: string } | null;
  notes: string[];
}

export interface RunRun2TeamstateComparisonInput extends BindRun2GovernedTeamstateValuesInput {
  /** Deterministic shuffle seed for the control arm; forwarded to the shuffled sanity arm. */
  shuffle_seed?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Conservative interpretation of the three-arm MAE comparison (pure; exported for testing). MAE is the
 * primary metric (lower is better). A shuffled control that beats the real arm fails the sanity check
 * outright; otherwise the real-vs-Run1 and shuffled-vs-Run1 outcomes classify the (single-experiment)
 * signal. This never claims general predictive value.
 */
export const interpretRun2Comparison = (input: {
  run1: SeasonalPprErrorSummary;
  real: SeasonalPprErrorSummary;
  shuffled: SeasonalPprErrorSummary;
}): Pick<
  Run2ComparisonInterpretation,
  | 'real_teamstate_improved_vs_run1'
  | 'shuffled_improved_vs_run1'
  | 'real_improved_vs_shuffled'
  | 'signal_interpretation'
  | 'recommendation_for_next_step'
> => {
  const improved = (arm: number, reference: number): boolean => reference - arm > IMPROVEMENT_EPSILON;
  const realImprovedVsRun1 = improved(input.real.mae, input.run1.mae);
  const shuffledImprovedVsRun1 = improved(input.shuffled.mae, input.run1.mae);
  const realImprovedVsShuffled = improved(input.real.mae, input.shuffled.mae);
  const shuffledBeatsReal = improved(input.shuffled.mae, input.real.mae);

  let signal: Run2SignalInterpretation;
  let recommendation: string;
  if (shuffledBeatsReal) {
    signal = 'failed_sanity_control';
    recommendation =
      'The shuffled control beat the real arm: do NOT attribute any improvement to Teamstate. Investigate join/leakage/variance before any further Run 2 work.';
  } else if (realImprovedVsRun1 && !shuffledImprovedVsRun1) {
    signal = 'possible_teamstate_signal';
    recommendation =
      'Real Teamstate improved while the shuffled control did not. Treat as a single-experiment hint only; replicate with more coverage/seasons before any claim.';
  } else if (realImprovedVsRun1 && shuffledImprovedVsRun1) {
    signal = 'suspicious_shuffle_also_improves';
    recommendation =
      'Both real and shuffled arms improved vs Run 1, so the lift is likely structural/spurious rather than Teamstate signal. Investigate before any claim.';
  } else {
    signal = 'no_measured_teamstate_lift_in_this_setup';
    recommendation =
      'No measured Teamstate lift over Run 1 in this controlled setup. No further action required beyond recording the null result.';
  }

  return {
    real_teamstate_improved_vs_run1: realImprovedVsRun1,
    shuffled_improved_vs_run1: shuffledImprovedVsRun1,
    real_improved_vs_shuffled: realImprovedVsShuffled,
    signal_interpretation: signal,
    recommendation_for_next_step: recommendation,
  };
};

interface ArmRow {
  player_id: string;
  position: ScoringPosition;
  actual: number;
  features: Record<string, number | null>;
}

const positionDummies = (position: ScoringPosition): number[] =>
  POSITIONS.filter((candidate) => candidate !== 'TE').map((candidate) => (candidate === position ? 1 : 0));

// Per-column mean over the non-null training values; a fully-null column imputes to 0 (and standardizes to 0).
const imputeMeansFor = (rows: ArmRow[], columns: string[]): Record<string, number> => {
  const means: Record<string, number> = {};
  for (const column of columns) {
    let sum = 0;
    let count = 0;
    for (const row of rows) {
      const value = row.features[column];
      if (typeof value === 'number' && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
    means[column] = count > 0 ? sum / count : 0;
  }
  return means;
};

const imputed = (row: ArmRow, column: string, means: Record<string, number>): number => {
  const value = row.features[column];
  return typeof value === 'number' && Number.isFinite(value) ? value : means[column]!;
};

// Standardization statistics from the (imputed) training rows only — no leakage from the held-out row.
const standardizationStats = (
  rows: ArmRow[],
  columns: string[],
  means: Record<string, number>,
): { center: Record<string, number>; scale: Record<string, number> } => {
  const center: Record<string, number> = {};
  const scale: Record<string, number> = {};
  for (const column of columns) {
    const values = rows.map((row) => imputed(row, column, means));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    center[column] = mean;
    scale[column] = std < 1e-9 ? 1 : std;
  }
  return { center, scale };
};

const designRow = (
  row: ArmRow,
  columns: string[],
  means: Record<string, number>,
  center: Record<string, number>,
  scale: Record<string, number>,
): number[] => [
  1,
  ...columns.map((column) => (imputed(row, column, means) - center[column]!) / scale[column]!),
  ...positionDummies(row.position),
];

/** Leave-one-out cross-validated ridge predictions, matching the Run 1 seasonal backtest's method. */
const loocvPredictions = (scored: ArmRow[], columns: string[]): Map<string, number> => {
  const predictions = new Map<string, number>();
  for (const target of scored) {
    const train = scored.filter((row) => row.player_id !== target.player_id);
    const means = imputeMeansFor(train, columns);
    const { center, scale } = standardizationStats(train, columns, means);
    const design = train.map((row) => designRow(row, columns, means, center, scale));
    const targets = train.map((row) => row.actual);
    const xt = transpose(design);
    const xtx = multiply(xt, design);
    for (let i = 1; i < xtx.length; i += 1) xtx[i]![i]! += RUN2_COMPARISON_RIDGE_LAMBDA;
    const coefficients = solveLinearSystem(xtx, multiplyVector(xt, targets));
    const targetDesign = designRow(target, columns, means, center, scale);
    const raw = targetDesign.reduce((sum, value, index) => sum + value * coefficients[index]!, 0);
    predictions.set(target.player_id, Math.max(0, raw));
  }
  return predictions;
};

const toPairs = (scored: ArmRow[], predictions: Map<string, number>): ScoredPair[] =>
  scored.map((row) => ({ position: row.position, predicted: predictions.get(row.player_id)!, actual: row.actual }));

const armMetrics = (
  arm: Run2ArmName,
  description: string,
  featureColumns: string[],
  teamstateColumns: string[],
  scored: ArmRow[],
): Run2ArmMetrics => {
  const pairs = toPairs(scored, loocvPredictions(scored, featureColumns));
  return {
    arm,
    description,
    feature_columns: featureColumns,
    teamstate_feature_columns: teamstateColumns,
    overall: summarizeSeasonalErrors(pairs),
    by_position: summarizeSeasonalErrorsByPosition(pairs),
  };
};

const round6 = (value: number): number => Number(value.toFixed(6));

const delta = (comparison: string, arm: SeasonalPprErrorSummary, reference: SeasonalPprErrorSummary): Run2MetricDelta => ({
  comparison,
  mae_delta: round6(arm.mae - reference.mae),
  rmse_delta: round6(arm.rmse - reference.rmse),
  correlation_delta: arm.correlation != null && reference.correlation != null ? round6(arm.correlation - reference.correlation) : null,
  rank_correlation_delta:
    arm.rank_correlation != null && reference.rank_correlation != null ? round6(arm.rank_correlation - reference.rank_correlation) : null,
  improved: reference.mae - arm.mae > IMPROVEMENT_EPSILON,
});

const countNullCells = (scored: ArmRow[], columns: string[]): number =>
  scored.reduce(
    (total, row) => total + columns.filter((column) => !(typeof row.features[column] === 'number' && Number.isFinite(row.features[column]))).length,
    0,
  );

const EVALUATION_METHOD =
  'Leave-one-out cross-validation (LOOCV) over scored rows; ridge (lambda=1.0) over standardized features + position one-hot, identical across all three arms (same population, target, folds, model family).';

/**
 * Executes the three-arm Run 2 comparison — Run 1 baseline, real governed Teamstate Run 2, and the
 * shuffled-Teamstate control — under one identical evaluation setup, and emits a machine-readable
 * report with metrics, deltas, and conservative interpretation flags.
 *
 * It is grounded in (and never bypasses) the chain: `bindRun2GovernedTeamstateValues` →
 * `buildRun2ShuffledTeamstateSanityArm` → controlled comparison. It fails closed (no metric claim) if
 * the governed bind is not ready, the shuffled control is not ready/no-op, or arm parity cannot be
 * proven (population / target / folds / Run 1 feature values / leakage). Only Teamstate feature columns
 * differ between arms; pressure / fantasy / target-leakage fields are never used as inputs; null
 * Teamstate values are imputed to the per-fold training mean (explicit, non-leaky), never raw-zero-filled.
 *
 * This is one controlled experiment — NOT proof of general predictive value, not a product output, and
 * not a promotion.
 */
export const runRun2TeamstateComparison = (
  input: unknown,
  options: RunRun2TeamstateComparisonInput = {},
): ServiceResult<Run2TeamstateComparisonReport> => {
  if (!isRecord(input)) {
    return serviceFailure({ code: 'RUN2_COMPARISON_INPUT_INVALID', message: 'Run 2 comparison input must be an object.' });
  }

  const boundResult = bindRun2GovernedTeamstateValues(input, options);
  if (!boundResult.ok) return boundResult;
  const bound = boundResult.data;
  const shuffledResult = buildRun2ShuffledTeamstateSanityArm(input, options);
  if (!shuffledResult.ok) return shuffledResult;
  const shuffled = shuffledResult.data;

  const recordedCutoff = bound.recorded_cutoff;
  const boundRef = { binding_version: bound.binding_version, binding_status: bound.binding_status, row_count: bound.row_count };
  const shuffledRef = {
    sanity_arm_version: shuffled.sanity_arm_version,
    sanity_arm_status: shuffled.sanity_arm_status,
    row_count: shuffled.row_count,
  };

  const failClosed = (reason: string, extraNotes: string[] = []): ServiceResult<Run2TeamstateComparisonReport> =>
    serviceSuccess({
      comparison_version: RUN2_TEAMSTATE_COMPARISON_VERSION,
      comparison_status: 'fail_closed',
      output_kind: 'controlled-backtest-comparison',
      models_trained: false,
      evaluation_method: EVALUATION_METHOD,
      input_season: SEASONAL_PPR_INPUT_SEASON,
      target_season: SEASONAL_PPR_TARGET_SEASON,
      target_definition: SEASONAL_PPR_TARGET_DEFINITION,
      ridge_lambda: RUN2_COMPARISON_RIDGE_LAMBDA,
      arm_parity: null,
      coverage: null,
      null_handling: null,
      run1_feature_columns: bound.run1_feature_columns,
      teamstate_feature_columns: bound.teamstate_feature_columns,
      excluded_columns: bound.excluded_columns,
      pressure_status: 'unavailable_insufficient_data_deferred_excluded',
      target_leakage_status: 'no_target_derived_fields_included',
      arms: null,
      deltas: null,
      interpretation: {
        primary_metric: 'mae',
        real_teamstate_improved_vs_run1: false,
        shuffled_improved_vs_run1: false,
        real_improved_vs_shuffled: false,
        signal_interpretation: 'no_metric_claim_fail_closed',
        failure_reason_if_any: reason,
        recommendation_for_next_step: `Resolve the fail-closed condition before any metric claim: ${reason}`,
        caveats: ['Failed closed: no metrics were computed and no comparison claim may be made.'],
      },
      recorded_cutoff: recordedCutoff,
      teamstate_governance: bound.teamstate_governance,
      source_artifact_refs: bound.source_artifact_refs,
      validation_refs: bound.validation_refs,
      lineage_refs: bound.lineage_refs,
      bound_ref: boundRef,
      shuffled_ref: shuffledRef,
      readiness_ref: bound.readiness_ref,
      notes: [
        'Run 2 three-arm comparison failed closed; this report makes NO metric claim.',
        ...extraNotes,
      ],
    });

  // --- Readiness guardrails (fail closed) ---
  if (bound.binding_status !== 'governed_teamstate_values_bound') {
    return failClosed(`governed Teamstate binding not ready (binding_status: ${bound.binding_status})`);
  }
  if (shuffled.sanity_arm_status !== 'shuffled_teamstate_values_ready') {
    return failClosed(`shuffled Teamstate control not ready (sanity_arm_status: ${shuffled.sanity_arm_status})`);
  }
  if (shuffled.shuffle_coverage.shuffled_row_count === 0) {
    return failClosed('shuffled control is a no-op (zero rows were permuted away from their team)');
  }

  const run1Columns = bound.run1_feature_columns;
  const teamstateColumns = [...bound.teamstate_feature_columns, ...bound.partial_null_columns];

  // --- Leakage guardrails (fail closed) ---
  const leakyTeamstate = teamstateColumns.find((column) =>
    FORBIDDEN_FEATURE_SIGNALS.some((signal) => column.toLowerCase().includes(signal)),
  );
  if (leakyTeamstate !== undefined) {
    return failClosed(`a Teamstate input column names a pressure/fantasy/target/leakage field: ${leakyTeamstate}`);
  }
  // Run 1 columns are the audited 2024 box-score feature set (e.g. targets_2024 is a legitimate input).
  // The real risk is the label/target-season leaking in, so check precisely: the 2025 target season or
  // the exact label name — never a broad "target" substring that would false-flag targets_2024.
  if (run1Columns.some((column) => column.toLowerCase().includes('2025') || column.toLowerCase() === 'ppr_2025_actual')) {
    return failClosed('a Run 1 feature column names the target season / label');
  }
  // A Teamstate column that shadows a Run 1 feature name (e.g. ppr_2024) would overwrite the Run 1
  // value when the arm-row feature objects are merged, so the arm would no longer be "Run 1 + Teamstate".
  // Reject any name overlap before building rows so the unchanged-Run-1 guarantee always holds.
  const run1ColumnSet = new Set(run1Columns);
  const shadowingColumn = teamstateColumns.find((column) => run1ColumnSet.has(column));
  if (shadowingColumn !== undefined) {
    return failClosed(`a Teamstate feature column shadows a Run 1 feature column: ${shadowingColumn}`);
  }

  // --- Parity guardrails: same population / target / folds / unchanged Run 1 values (fail closed) ---
  const boundById = new Map(bound.bound_rows.map((row) => [row.player_id, row]));
  const shuffledById = new Map(shuffled.shuffled_rows.map((row) => [row.player_id, row]));
  if (boundById.size !== bound.bound_rows.length || shuffledById.size !== shuffled.shuffled_rows.length) {
    return failClosed('duplicate player_id rows detected; cannot prove population parity');
  }
  const boundIds = [...boundById.keys()].sort();
  const shuffledIds = [...shuffledById.keys()].sort();
  if (boundIds.length !== shuffledIds.length || boundIds.some((id, index) => id !== shuffledIds[index])) {
    return failClosed('bound and shuffled arms do not share the same player population');
  }

  const usableActual = (row: Run2BoundCandidateRow | Run2ShuffledCandidateRow): boolean =>
    row.target.value != null && Number.isFinite(row.target.value);

  for (const id of boundIds) {
    const boundRow = boundById.get(id)!;
    const shuffledRow = shuffledById.get(id)!;
    // Target parity: same target column, same label-only value, both arms.
    if (boundRow.target.column !== 'ppr_2025_actual' || boundRow.target.role !== 'label_only') {
      return failClosed(`row ${id} target is not the label-only ppr_2025_actual`);
    }
    if (boundRow.target.value !== shuffledRow.target.value) {
      return failClosed(`row ${id} target value differs between arms`);
    }
    // Run 1 feature values must be byte-identical across arms (never mutated).
    if (JSON.stringify(boundRow.run1_feature_values) !== JSON.stringify(shuffledRow.run1_feature_values)) {
      return failClosed(`row ${id} Run 1 feature values differ between arms (mutation detected)`);
    }
    // Identity / seasons parity.
    if (boundRow.position !== shuffledRow.position || boundRow.team_2024 !== shuffledRow.team_2024) {
      return failClosed(`row ${id} identity differs between arms`);
    }
    if (boundRow.input_season !== SEASONAL_PPR_INPUT_SEASON || boundRow.target_season !== SEASONAL_PPR_TARGET_SEASON) {
      return failClosed(`row ${id} input/target season differs from the Run 1 setup`);
    }
  }

  // Shared scored population (rows with a usable 2025 actual), identical across arms by construction.
  const scoredIds = boundIds.filter((id) => usableActual(boundById.get(id)!));
  if (scoredIds.length < 4) {
    return failClosed(`too few scored rows for a stable LOOCV comparison (found ${scoredIds.length})`);
  }

  const armARows: ArmRow[] = scoredIds.map((id) => {
    const row = boundById.get(id)!;
    return { player_id: id, position: row.position, actual: row.target.value as number, features: { ...row.run1_feature_values } };
  });
  const armBRows: ArmRow[] = scoredIds.map((id) => {
    const row = boundById.get(id)!;
    return {
      player_id: id,
      position: row.position,
      actual: row.target.value as number,
      features: { ...row.run1_feature_values, ...row.teamstate_feature_values, ...row.teamstate_partial_null_values },
    };
  });
  const armCRows: ArmRow[] = scoredIds.map((id) => {
    const row = shuffledById.get(id)!;
    return {
      player_id: id,
      position: row.position,
      actual: row.target.value as number,
      features: { ...row.run1_feature_values, ...row.teamstate_feature_values, ...row.teamstate_partial_null_values },
    };
  });

  const run1Arm = armMetrics('run1_baseline', 'Run 1 box-score baseline: ridge over 2024 features + position, LOOCV.', run1Columns, [], armARows);
  const realArm = armMetrics(
    'real_teamstate_run2',
    'Run 1 features plus real governed bound Teamstate features, same LOOCV setup.',
    [...run1Columns, ...teamstateColumns],
    teamstateColumns,
    armBRows,
  );
  const shuffledArm = armMetrics(
    'shuffled_teamstate_control',
    'Run 1 features plus SHUFFLED Teamstate features (destroyed-signal control), same LOOCV setup.',
    [...run1Columns, ...teamstateColumns],
    teamstateColumns,
    armCRows,
  );

  const deltas: Run2MetricDelta[] = [
    delta('real_teamstate_run2_minus_run1_baseline', realArm.overall, run1Arm.overall),
    delta('shuffled_teamstate_control_minus_run1_baseline', shuffledArm.overall, run1Arm.overall),
    delta('real_teamstate_run2_minus_shuffled_teamstate_control', realArm.overall, shuffledArm.overall),
  ];

  const interpretationCore = interpretRun2Comparison({
    run1: run1Arm.overall,
    real: realArm.overall,
    shuffled: shuffledArm.overall,
  });

  const matchedRows = bound.bound_rows.filter((row) => row.teamstate_binding_matched).length;
  const coverage: Run2CoverageSummary = {
    observation_count: bound.bound_rows.length,
    scored_row_count: scoredIds.length,
    unavailable_row_count: bound.bound_rows.length - scoredIds.length,
    teamstate_matched_rows: matchedRows,
    teamstate_unmatched_rows: bound.bound_rows.length - matchedRows,
    shuffled_rows: shuffled.shuffle_coverage.shuffled_row_count,
  };

  const armParity: Run2ArmParity = {
    population_player_count: scoredIds.length,
    population_parity_verified: true,
    target_definition: SEASONAL_PPR_TARGET_DEFINITION,
    target_parity_verified: true,
    input_season: SEASONAL_PPR_INPUT_SEASON,
    target_season: SEASONAL_PPR_TARGET_SEASON,
    evaluation_method: EVALUATION_METHOD,
    fold_parity_verified: true,
    run1_feature_values_unchanged_verified: true,
  };

  const nullHandling: Run2NullHandlingSummary = {
    method: RUN2_COMPARISON_NULL_HANDLING,
    note: 'Null Teamstate feature values are imputed to the per-fold TRAINING column mean (standardized to 0 / ridge-neutral); explicit and non-leaky. Individual missing cells are never silently raw-zero-filled. The only use of 0 is the documented neutral fallback when a column is fully null across the training fold (no mean exists), which still standardizes to a ridge-neutral 0.',
    real_run2_imputed_null_cells: countNullCells(armBRows, teamstateColumns),
    shuffled_control_imputed_null_cells: countNullCells(armCRows, teamstateColumns),
  };

  return serviceSuccess({
    comparison_version: RUN2_TEAMSTATE_COMPARISON_VERSION,
    comparison_status: 'completed',
    output_kind: 'controlled-backtest-comparison',
    models_trained: true,
    evaluation_method: EVALUATION_METHOD,
    input_season: SEASONAL_PPR_INPUT_SEASON,
    target_season: SEASONAL_PPR_TARGET_SEASON,
    target_definition: SEASONAL_PPR_TARGET_DEFINITION,
    ridge_lambda: RUN2_COMPARISON_RIDGE_LAMBDA,
    arm_parity: armParity,
    coverage,
    null_handling: nullHandling,
    run1_feature_columns: run1Columns,
    teamstate_feature_columns: teamstateColumns,
    excluded_columns: bound.excluded_columns,
    pressure_status: 'unavailable_insufficient_data_deferred_excluded',
    target_leakage_status: 'no_target_derived_fields_included',
    arms: [run1Arm, realArm, shuffledArm],
    deltas,
    interpretation: { primary_metric: 'mae', ...interpretationCore, failure_reason_if_any: null, caveats: [
      'One controlled experiment on a small fixture-scale population; NOT proof of general predictive value.',
      'MAE is the primary metric; correlation/rank-correlation are secondary and reported for transparency.',
      'Real and shuffled arms differ only in Teamstate values; identical population, target, folds, model family, and Run 1 features.',
    ] },
    recorded_cutoff: recordedCutoff,
    teamstate_governance: bound.teamstate_governance,
    source_artifact_refs: bound.source_artifact_refs,
    validation_refs: bound.validation_refs,
    lineage_refs: bound.lineage_refs,
    bound_ref: boundRef,
    shuffled_ref: shuffledRef,
    readiness_ref: bound.readiness_ref,
    notes: [
      'Three-arm Run 2 controlled comparison: Run 1 baseline vs real governed Teamstate vs shuffled-Teamstate control, under one identical LOOCV setup.',
      'Controlled backtest only: no production promotion, no product/advice output, no rankings/start-sit/trade/draft, and no claim that Teamstate is proven predictive in general.',
      'Pressure stays unavailable/insufficient_data/deferred and excluded; fantasy split and target/future/leakage fields are never used as inputs; null Teamstate values use documented train-fold mean imputation (never raw zero-fill).',
    ],
  });
};
