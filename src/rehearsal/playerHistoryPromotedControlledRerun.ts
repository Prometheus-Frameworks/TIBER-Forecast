/**
 * Promoted-source controlled rerun of the player-history experiment (Forecast #121).
 *
 * Reruns the #111/PR #112 isolated controlled three-arm design against the PROMOTED-SOURCE mirrors
 * built in #119/PR #120, as authorized by the #119 mirror-refresh gate decision
 * `may_open_promoted_controlled_rerun_issue`. This is the SAME experiment design against a DIFFERENT
 * (governed/promoted, rather than candidate) source:
 *
 *   1. baseline_only                      — train-fold position mean of the 2025 outcome; consumes
 *                                           NO player-history payloads.
 *   2. real_player_history_features       — ridge regression on position dummies + the #104
 *                                           scaffold's feature families.
 *   3. shuffled_player_history_control    — identical model/schema, but the player-history feature
 *                                           block is deterministically deranged WITHIN position among
 *                                           joined players (seeded, pre-outcome-independent).
 *
 * Validation, imputation, standardization, and shuffle discipline are IDENTICAL to #112: LOOCV,
 * train-fold-only imputation (the #104 primitives) and standardization, deterministic position-
 * stratified derangement with no self-donation and no cross-position donation.
 *
 * Every result is marked `experimental_promoted_source_result_not_production_signal`. The decision
 * enum has NO value that authorizes production binding, feature wiring, promotion, or product output.
 * This module never imports seasonalPprModel.ts, routes, or product surfaces.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistoryPromotedControlledRerun.ts`) reads the
 * committed promoted mirrors + the #119 refresh gate evidence + the recorded #112/#116 candidate
 * results, and passes everything in.
 */

import {
  PLAYER_HISTORY_APPROVED_POSITIONS,
  PLAYER_HISTORY_APPROVED_SEASON_TYPE,
  buildPlayerHistoryFeatures,
  type PlayerHistoryFeatureRow,
  type PlayerHistoryInputRow,
} from './playerHistoryFeatureScaffold.js';
import {
  CONTROLLED_RUN_HISTORY_COLUMNS,
  computeControlledRunMetrics,
  historyValuesFromFeatureRow,
  runControlledLoocv,
  type ControlledRunArm,
  type ControlledRunFeatureColumn,
  type ControlledRunMetrics,
  type ControlledRunPrediction,
  type ControlledRunRow,
} from './playerHistoryControlledRun.js';
import {
  ARCHIVED_CANDIDATE_MIRROR_PATHS,
  type PromotedInputMirror,
  type PromotedMirrorRefreshGateResult,
  type PromotedOutcomeMirror,
} from './playerHistoryPromotedMirrorRefresh.js';

/** The #119 mirror-refresh gate decision required before this rerun may execute; anything else fails the preflight closed. */
export const REQUIRED_PROMOTED_MIRROR_REFRESH_DECISION = 'may_open_promoted_controlled_rerun_issue' as const;
import {
  EXPECTED_PROMOTED_STATUS,
  EXPECTED_APPROVED_SOURCE_PREFIXES,
  PINNED_PROMOTED_ARTIFACT_SHA256,
  PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS,
  PROMOTED_FIXTURE_MARKERS,
  PROMOTED_FORBIDDEN_AVAILABILITY_KEYS,
} from './playerHistoryPromotedSourceGate.js';
import {
  OVERLAP_MIN_JOINED_ROWS_OVERALL,
  OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
  OVERLAP_MIN_JOINED_SHARE,
  OVERLAP_REQUIRED_POSITIONS,
} from './playerHistoryMirrorOverlapGate.js';
import { PINNED_SOURCE_ARTIFACT_SHA256 } from './playerHistoryRunPopulationMirrors.js';
import { seededDerangement } from './util/seededShuffle.js';

export const PLAYER_HISTORY_PROMOTED_CONTROLLED_RERUN_VERSION = 'player-history-promoted-controlled-rerun-v1' as const;

export const PROMOTED_CONTROLLED_RERUN_ISSUE = 'TIBER-Forecast#121' as const;

/** Every metric in this run's report is marked with this string -- never a production signal. */
export const PROMOTED_CONTROLLED_RERUN_RESULT_MARKING =
  'experimental_promoted_source_result_not_production_signal' as const;

/** Same three arms, same names, as the #112 candidate-source run. */
export const PROMOTED_CONTROLLED_RERUN_ARMS = [
  'baseline_only',
  'real_player_history_features',
  'shuffled_player_history_control',
] as const;

/** Same seed and lambda as #112, so a verbatim-identical source yields a verbatim-identical result. */
export const PROMOTED_CONTROLLED_RERUN_SHUFFLE_SEED = 20260702;
export const PROMOTED_CONTROLLED_RERUN_RIDGE_LAMBDA = 1.0;

/**
 * The only decisions this rerun may emit. Deliberately NO value contains run-authorization/bind/
 * production/promotion/advice semantics beyond the experimental result itself (tested).
 */
export const PROMOTED_CONTROLLED_RERUN_DECISIONS = [
  'promoted_player_history_signal_replicated_requires_followup',
  'promoted_player_history_signal_not_replicated',
  'promoted_player_history_result_inconclusive',
  'promoted_controlled_rerun_invalid_must_not_use',
] as const;
export type PromotedControlledRerunDecision = (typeof PROMOTED_CONTROLLED_RERUN_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Preflight: fail closed unless the #119/#120 promoted mirror refresh gate passed with the
// required ceiling decision, both mirrors tie to the promoted pin, and every structural/leakage
// boundary re-verifies directly against the mirrors this rerun is about to consume.
// ---------------------------------------------------------------------------------------------

export interface PromotedControlledRerunPriorGateEvidence {
  /** The full #119 refresh-gate result (re-evaluated by the caller against local files, never trusted from a stale report alone). */
  mirrorRefreshGateResult: PromotedMirrorRefreshGateResult;
}

const FORBIDDEN_AVAILABILITY_KEYS: readonly string[] = PROMOTED_FORBIDDEN_AVAILABILITY_KEYS;

/**
 * Fail-closed preconditions. Throws with a specific reason on the first violated condition; the
 * promoted controlled rerun must not execute if this throws.
 */
export const assertPromotedControlledRerunPreconditions = (
  gates: PromotedControlledRerunPriorGateEvidence,
  outcomeMirror: PromotedOutcomeMirror,
  inputMirror: PromotedInputMirror,
): void => {
  const fail = (reason: string): never => {
    throw new Error(`promoted controlled rerun BLOCKED (fail closed): ${reason}`);
  };

  // ---- #119/#120 refresh-gate preflight -----------------------------------------------------------
  const gate = gates.mirrorRefreshGateResult;
  if (gate.status !== 'passed')
    fail(`#119 mirror-refresh gate status is ${gate.status}, expected passed`);
  if (gate.decision !== REQUIRED_PROMOTED_MIRROR_REFRESH_DECISION)
    fail(`#119 mirror-refresh gate decision is ${gate.decision}, expected ${REQUIRED_PROMOTED_MIRROR_REFRESH_DECISION}`);

  // ---- Mirror identity: both mirrors must tie to the promoted pin ----------------------------------
  if (outcomeMirror.kind !== 'player_history_promoted_outcome_mirror')
    fail(`outcome mirror kind is ${outcomeMirror.kind}, expected player_history_promoted_outcome_mirror`);
  if (inputMirror.kind !== 'player_history_promoted_input_mirror')
    fail(`input mirror kind is ${inputMirror.kind}, expected player_history_promoted_input_mirror`);
  if (outcomeMirror.governed_source.sha256 !== PINNED_PROMOTED_ARTIFACT_SHA256)
    fail(`outcome mirror sha256 is ${outcomeMirror.governed_source.sha256}, expected pinned ${PINNED_PROMOTED_ARTIFACT_SHA256}`);
  if (inputMirror.governed_source.sha256 !== PINNED_PROMOTED_ARTIFACT_SHA256)
    fail(`input mirror sha256 is ${inputMirror.governed_source.sha256}, expected pinned ${PINNED_PROMOTED_ARTIFACT_SHA256}`);
  if (outcomeMirror.governed_source.artifactStatus !== EXPECTED_PROMOTED_STATUS)
    fail(`outcome mirror artifact status is ${outcomeMirror.governed_source.artifactStatus}, expected ${EXPECTED_PROMOTED_STATUS}`);
  if (inputMirror.governed_source.artifactStatus !== EXPECTED_PROMOTED_STATUS)
    fail(`input mirror artifact status is ${inputMirror.governed_source.artifactStatus}, expected ${EXPECTED_PROMOTED_STATUS}`);

  // ---- Source lineage: both mirrors must trace back to the same prior candidate pin ----------------
  if (outcomeMirror.source_lineage.prior_candidate_sha256 !== PINNED_SOURCE_ARTIFACT_SHA256)
    fail(`outcome mirror candidate lineage sha256 is ${outcomeMirror.source_lineage.prior_candidate_sha256}, expected pinned ${PINNED_SOURCE_ARTIFACT_SHA256}`);
  if (inputMirror.source_lineage.prior_candidate_sha256 !== PINNED_SOURCE_ARTIFACT_SHA256)
    fail(`input mirror candidate lineage sha256 is ${inputMirror.source_lineage.prior_candidate_sha256}, expected pinned ${PINNED_SOURCE_ARTIFACT_SHA256}`);

  // ---- Structural mirror checks (before floors, so a tampered mirror fails for the right reason) ---
  const badInputSeason = inputMirror.rows.filter((row) => row.season >= outcomeMirror.target_season);
  if (badInputSeason.length > 0)
    fail(`${badInputSeason.length} input mirror rows at or beyond target season ${outcomeMirror.target_season} (2025 rows must never be input features)`);
  // A stale/malformed outcome mirror could carry an off-scope row (wrong season, wrong season_type,
  // or an out-of-scope position); admitting it into LOOCV would corrupt every reported metric, so
  // scope is re-verified here rather than trusted from the mirror's own labeling.
  const badOutcomeScope = outcomeMirror.rows.filter(
    (row) =>
      row.season !== outcomeMirror.target_season ||
      row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE ||
      !PLAYER_HISTORY_APPROVED_POSITIONS.includes(row.position),
  );
  if (badOutcomeScope.length > 0)
    fail(
      `${badOutcomeScope.length} outcome mirror rows are off-scope (expected season=${outcomeMirror.target_season}, season_type=${PLAYER_HISTORY_APPROVED_SEASON_TYPE}, position in ${PLAYER_HISTORY_APPROVED_POSITIONS.join('/')})`,
    );
  const TARGET_OUTCOME_KEYS = ['ppr_2025_actual', 'season_ppr_2025', 'target_outcome', 'target_season_ppr'];
  const outcomeLeak = inputMirror.rows.filter((row) => TARGET_OUTCOME_KEYS.some((key) => Object.prototype.hasOwnProperty.call(row, key)));
  if (outcomeLeak.length > 0) fail(`${outcomeLeak.length} input mirror rows carry outcome-valued fields`);
  for (const row of [...inputMirror.rows, ...outcomeMirror.rows]) {
    for (const key of FORBIDDEN_AVAILABILITY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) fail(`row for ${row.player_id} carries forbidden availability field ${key}`);
    }
  }

  // ---- Provenance re-verified directly against the mirrors this rerun consumes (prefix, never substring) ----
  const validateSourceRefs = (rows: ReadonlyArray<{ player_id: string; source_refs: Array<{ source_name: string }> }>, mirrorLabel: string): void => {
    for (const row of rows) {
      if (!Array.isArray(row.source_refs) || row.source_refs.length === 0)
        fail(`${mirrorLabel} row for ${row.player_id} carries no source_refs`);
      for (const ref of row.source_refs) {
        const name = String(ref.source_name ?? '');
        if (!EXPECTED_APPROVED_SOURCE_PREFIXES.some((prefix) => name.startsWith(prefix)))
          fail(`${mirrorLabel} row for ${row.player_id} carries a non-prefix-approved source ref (${name})`);
        if (PROMOTED_FIXTURE_MARKERS.some((marker) => name.includes(marker)))
          fail(`${mirrorLabel} row for ${row.player_id} carries a fixture/scaffold-marked source ref (${name})`);
      }
    }
  };
  validateSourceRefs(outcomeMirror.rows, 'outcome mirror');
  validateSourceRefs(inputMirror.rows, 'input mirror');

  // ---- Unavailable usage fields must remain null: never zero-coerced, never populated --------------
  for (const row of inputMirror.rows) {
    const usage = row.usage_summary as unknown as Record<string, number | null> | null | undefined;
    for (const field of PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS) {
      const value = usage?.[field];
      if (value !== null && value !== undefined) fail(`input mirror row for ${row.player_id} carries a non-null ${field} (${value}); this field is never source-backed and must remain null`);
    }
  }

  // ---- #107 population/overlap floors, recomputed directly from the mirrors being run --------------
  const inputPositionsByPlayer = new Map<string, Set<string>>();
  for (const row of inputMirror.rows) {
    const positions = inputPositionsByPlayer.get(row.player_id) ?? new Set<string>();
    positions.add(row.position);
    inputPositionsByPlayer.set(row.player_id, positions);
  }
  let scored = 0;
  let joined = 0;
  const joinedByPosition: Record<string, number> = {};
  for (const row of outcomeMirror.rows) {
    if (typeof row.season_ppr !== 'number') continue;
    scored += 1;
    if (inputPositionsByPlayer.get(row.player_id)?.has(row.position)) {
      joined += 1;
      joinedByPosition[row.position] = (joinedByPosition[row.position] ?? 0) + 1;
    }
  }
  if (joined < OVERLAP_MIN_JOINED_ROWS_OVERALL) fail(`joined rows ${joined} below the #107 floor ${OVERLAP_MIN_JOINED_ROWS_OVERALL}`);
  for (const position of OVERLAP_REQUIRED_POSITIONS) {
    const positionJoined = joinedByPosition[position] ?? 0;
    if (positionJoined < OVERLAP_MIN_JOINED_ROWS_PER_POSITION)
      fail(`joined rows for ${position} (${positionJoined}) below the #107 floor ${OVERLAP_MIN_JOINED_ROWS_PER_POSITION}`);
  }
  if (scored <= 0 || joined / scored < OVERLAP_MIN_JOINED_SHARE) fail(`joined share below the #107 floor ${OVERLAP_MIN_JOINED_SHARE}`);
};

// ---------------------------------------------------------------------------------------------
// Row assembly: identical join/shuffle discipline to #112, adapted to the promoted mirror types.
// ---------------------------------------------------------------------------------------------

const EMPTY_HISTORY: Record<string, number | null> = Object.fromEntries(
  CONTROLLED_RUN_HISTORY_COLUMNS.map((column) => [column.name, null]),
);

/**
 * Assemble the run rows from the PROMOTED mirrors: join outcome mirror to #104 features (built from
 * the promoted input mirror rows with the full fail-closed boundary set), then assign the
 * deterministic within-position shuffled block. The shuffle depends only on player_ids and the seed
 * -- never on outcomes. Structurally identical to #112's `buildControlledRunRows`.
 */
export const buildPromotedControlledRerunRows = (
  outcomeMirror: PromotedOutcomeMirror,
  inputRows: readonly PlayerHistoryInputRow[],
  shuffleSeed: number = PROMOTED_CONTROLLED_RERUN_SHUFFLE_SEED,
): ControlledRunRow[] => {
  const featureRows = buildPlayerHistoryFeatures(inputRows, {
    targetSeason: outcomeMirror.target_season,
    inputSeasons: [2022, 2023, 2024],
  });
  const featuresByPlayer = new Map(featureRows.map((row) => [row.player_id, row]));

  const rows: ControlledRunRow[] = [];
  for (const target of [...outcomeMirror.rows].sort((a, b) => (a.player_id < b.player_id ? -1 : 1))) {
    if (typeof target.season_ppr !== 'number') continue; // no observed outcome -> cannot be evaluated
    const features = featuresByPlayer.get(target.player_id);
    const matched = features !== undefined && features.position === target.position;
    rows.push({
      player_id: target.player_id,
      player_name: target.player_name,
      position: target.position,
      outcome: target.season_ppr,
      has_player_history: matched,
      real_history_values: matched ? historyValuesFromFeatureRow(features as PlayerHistoryFeatureRow) : { ...EMPTY_HISTORY },
      shuffled_history_values: { ...EMPTY_HISTORY },
      shuffled_donor_player_id: null,
    });
  }

  const positions = [...new Set(rows.map((row) => row.position))].sort();
  for (const position of positions) {
    const group = rows.filter((row) => row.position === position && row.has_player_history);
    if (group.length < 2) continue;
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

// ---------------------------------------------------------------------------------------------
// Comparison to the recorded #112/#116 candidate-source result.
// ---------------------------------------------------------------------------------------------

/** The joined-population metrics recorded by the #112 candidate-source controlled run, for comparison only. */
export interface CandidateSourceReferenceResult {
  decision: string;
  joined_mae: { baseline_only: number; real_player_history_features: number; shuffled_player_history_control: number };
  joined_rmse: { baseline_only: number; real_player_history_features: number; shuffled_player_history_control: number };
}

export interface CandidateComparison {
  candidate_decision: string;
  candidate_beat_baseline_and_shuffled: boolean;
  promoted_beat_baseline_and_shuffled: boolean;
  directionally_consistent: boolean;
  joined_mae_delta_vs_candidate: {
    baseline_only: number;
    real_player_history_features: number;
    shuffled_player_history_control: number;
  };
  joined_rmse_delta_vs_candidate: {
    baseline_only: number;
    real_player_history_features: number;
    shuffled_player_history_control: number;
  };
  replication_note: string;
}

const compareToCandidate = (
  joined: Record<ControlledRunArm, ControlledRunMetrics>,
  candidate: CandidateSourceReferenceResult,
  promotedBeatsBoth: boolean,
): CandidateComparison => {
  const candidateBeatsBoth =
    candidate.joined_mae.real_player_history_features < candidate.joined_mae.baseline_only &&
    candidate.joined_mae.real_player_history_features < candidate.joined_mae.shuffled_player_history_control;
  const maeDelta = (arm: ControlledRunArm): number => (joined[arm].mae ?? NaN) - candidate.joined_mae[arm];
  const rmseDelta = (arm: ControlledRunArm): number => (joined[arm].rmse ?? NaN) - candidate.joined_rmse[arm];
  const directionallyConsistent = candidateBeatsBoth === promotedBeatsBoth;
  return {
    candidate_decision: candidate.decision,
    candidate_beat_baseline_and_shuffled: candidateBeatsBoth,
    promoted_beat_baseline_and_shuffled: promotedBeatsBoth,
    directionally_consistent: directionallyConsistent,
    joined_mae_delta_vs_candidate: {
      baseline_only: maeDelta('baseline_only'),
      real_player_history_features: maeDelta('real_player_history_features'),
      shuffled_player_history_control: maeDelta('shuffled_player_history_control'),
    },
    joined_rmse_delta_vs_candidate: {
      baseline_only: rmseDelta('baseline_only'),
      real_player_history_features: rmseDelta('real_player_history_features'),
      shuffled_player_history_control: rmseDelta('shuffled_player_history_control'),
    },
    replication_note: directionallyConsistent
      ? promotedBeatsBoth
        ? 'The promoted-source rerun replicates the #112 candidate-source signal direction: the real player-history arm beats both baseline and shuffled control on joined MAE in both runs.'
        : 'The promoted-source rerun replicates the #112 candidate-source non-signal direction: the real player-history arm beats neither comparator on joined MAE in either run.'
      : 'The promoted-source rerun result direction diverges from the #112 candidate-source result; see the decision rationale for how this is scored.',
  };
};

// ---------------------------------------------------------------------------------------------
// Decision.
// ---------------------------------------------------------------------------------------------

export interface PromotedControlledRerunDecisionRationale {
  decision: PromotedControlledRerunDecision;
  primary_metric: 'joined_population_mae';
  real_beats_baseline_on_primary: boolean;
  real_beats_shuffled_on_primary: boolean;
  real_beats_shuffled_on_secondary: boolean;
  secondary_metric: 'joined_population_rmse';
  directionally_consistent_with_candidate: boolean;
  rationale: string;
}

/**
 * Decision rule from the #121 issue: real must beat BOTH baseline and shuffled on joined MAE, AND
 * beat shuffled on joined RMSE, AND be directionally consistent with the #112 candidate-source
 * result, to count as replicated. Failing both primary comparisons is non-replication; a mixed or
 * directionally-inconsistent outcome is inconclusive.
 */
export const decidePromotedControlledRerun = (
  joined: Record<ControlledRunArm, ControlledRunMetrics>,
  comparison: CandidateComparison,
): PromotedControlledRerunDecisionRationale => {
  const baselineMae = joined.baseline_only.mae;
  const realMae = joined.real_player_history_features.mae;
  const shuffledMae = joined.shuffled_player_history_control.mae;
  const realRmse = joined.real_player_history_features.rmse;
  const shuffledRmse = joined.shuffled_player_history_control.rmse;
  if (baselineMae === null || realMae === null || shuffledMae === null || realRmse === null || shuffledRmse === null) {
    return {
      decision: 'promoted_controlled_rerun_invalid_must_not_use',
      primary_metric: 'joined_population_mae',
      real_beats_baseline_on_primary: false,
      real_beats_shuffled_on_primary: false,
      real_beats_shuffled_on_secondary: false,
      secondary_metric: 'joined_population_rmse',
      directionally_consistent_with_candidate: false,
      rationale: 'A required joined-population metric is undefined; the run is invalid and must not be used.',
    };
  }
  const beatsBaseline = realMae < baselineMae;
  const beatsShuffled = realMae < shuffledMae;
  const beatsShuffledSecondary = realRmse < shuffledRmse;
  const beatsBoth = beatsBaseline && beatsShuffled;

  let decision: PromotedControlledRerunDecision;
  let rationale: string;
  if (beatsBoth && beatsShuffledSecondary && comparison.directionally_consistent) {
    decision = 'promoted_player_history_signal_replicated_requires_followup';
    rationale =
      'The real player-history arm beat both the baseline and the position-stratified shuffled control on joined-population MAE, beat the shuffled control on RMSE, and this is directionally consistent with the #112 candidate-source result. This is an experimental promoted-source result only -- not a production signal; a follow-up review issue is required before anything further.';
  } else if (!beatsBaseline && !beatsShuffled) {
    decision = 'promoted_player_history_signal_not_replicated';
    rationale =
      'The real player-history arm beat neither the baseline nor the shuffled control on joined-population MAE against the promoted-source mirrors. The candidate-source signal did not replicate under promoted governance.';
  } else if (!comparison.directionally_consistent) {
    decision = 'promoted_player_history_result_inconclusive';
    rationale =
      'The promoted-source rerun direction diverges from the #112 candidate-source result (one run shows a real-arm advantage the other does not). The result is inconclusive; no signal is claimed either way.';
  } else {
    decision = 'promoted_player_history_result_inconclusive';
    rationale =
      'The comparisons are mixed (the real arm beat one comparator but not the other, or failed the secondary RMSE check). The result is inconclusive; no signal is claimed.';
  }
  return {
    decision,
    primary_metric: 'joined_population_mae',
    real_beats_baseline_on_primary: beatsBaseline,
    real_beats_shuffled_on_primary: beatsShuffled,
    real_beats_shuffled_on_secondary: beatsShuffledSecondary,
    secondary_metric: 'joined_population_rmse',
    directionally_consistent_with_candidate: comparison.directionally_consistent,
    rationale,
  };
};

// ---------------------------------------------------------------------------------------------
// Full run + report assembly.
// ---------------------------------------------------------------------------------------------

export interface PromotedControlledRerunReport {
  version: typeof PLAYER_HISTORY_PROMOTED_CONTROLLED_RERUN_VERSION;
  marking: typeof PROMOTED_CONTROLLED_RERUN_RESULT_MARKING;
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
    shuffled_control_integrity: { donors_assigned: number; self_donations: number; cross_position_donations: number };
  };
  metrics_by_arm: {
    overall: Record<ControlledRunArm, ControlledRunMetrics>;
    joined_only: Record<ControlledRunArm, ControlledRunMetrics>;
    no_history_only: Record<ControlledRunArm, ControlledRunMetrics>;
    per_position: Record<string, Record<ControlledRunArm, ControlledRunMetrics>>;
  };
  comparisons: Array<{ comparison: string; subgroup: string; mae_delta: number | null; rmse_delta: number | null; better_on_mae: string }>;
  candidate_source_comparison: CandidateComparison;
  decision: PromotedControlledRerunDecisionRationale;
  boundary_statements: {
    isolated_controlled_rerun_only: true;
    source_mirrors_are_promoted_governed_not_candidate: true;
    no_production_forecast_behavior_changed: true;
    no_feature_binding_occurred: true;
    no_product_facing_signal_claimed: true;
    no_fantasy_advice_or_rankings_output: true;
    no_tiber_data_change: true;
    no_data_artifact_promoted_or_demoted: true;
    metrics_exist_only_inside_this_report: true;
    archived_candidate_mirrors_untouched: true;
  };
}

const metricsForSubset = (
  predictions: readonly ControlledRunPrediction[],
  filter: (prediction: ControlledRunPrediction) => boolean,
): Record<ControlledRunArm, ControlledRunMetrics> => {
  const subset = predictions.filter(filter);
  return Object.fromEntries(
    PROMOTED_CONTROLLED_RERUN_ARMS.map((arm) => [
      arm,
      computeControlledRunMetrics(subset.map((prediction) => ({ actual: prediction.actual, predicted: prediction.predictions[arm] }))),
    ]),
  ) as Record<ControlledRunArm, ControlledRunMetrics>;
};

/** Execute the full promoted-source controlled rerun. Pure given its inputs; deterministic for a fixed seed. */
export const executePromotedControlledRerun = (
  outcomeMirror: PromotedOutcomeMirror,
  inputMirror: PromotedInputMirror,
  gates: PromotedControlledRerunPriorGateEvidence,
  candidateReference: CandidateSourceReferenceResult,
  shuffleSeed: number = PROMOTED_CONTROLLED_RERUN_SHUFFLE_SEED,
  lambda: number = PROMOTED_CONTROLLED_RERUN_RIDGE_LAMBDA,
  historyColumns: readonly ControlledRunFeatureColumn[] = CONTROLLED_RUN_HISTORY_COLUMNS,
): { report: PromotedControlledRerunReport; predictions: ControlledRunPrediction[] } => {
  assertPromotedControlledRerunPreconditions(gates, outcomeMirror, inputMirror);
  const rows = buildPromotedControlledRerunRows(outcomeMirror, inputMirror.rows, shuffleSeed);
  const predictions = runControlledLoocv(rows, lambda, historyColumns);

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
  const comparisons: PromotedControlledRerunReport['comparisons'] = [];
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

  const promotedBeatsBoth =
    joinedOnly.real_player_history_features.mae !== null &&
    joinedOnly.baseline_only.mae !== null &&
    joinedOnly.shuffled_player_history_control.mae !== null &&
    joinedOnly.real_player_history_features.mae < joinedOnly.baseline_only.mae &&
    joinedOnly.real_player_history_features.mae < joinedOnly.shuffled_player_history_control.mae;
  const candidateComparison = compareToCandidate(joinedOnly, candidateReference, promotedBeatsBoth);
  const decision = decidePromotedControlledRerun(joinedOnly, candidateComparison);

  return {
    report: {
      version: PLAYER_HISTORY_PROMOTED_CONTROLLED_RERUN_VERSION,
      marking: PROMOTED_CONTROLLED_RERUN_RESULT_MARKING,
      arms: PROMOTED_CONTROLLED_RERUN_ARMS,
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
        shuffled_control_integrity: { donors_assigned: donorsAssigned, self_donations: selfDonations, cross_position_donations: crossPosition },
      },
      metrics_by_arm: { overall, joined_only: joinedOnly, no_history_only: noHistoryOnly, per_position: perPosition },
      comparisons,
      candidate_source_comparison: candidateComparison,
      decision,
      boundary_statements: {
        isolated_controlled_rerun_only: true,
        source_mirrors_are_promoted_governed_not_candidate: true,
        no_production_forecast_behavior_changed: true,
        no_feature_binding_occurred: true,
        no_product_facing_signal_claimed: true,
        no_fantasy_advice_or_rankings_output: true,
        no_tiber_data_change: true,
        no_data_artifact_promoted_or_demoted: true,
        metrics_exist_only_inside_this_report: true,
        archived_candidate_mirrors_untouched: true,
      },
    },
    predictions,
  };
};

/** Re-exported so the CLI script and tests do not need to reach into #119's module directly. */
export const PROMOTED_MIRROR_ARCHIVED_CANDIDATE_PATHS = ARCHIVED_CANDIDATE_MIRROR_PATHS;
