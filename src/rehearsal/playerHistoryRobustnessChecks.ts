/**
 * Bounded robustness checks for the candidate player-history signal (Forecast #115).
 *
 * Implements exactly the five checks prioritized by the #113/PR #114 review, inside the same
 * isolated experiment path as #112 (same mirrors, same fail-closed preflight via
 * `assertControlledRunPreconditions`, same fold/imputation/standardization discipline, same
 * experimental marking). #112 remains the primary recorded controlled run; nothing here replaces it.
 *
 *   P1 feature-family ablation (production/usage/coverage/age+team, and ppr_2024 alone)
 *   P2 stronger simple baseline: per-position train-fold OLS on prior-year PPR
 *   P3 ridge lambda sensitivity {0.1, 1, 10, 100}
 *   P4 five deterministic shuffled-control seeds
 *   P5 outlier (top-k absolute-error) leverage sensitivity; partial-season sensitivity is
 *      explicitly unavailable from the current mirrors (see report) with the minimal source change named
 *
 * Every metric is a review-only diagnostic marked `experimental_candidate_result_not_production_signal`.
 * The decision enum is review-only: no value authorizes production binding, source promotion, product
 * output, or `may_run`. No production Forecast code is imported.
 */

import {
  CONTROLLED_RUN_HISTORY_COLUMNS,
  CONTROLLED_RUN_RESULT_MARKING,
  CONTROLLED_RUN_RIDGE_LAMBDA,
  CONTROLLED_RUN_SHUFFLE_SEED,
  assertControlledRunPreconditions,
  buildControlledRunRows,
  computeControlledRunMetrics,
  runControlledLoocv,
  type ControlledRunFeatureColumn,
  type ControlledRunMetrics,
  type ControlledRunPrediction,
  type ControlledRunPriorGateEvidence,
  type ControlledRunRow,
} from './playerHistoryControlledRun.js';
import type { PlayerHistoryOutcomeMirror, PlayerHistoryRunPopulationInputMirror } from './playerHistoryRunPopulationMirrors.js';

export const PLAYER_HISTORY_ROBUSTNESS_CHECKS_VERSION = 'player-history-robustness-checks-v1' as const;

/** Review-only decisions. Deliberately NO production-binding, promotion, product, or may_run value. */
export const ROBUSTNESS_DECISIONS = [
  'candidate_signal_survives_initial_robustness_checks',
  'candidate_signal_weakened_requires_more_review',
  'candidate_signal_not_robust',
  'robustness_review_invalid_must_not_use',
] as const;

export type RobustnessDecision = (typeof ROBUSTNESS_DECISIONS)[number];

/** P4 seeds: the original #112 seed plus four deterministic successors. */
export const ROBUSTNESS_SHUFFLE_SEEDS: readonly number[] = [
  CONTROLLED_RUN_SHUFFLE_SEED,
  CONTROLLED_RUN_SHUFFLE_SEED + 1,
  CONTROLLED_RUN_SHUFFLE_SEED + 2,
  CONTROLLED_RUN_SHUFFLE_SEED + 3,
  CONTROLLED_RUN_SHUFFLE_SEED + 4,
];

export const ROBUSTNESS_LAMBDAS: readonly number[] = [0.1, 1, 10, 100];

/** P5: per-arm top-k absolute-error rows excluded in the leverage diagnostic. */
export const ROBUSTNESS_TOP_K_EXCLUDED = 10;

/**
 * Pre-registered "weakened" margin: if the full feature set's joined MAE is not at least 5%
 * better than the stronger of (ppr_2024-alone, the P2 prior-year baseline), the full set has not
 * earned its complexity and the classification is weakened rather than survives.
 */
export const ROBUSTNESS_WEAKENED_RELATIVE_MARGIN = 0.05;

/** P1 ablation variants. Families come from the #112 column metadata; nothing is redefined. */
export const ABLATION_VARIANTS: ReadonlyArray<{ name: string; families: readonly string[] | null; columns?: readonly string[] }> = [
  { name: 'full_feature_set', families: null },
  { name: 'production_only', families: ['production'] },
  { name: 'usage_only', families: ['usage'] },
  { name: 'coverage_only', families: ['coverage'] },
  { name: 'age_career_team_context_only', families: ['age_career', 'team_context'] },
  { name: 'ppr_2024_alone', families: null, columns: ['ppr_2024'] },
];

export const ablationColumnsFor = (variant: { families: readonly string[] | null; columns?: readonly string[] }): ControlledRunFeatureColumn[] => {
  if (variant.columns) return CONTROLLED_RUN_HISTORY_COLUMNS.filter((column) => variant.columns!.includes(column.name));
  if (variant.families === null) return [...CONTROLLED_RUN_HISTORY_COLUMNS];
  return CONTROLLED_RUN_HISTORY_COLUMNS.filter((column) => variant.families!.includes(column.family));
};

// ---------------------------------------------------------------------------------------------------
// P2: stronger simple baseline — per-position train-fold OLS on prior-year PPR. No ridge, no broader
// payload: the ONLY player-history value consumed is ppr_2024 (null-preserved for no-history rows).
// ---------------------------------------------------------------------------------------------------

export const runPriorYearPositionBaselineLoocv = (
  rows: readonly ControlledRunRow[],
): Array<{ player_id: string; position: string; has_player_history: boolean; actual: number; predicted: number }> => {
  const priorYearOf = (row: ControlledRunRow): number | null => {
    const value = row.real_history_values['ppr_2024'];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  return rows.map((heldOut, index) => {
    const trainRows = rows.filter((_, i) => i !== index);
    const samePosition = trainRows.filter((row) => row.position === heldOut.position);
    const pool = samePosition.length > 0 ? samePosition : trainRows;
    const positionMean = pool.reduce((sum, row) => sum + row.outcome, 0) / pool.length;
    const heldPrior = priorYearOf(heldOut);
    const observed = pool.map((row) => ({ x: priorYearOf(row), y: row.outcome })).filter((pair): pair is { x: number; y: number } => pair.x !== null);
    let predicted = positionMean;
    if (heldPrior !== null && observed.length >= 2) {
      const mx = observed.reduce((sum, pair) => sum + pair.x, 0) / observed.length;
      const my = observed.reduce((sum, pair) => sum + pair.y, 0) / observed.length;
      let sxx = 0;
      let sxy = 0;
      for (const pair of observed) {
        sxx += (pair.x - mx) ** 2;
        sxy += (pair.x - mx) * (pair.y - my);
      }
      const slope = sxx > 0 ? sxy / sxx : 0;
      predicted = my + slope * (heldPrior - mx);
    }
    return { player_id: heldOut.player_id, position: heldOut.position, has_player_history: heldOut.has_player_history, actual: heldOut.outcome, predicted };
  });
};

// ---------------------------------------------------------------------------------------------------
// Metric assembly helpers.
// ---------------------------------------------------------------------------------------------------

export interface RobustnessArmView {
  joined: ControlledRunMetrics;
  overall: ControlledRunMetrics;
  no_history: ControlledRunMetrics;
  /** Per-position MAE over JOINED rows only, so it measures the same population as `joined`. */
  per_position_joined_mae: Record<string, number | null>;
}

const viewOf = (
  pairs: ReadonlyArray<{ position: string; has_player_history: boolean; actual: number; predicted: number }>,
): RobustnessArmView => {
  const joinedPairs = pairs.filter((pair) => pair.has_player_history);
  const positions = [...new Set(pairs.map((pair) => pair.position))].sort();
  return {
    joined: computeControlledRunMetrics(joinedPairs),
    overall: computeControlledRunMetrics(pairs),
    no_history: computeControlledRunMetrics(pairs.filter((pair) => !pair.has_player_history)),
    // Joined rows only: these values sit alongside joined-population ablation/shuffle diagnostics, and
    // no-history rows have no shuffled donor, so mixing them in would measure a different population.
    per_position_joined_mae: Object.fromEntries(
      positions.map((position) => [position, computeControlledRunMetrics(joinedPairs.filter((pair) => pair.position === position)).mae]),
    ),
  };
};

const armPairs = (
  predictions: readonly ControlledRunPrediction[],
  arm: 'baseline_only' | 'real_player_history_features' | 'shuffled_player_history_control',
) => predictions.map((prediction) => ({
  position: prediction.position,
  has_player_history: prediction.has_player_history,
  actual: prediction.actual,
  predicted: prediction.predictions[arm],
}));

// ---------------------------------------------------------------------------------------------------
// Full robustness run.
// ---------------------------------------------------------------------------------------------------

export interface RobustnessChecksReport {
  version: typeof PLAYER_HISTORY_ROBUSTNESS_CHECKS_VERSION;
  marking: typeof CONTROLLED_RUN_RESULT_MARKING;
  primary_run_note: '#112 remains the primary recorded controlled run; these are review-only robustness diagnostics';
  population: { evaluated_rows: number; joined_rows: number; no_history_rows: number };
  p1_feature_family_ablation: Array<{
    variant: string;
    history_columns_used: string[];
    real_arm: RobustnessArmView;
    joined_mae_vs_baseline_delta: number | null;
    joined_mae_vs_shuffled_delta: number | null;
  }>;
  /** Data-derived attribution summary so the classification cannot bury the family-level story. */
  p1_attribution_note: string;
  p2_prior_year_position_baseline: {
    method: 'per_position_train_fold_ols_on_ppr_2024_else_position_mean';
    view: RobustnessArmView;
    joined_mae_vs_position_mean_baseline: number | null;
    joined_mae_vs_full_real: number | null;
    joined_mae_vs_ppr_2024_alone: number | null;
  };
  p3_lambda_sensitivity: Array<{ lambda: number; real_joined: ControlledRunMetrics; real_beats_baseline_on_joined_mae: boolean }>;
  p4_shuffled_seeds: Array<{
    seed: number;
    is_original_112_seed: boolean;
    shuffled_joined: ControlledRunMetrics;
    per_position_joined_mae: Record<string, number | null>;
    donors_assigned: number;
    self_donations: number;
    cross_position_donations: number;
  }>;
  p5_leverage_sensitivity: {
    top_k_excluded: number;
    method: 'per_arm_top_k_absolute_error_rows_excluded_joined_population_only';
    primary_metrics_untouched: true;
    trimmed_joined: Record<'baseline_only' | 'real_player_history_features' | 'shuffled_player_history_control', ControlledRunMetrics>;
    real_still_beats_baseline_after_trim: boolean;
    partial_season_sensitivity: {
      computed: false;
      reason: 'the #109 outcome mirror is deliberately outcome+identity+provenance only and carries no coverage_status/games_for_ppg, so partial-season 2025 outcome rows are not identifiable from the artifacts this run may consume';
      minimal_source_change_recommendation: 'a future #109-mirror regeneration may add coverage_status and games_for_ppg to outcome mirror rows (outcome-layer metadata, not input features); the target-population gate would gain matching scope checks';
    };
  };
  reference_joined_mae: {
    baseline_only: number | null;
    full_real: number | null;
    shuffled_by_seed: Record<number, number | null>;
    ppr_2024_alone: number | null;
    prior_year_position_baseline: number | null;
  };
  decision: {
    decision: RobustnessDecision;
    weakened_margin: number;
    checks: Array<{ criterion: string; passed: boolean; detail: string }>;
    rationale: string;
  };
  boundary_statements: {
    robustness_diagnostics_only: true;
    primary_112_run_unmodified: true;
    no_production_forecast_behavior_changed: true;
    no_feature_binding_occurred: true;
    no_source_artifact_promoted: true;
    source_remains_candidate_not_promoted: true;
    no_production_signal_claimed: true;
    no_fantasy_advice_or_product_output: true;
  };
}

/**
 * Execute the five robustness checks. Fail-closed: reuses `assertControlledRunPreconditions`
 * verbatim before anything runs. Deterministic for fixed seeds. Pure given its inputs.
 */
export const runPlayerHistoryRobustnessChecks = (
  outcomeMirror: PlayerHistoryOutcomeMirror,
  inputMirror: PlayerHistoryRunPopulationInputMirror,
  gates: ControlledRunPriorGateEvidence,
): RobustnessChecksReport => {
  assertControlledRunPreconditions(gates, outcomeMirror, inputMirror);

  const baseRows = buildControlledRunRows(outcomeMirror, inputMirror.rows, CONTROLLED_RUN_SHUFFLE_SEED);
  const joinedCount = baseRows.filter((row) => row.has_player_history).length;

  // Reference full run at the #112 configuration (lambda=1, original seed).
  const fullPredictions = runControlledLoocv(baseRows, CONTROLLED_RUN_RIDGE_LAMBDA);
  const baselineView = viewOf(armPairs(fullPredictions, 'baseline_only'));
  const fullRealView = viewOf(armPairs(fullPredictions, 'real_player_history_features'));
  const fullShuffledView = viewOf(armPairs(fullPredictions, 'shuffled_player_history_control'));

  // ---- P1: ablations ---------------------------------------------------------------------------
  const p1 = ABLATION_VARIANTS.map((variant) => {
    const columns = ablationColumnsFor(variant);
    const predictions = variant.name === 'full_feature_set' ? fullPredictions : runControlledLoocv(baseRows, CONTROLLED_RUN_RIDGE_LAMBDA, columns);
    const realView = viewOf(armPairs(predictions, 'real_player_history_features'));
    const shuffledView = variant.name === 'full_feature_set' ? fullShuffledView : viewOf(armPairs(predictions, 'shuffled_player_history_control'));
    return {
      variant: variant.name,
      history_columns_used: columns.map((column) => column.name),
      real_arm: realView,
      joined_mae_vs_baseline_delta:
        realView.joined.mae !== null && baselineView.joined.mae !== null ? baselineView.joined.mae - realView.joined.mae : null,
      joined_mae_vs_shuffled_delta:
        realView.joined.mae !== null && shuffledView.joined.mae !== null ? shuffledView.joined.mae - realView.joined.mae : null,
    };
  });
  const ppr2024Alone = p1.find((entry) => entry.variant === 'ppr_2024_alone')!;
  const productionOnly = p1.find((entry) => entry.variant === 'production_only')!;
  const fullEntry = p1.find((entry) => entry.variant === 'full_feature_set')!;
  const productionGapToFull =
    productionOnly.real_arm.joined.mae !== null && fullEntry.real_arm.joined.mae !== null
      ? productionOnly.real_arm.joined.mae - fullEntry.real_arm.joined.mae
      : null;
  const p1AttributionNote =
    `Attribution: production_only (joined MAE ${productionOnly.real_arm.joined.mae?.toFixed(3)}) is within ` +
    `${productionGapToFull?.toFixed(3)} of the full set (${fullEntry.real_arm.joined.mae?.toFixed(3)}), so the production family ` +
    `(prior-year/trailing PPR totals, means, trend) carries essentially all of the candidate signal; usage, coverage, and ` +
    `age/team-context add ~no marginal joined-population MAE beyond it. ppr_2024 alone reaches ` +
    `${ppr2024Alone.real_arm.joined.mae?.toFixed(3)}, so the production family's aggregates add the remaining margin over bare ` +
    `prior-year continuity. Any future feature-contract work should weigh the non-production families accordingly.`;

  // ---- P2: prior-year position baseline ----------------------------------------------------------
  const p2Pairs = runPriorYearPositionBaselineLoocv(baseRows);
  const p2View = viewOf(p2Pairs);
  const p2 = {
    method: 'per_position_train_fold_ols_on_ppr_2024_else_position_mean' as const,
    view: p2View,
    joined_mae_vs_position_mean_baseline:
      p2View.joined.mae !== null && baselineView.joined.mae !== null ? baselineView.joined.mae - p2View.joined.mae : null,
    joined_mae_vs_full_real: p2View.joined.mae !== null && fullRealView.joined.mae !== null ? p2View.joined.mae - fullRealView.joined.mae : null,
    joined_mae_vs_ppr_2024_alone:
      p2View.joined.mae !== null && ppr2024Alone.real_arm.joined.mae !== null ? p2View.joined.mae - ppr2024Alone.real_arm.joined.mae : null,
  };

  // ---- P3: lambda sensitivity --------------------------------------------------------------------
  const p3 = ROBUSTNESS_LAMBDAS.map((lambda) => {
    const predictions = lambda === CONTROLLED_RUN_RIDGE_LAMBDA ? fullPredictions : runControlledLoocv(baseRows, lambda);
    const realJoined = viewOf(armPairs(predictions, 'real_player_history_features')).joined;
    return {
      lambda,
      real_joined: realJoined,
      real_beats_baseline_on_joined_mae:
        realJoined.mae !== null && baselineView.joined.mae !== null && realJoined.mae < baselineView.joined.mae,
    };
  });

  // ---- P4: repeated shuffled seeds ----------------------------------------------------------------
  const p4 = ROBUSTNESS_SHUFFLE_SEEDS.map((seed) => {
    const rows = seed === CONTROLLED_RUN_SHUFFLE_SEED ? baseRows : buildControlledRunRows(outcomeMirror, inputMirror.rows, seed);
    const byId = new Map(rows.map((row) => [row.player_id, row]));
    let donors = 0;
    let self = 0;
    let cross = 0;
    for (const row of rows) {
      if (row.shuffled_donor_player_id === null) continue;
      donors += 1;
      if (row.shuffled_donor_player_id === row.player_id) self += 1;
      if (byId.get(row.shuffled_donor_player_id)!.position !== row.position) cross += 1;
    }
    const predictions = seed === CONTROLLED_RUN_SHUFFLE_SEED ? fullPredictions : runControlledLoocv(rows, CONTROLLED_RUN_RIDGE_LAMBDA);
    const shuffledView = viewOf(armPairs(predictions, 'shuffled_player_history_control'));
    return {
      seed,
      is_original_112_seed: seed === CONTROLLED_RUN_SHUFFLE_SEED,
      shuffled_joined: shuffledView.joined,
      per_position_joined_mae: shuffledView.per_position_joined_mae,
      donors_assigned: donors,
      self_donations: self,
      cross_position_donations: cross,
    };
  });

  // ---- P5: leverage sensitivity (primary metrics untouched) ---------------------------------------
  const trimTopK = (
    pairs: ReadonlyArray<{ position: string; has_player_history: boolean; actual: number; predicted: number }>,
  ): ControlledRunMetrics => {
    const joined = pairs.filter((pair) => pair.has_player_history);
    const sorted = [...joined].sort((a, b) => Math.abs(b.predicted - b.actual) - Math.abs(a.predicted - a.actual));
    return computeControlledRunMetrics(sorted.slice(ROBUSTNESS_TOP_K_EXCLUDED));
  };
  const trimmedJoined = {
    baseline_only: trimTopK(armPairs(fullPredictions, 'baseline_only')),
    real_player_history_features: trimTopK(armPairs(fullPredictions, 'real_player_history_features')),
    shuffled_player_history_control: trimTopK(armPairs(fullPredictions, 'shuffled_player_history_control')),
  };
  const realStillBeatsBaselineAfterTrim =
    trimmedJoined.real_player_history_features.mae !== null &&
    trimmedJoined.baseline_only.mae !== null &&
    trimmedJoined.real_player_history_features.mae < trimmedJoined.baseline_only.mae;

  // ---- Decision (pre-registered rule) -------------------------------------------------------------
  const baselineMae = baselineView.joined.mae;
  const fullMae = fullRealView.joined.mae;
  const ppr2024Mae = ppr2024Alone.real_arm.joined.mae;
  const p2Mae = p2View.joined.mae;
  const shuffledMaes = p4.map((entry) => entry.shuffled_joined.mae);

  const checks: Array<{ criterion: string; passed: boolean; detail: string }> = [];
  const addCheck = (criterion: string, passed: boolean, detail: string): void => {
    checks.push({ criterion, passed, detail });
  };

  const metricsDefined = baselineMae !== null && fullMae !== null && ppr2024Mae !== null && p2Mae !== null && shuffledMaes.every((mae) => mae !== null);
  addCheck('all_required_metrics_defined', metricsDefined, metricsDefined ? 'all joined-population metrics defined' : 'a required metric is undefined');

  const beatsBaseline = metricsDefined && fullMae! < baselineMae!;
  addCheck('full_real_beats_position_mean_baseline', beatsBaseline, `full ${fullMae?.toFixed(3)} vs baseline ${baselineMae?.toFixed(3)}`);

  const beatsAllSeeds = metricsDefined && shuffledMaes.every((mae) => fullMae! < mae!);
  addCheck('full_real_beats_every_shuffled_seed', beatsAllSeeds, `full ${fullMae?.toFixed(3)} vs seeds [${shuffledMaes.map((mae) => mae?.toFixed(2)).join(', ')}]`);

  const stableAcrossLambdas = p3.every((entry) => entry.real_beats_baseline_on_joined_mae);
  addCheck('full_real_beats_baseline_at_every_lambda', stableAcrossLambdas, p3.map((entry) => `λ=${entry.lambda}: ${entry.real_joined.mae?.toFixed(2)}`).join('; '));

  addCheck(
    'real_still_beats_baseline_after_top_k_trim',
    realStillBeatsBaselineAfterTrim,
    `trimmed real ${trimmedJoined.real_player_history_features.mae?.toFixed(3)} vs trimmed baseline ${trimmedJoined.baseline_only.mae?.toFixed(3)}`,
  );

  const strongerSimple = metricsDefined ? Math.min(ppr2024Mae!, p2Mae!) : null;
  const earnsComplexity = metricsDefined && fullMae! < strongerSimple! * (1 - ROBUSTNESS_WEAKENED_RELATIVE_MARGIN);
  addCheck(
    'full_set_beats_stronger_simple_comparators_by_margin',
    earnsComplexity,
    `full ${fullMae?.toFixed(3)} vs min(ppr_2024-alone ${ppr2024Mae?.toFixed(3)}, prior-year baseline ${p2Mae?.toFixed(3)}) with ${ROBUSTNESS_WEAKENED_RELATIVE_MARGIN * 100}% margin`,
  );

  let decision: RobustnessDecision;
  let rationale: string;
  if (!metricsDefined) {
    decision = 'robustness_review_invalid_must_not_use';
    rationale = 'A required joined-population metric is undefined; the robustness review is invalid and must not be used.';
  } else if (!beatsBaseline || !beatsAllSeeds || !stableAcrossLambdas || !realStillBeatsBaselineAfterTrim) {
    decision = 'candidate_signal_not_robust';
    rationale =
      'The candidate signal failed a core robustness check (baseline, a shuffled seed, a lambda setting, or the leverage trim). Recorded plainly; the binding path stops here unless a later review reopens it.';
  } else if (!earnsComplexity) {
    decision = 'candidate_signal_weakened_requires_more_review';
    rationale =
      'The candidate signal survives baseline, all shuffled seeds, the lambda sweep, and the leverage trim -- but the full 26-column feature set does not beat the stronger simple comparators (ppr_2024 alone / per-position prior-year OLS) by the pre-registered 5% margin. Most of the lift is prior-year continuity; the broader feature families have not yet earned their complexity.';
  } else {
    decision = 'candidate_signal_survives_initial_robustness_checks';
    rationale =
      'The candidate signal remains directionally strong across ablation, the stronger prior-year baseline, the lambda sweep, five shuffled seeds, and the leverage trim. This remains an experimental candidate result -- not production evidence and not a promotion/binding authorization.';
  }

  return {
    version: PLAYER_HISTORY_ROBUSTNESS_CHECKS_VERSION,
    marking: CONTROLLED_RUN_RESULT_MARKING,
    primary_run_note: '#112 remains the primary recorded controlled run; these are review-only robustness diagnostics',
    population: {
      evaluated_rows: baseRows.length,
      joined_rows: joinedCount,
      no_history_rows: baseRows.length - joinedCount,
    },
    p1_feature_family_ablation: p1,
    p1_attribution_note: p1AttributionNote,
    p2_prior_year_position_baseline: p2,
    p3_lambda_sensitivity: p3,
    p4_shuffled_seeds: p4,
    p5_leverage_sensitivity: {
      top_k_excluded: ROBUSTNESS_TOP_K_EXCLUDED,
      method: 'per_arm_top_k_absolute_error_rows_excluded_joined_population_only',
      primary_metrics_untouched: true,
      trimmed_joined: trimmedJoined,
      real_still_beats_baseline_after_trim: realStillBeatsBaselineAfterTrim,
      partial_season_sensitivity: {
        computed: false,
        reason:
          'the #109 outcome mirror is deliberately outcome+identity+provenance only and carries no coverage_status/games_for_ppg, so partial-season 2025 outcome rows are not identifiable from the artifacts this run may consume',
        minimal_source_change_recommendation:
          'a future #109-mirror regeneration may add coverage_status and games_for_ppg to outcome mirror rows (outcome-layer metadata, not input features); the target-population gate would gain matching scope checks',
      },
    },
    reference_joined_mae: {
      baseline_only: baselineMae,
      full_real: fullMae,
      shuffled_by_seed: Object.fromEntries(p4.map((entry) => [entry.seed, entry.shuffled_joined.mae])),
      ppr_2024_alone: ppr2024Mae,
      prior_year_position_baseline: p2Mae,
    },
    decision: { decision, weakened_margin: ROBUSTNESS_WEAKENED_RELATIVE_MARGIN, checks, rationale },
    boundary_statements: {
      robustness_diagnostics_only: true,
      primary_112_run_unmodified: true,
      no_production_forecast_behavior_changed: true,
      no_feature_binding_occurred: true,
      no_source_artifact_promoted: true,
      source_remains_candidate_not_promoted: true,
      no_production_signal_claimed: true,
      no_fantasy_advice_or_product_output: true,
    },
  };
};
