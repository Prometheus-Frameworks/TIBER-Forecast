/**
 * 2024-from-2021-2023 additional validation (Forecast #137).
 *
 * Runs a BOUNDED additional-validation pass against the #135/PR #136 refreshed mirrors (2024 REG
 * outcome / 2021-2023 REG input, sourced from the TIBER-Data #202/PR#207 promoted 2021-2025
 * `player_season_coverage_v0` artifact). This module may compute and report validation metrics for
 * the 2024 target window; it must NOT decide a threshold, bind anything into production Forecast, or
 * make a production-readiness/leakage-audit-complete claim.
 *
 * Design: the SAME three-arm isolated LOOCV design as #111/#121 (baseline_only /
 * real_player_history_features / shuffled_player_history_control), reusing the #111 LOOCV engine and
 * metric primitives verbatim (`runControlledLoocv`, `computeControlledRunMetrics`). Only the feature
 * window differs: target season 2024, input seasons 2021-2023 (one year earlier than every prior
 * player-history run), so the player-history feature block is re-keyed to seasons 2023/2022/2021
 * (`ADDITIONAL_VALIDATION_HISTORY_COLUMNS` / `historyValuesFromAdditionalValidationFeatureRow`) rather
 * than reusing the 2024/2023/2022-keyed columns #111/#121 used for their 2025-target window.
 *
 * Decision semantics (exactly one is emitted, per the #137 issue's required enum). This is a GATE
 * decision about whether the run itself is valid, NOT a signal-strength or threshold decision:
 * - `may_open_player_history_2024_from_2021_2023_threshold_review_issue`: the #136 mirror-refresh gate
 *   decision, mirror identity/leakage/provenance, and the #107 population/overlap floors all
 *   re-verify directly against the mirrors this run consumes, and every required joined-population
 *   metric is defined. A SEPARATE issue may be opened to consider a threshold; this decision does not
 *   itself accept, reject, or amend any threshold, and does not bind production behavior.
 * - `player_history_2024_from_2021_2023_additional_validation_requires_followup`: mirror identity and
 *   leakage/provenance integrity passed, but a population/overlap floor (recomputed directly from the
 *   mirrors) did not clear, or a required joined-population metric came back undefined. Metrics may
 *   still be reported for transparency, but must not be used to open the threshold-review issue.
 * - `player_history_2024_from_2021_2023_additional_validation_blocked`: the gate input was malformed,
 *   OR the #136 mirror-refresh gate decision was not the required ceiling value, OR a mirror
 *   identity/sha/provenance/leakage/null-semantics check failed. No metric is computed; the mirrors
 *   must not be used at all.
 *
 * Every result is marked `experimental_2024_from_2021_2023_result_not_production_signal`. No
 * production Forecast behavior is touched: this module never imports seasonalPprModel.ts, routes, or
 * product surfaces. No TIBER-Data change. Pure module: no I/O. The CLI script
 * (`scripts/runPlayerHistory2024From2021_2023AdditionalValidation.ts`) reads the committed refreshed
 * mirrors + the committed #136 mirror-refresh-gate report and passes everything in.
 */

import {
  buildPlayerHistoryFeatures,
  type PlayerHistoryFeatureRow,
  type PlayerHistoryInputRow,
} from './playerHistoryFeatureScaffold.js';
import {
  CONTROLLED_RUN_ARMS,
  computeControlledRunMetrics,
  runControlledLoocv,
  type ControlledRunArm,
  type ControlledRunFeatureColumn,
  type ControlledRunMetrics,
  type ControlledRunPrediction,
  type ControlledRunRow,
} from './playerHistoryControlledRun.js';
import {
  INPUT_MIRROR_PATH_2021_2023,
  INPUT_SEASONS_2021_2023,
  OUTCOME_MIRROR_PATH_2024,
  PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  EXPECTED_PROMOTION_DECISION_2021_2025,
  EXPECTED_PROMOTION_REVIEW_2021_2025,
  TARGET_SEASON_2024,
  type PlayerHistory2021_2023InputMirror,
  type PlayerHistory2024From2021_2023MirrorRefreshGateResult,
  type PlayerHistory2024OutcomeMirror,
} from './playerHistory2024From2021_2023MirrorRefresh.js';
import {
  EXPECTED_APPROVED_SOURCE_PREFIXES,
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
import { PLAYER_HISTORY_APPROVED_SEASON_TYPE, PLAYER_HISTORY_APPROVED_POSITIONS } from './playerHistoryFeatureScaffold.js';
import { seededDerangement } from './util/seededShuffle.js';

export const PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_VERSION =
  'player-history-2024-from-2021-2023-additional-validation-v1' as const;

export const PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_ISSUE = 'TIBER-Forecast#137' as const;

/** Every metric in this run's report is marked with this string -- never a production signal. */
export const ADDITIONAL_VALIDATION_RESULT_MARKING =
  'experimental_2024_from_2021_2023_result_not_production_signal' as const;

/** Same three arms, same names, as the #111/#121 player-history runs. */
export const ADDITIONAL_VALIDATION_ARMS = CONTROLLED_RUN_ARMS;

/** Deterministic seed for this issue's shuffled-control arm (distinct from #111's 20260702 / #121's reuse of it). */
export const ADDITIONAL_VALIDATION_SHUFFLE_SEED = 20260707;
export const ADDITIONAL_VALIDATION_RIDGE_LAMBDA = 1.0;

/** The #136 mirror-refresh gate decision required before this run may execute; anything else blocks. */
export const REQUIRED_MIRROR_REFRESH_DECISION = 'may_open_player_history_2024_from_2021_2023_additional_validation_issue' as const;

/**
 * The only decisions this run may emit (per the #137 issue). This is a GATE decision about run
 * validity -- deliberately NO value contains threshold-accept/reject/amend or production-binding
 * semantics. Even the strongest value only permits OPENING a separate later threshold-review issue.
 */
export const PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS = [
  'may_open_player_history_2024_from_2021_2023_threshold_review_issue',
  'player_history_2024_from_2021_2023_additional_validation_blocked',
  'player_history_2024_from_2021_2023_additional_validation_requires_followup',
] as const;
export type PlayerHistory2024From2021_2023AdditionalValidationDecision =
  (typeof PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Feature vectorization, re-keyed to the 2024-from-2021-2023 window (most recent pre-target season is
// 2023, NOT 2024 as in every prior player-history run). Family tags match #111's CONTROLLED_RUN_HISTORY_COLUMNS.
// ---------------------------------------------------------------------------------------------

export const ADDITIONAL_VALIDATION_HISTORY_COLUMNS: readonly ControlledRunFeatureColumn[] = [
  { name: 'prior_seasons_observed_count', family: 'coverage' },
  { name: 'prior_weeks_observed_total', family: 'coverage' },
  { name: 'prior_weeks_observed_mean', family: 'coverage' },
  { name: 'missingness_rate', family: 'coverage' },
  { name: 'ppr_2023', family: 'production' },
  { name: 'ppr_2022', family: 'production' },
  { name: 'ppr_2021', family: 'production' },
  { name: 'ppg_2023', family: 'production' },
  { name: 'trailing_2yr_ppr_total', family: 'production' },
  { name: 'trailing_3yr_ppr_total', family: 'production' },
  { name: 'trailing_2yr_ppr_mean', family: 'production' },
  { name: 'trailing_3yr_ppr_mean', family: 'production' },
  { name: 'year_over_year_ppr_trend', family: 'production' },
  { name: 'targets_2023', family: 'usage' },
  { name: 'receptions_2023', family: 'usage' },
  { name: 'rushing_attempts_2023', family: 'usage' },
  { name: 'receiving_air_yards_2023', family: 'usage' },
  { name: 'target_share_2023', family: 'usage' },
  { name: 'air_yards_share_2023', family: 'usage' },
  { name: 'wopr_2023', family: 'usage' },
  { name: 'racr_2023', family: 'usage' },
  { name: 'latest_pre_target_season_age', family: 'age_career' },
  { name: 'latest_pre_target_career_year', family: 'age_career' },
  { name: 'undrafted_indicator', family: 'age_career' },
  { name: 'multi_team_prior_season_indicator', family: 'team_context' },
  { name: 'multi_team_season_count', family: 'team_context' },
];

const numeric = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const boolToNum = (value: boolean | null | undefined): number | null => (value === true ? 1 : value === false ? 0 : null);

/**
 * Extract the player-history feature block (nulls preserved) from a #104 scaffold feature row built
 * for the 2024-from-2021-2023 window (target_season=2024, inputSeasons=[2021,2022,2023]). Re-keyed
 * to 2023/2022/2021 -- NOT the 2024/2023/2022 keys #111/#121 used for their 2025-target window.
 */
export const historyValuesFromAdditionalValidationFeatureRow = (features: PlayerHistoryFeatureRow): Record<string, number | null> => ({
  prior_seasons_observed_count: numeric(features.coverage?.prior_seasons_observed_count),
  prior_weeks_observed_total: numeric(features.coverage?.prior_weeks_observed_total),
  prior_weeks_observed_mean: numeric(features.coverage?.prior_weeks_observed_mean),
  missingness_rate: numeric(features.coverage?.missingness_rate),
  ppr_2023: numeric(features.production?.season_ppr_by_season[2023]),
  ppr_2022: numeric(features.production?.season_ppr_by_season[2022]),
  ppr_2021: numeric(features.production?.season_ppr_by_season[2021]),
  ppg_2023: numeric(features.production?.season_ppg_by_season[2023]),
  trailing_2yr_ppr_total: numeric(features.production?.trailing_2yr_ppr_total),
  trailing_3yr_ppr_total: numeric(features.production?.trailing_3yr_ppr_total),
  trailing_2yr_ppr_mean: numeric(features.production?.trailing_2yr_ppr_mean),
  trailing_3yr_ppr_mean: numeric(features.production?.trailing_3yr_ppr_mean),
  year_over_year_ppr_trend: numeric(features.production?.year_over_year_ppr_trend),
  targets_2023: numeric(features.usage?.targets_by_season[2023]),
  receptions_2023: numeric(features.usage?.receptions_by_season[2023]),
  rushing_attempts_2023: numeric(features.usage?.rushing_attempts_by_season[2023]),
  receiving_air_yards_2023: numeric(features.usage?.receiving_air_yards_by_season[2023]),
  target_share_2023: numeric(features.usage?.target_share_by_season[2023]),
  air_yards_share_2023: numeric(features.usage?.air_yards_share_by_season[2023]),
  wopr_2023: numeric(features.usage?.wopr_by_season[2023]),
  racr_2023: numeric(features.usage?.racr_by_season[2023]),
  latest_pre_target_season_age: numeric(features.age_career?.latest_pre_target_season_age),
  latest_pre_target_career_year: numeric(features.age_career?.latest_pre_target_career_year),
  undrafted_indicator: boolToNum(features.age_career?.undrafted_indicator),
  multi_team_prior_season_indicator: boolToNum(features.team_context?.multi_team_prior_season_indicator),
  multi_team_season_count: numeric(features.team_context?.multi_team_season_count),
});

const EMPTY_HISTORY: Record<string, number | null> = Object.fromEntries(
  ADDITIONAL_VALIDATION_HISTORY_COLUMNS.map((column) => [column.name, null]),
);

/**
 * Assemble the run rows from the #135/#136 refreshed mirrors: join the outcome mirror to #104
 * features (built from the refreshed input mirror rows, target_season=2024,
 * inputSeasons=[2021,2022,2023]), then assign the deterministic within-position shuffled block. The
 * shuffle depends only on player_ids and the seed -- never on outcomes.
 */
export const buildAdditionalValidationRows = (
  outcomeMirror: PlayerHistory2024OutcomeMirror,
  inputRows: readonly PlayerHistoryInputRow[],
  shuffleSeed: number = ADDITIONAL_VALIDATION_SHUFFLE_SEED,
): ControlledRunRow[] => {
  const featureRows = buildPlayerHistoryFeatures(inputRows, {
    targetSeason: TARGET_SEASON_2024,
    inputSeasons: INPUT_SEASONS_2021_2023,
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
      real_history_values: matched ? historyValuesFromAdditionalValidationFeatureRow(features as PlayerHistoryFeatureRow) : { ...EMPTY_HISTORY },
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
// Preconditions / gate: re-verified directly against the mirrors this run consumes, never trusted
// from the #136 report's counts alone.
// ---------------------------------------------------------------------------------------------

export interface AdditionalValidationCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface AdditionalValidationPreconditionsResult {
  checks: AdditionalValidationCheck[];
  blocking_reasons: string[];
  integrity_passed: boolean;
  floors_passed: boolean;
  observed_overlap: { scored_target_rows: number; joined_rows: number; joined_share: number | null; joined_rows_by_position: Record<string, number> };
}

const TARGET_OUTCOME_KEYS = ['ppr_2024_actual', 'season_ppr_2024', 'target_outcome', 'target_season_ppr'];

/**
 * Re-verify, directly against the mirrors this run is about to consume: the #136 mirror-refresh gate
 * decision, mirror identity/sha/promotion pins, leakage/scope/provenance/null-semantics integrity, and
 * the #107 population/overlap floors. Pure (no I/O), fail-closed. Integrity failures are distinct from
 * floor failures so the caller can distinguish `blocked` (integrity) from `requires_followup` (floors
 * only) exactly as the #135/#136 mirror-refresh gate does.
 */
export const evaluateAdditionalValidationPreconditions = (
  priorGate: Pick<PlayerHistory2024From2021_2023MirrorRefreshGateResult, 'status' | 'decision'>,
  outcomeMirror: PlayerHistory2024OutcomeMirror,
  inputMirror: PlayerHistory2021_2023InputMirror,
): AdditionalValidationPreconditionsResult => {
  const checks: AdditionalValidationCheck[] = [];
  const check = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ dimension, expected, observed, passed });
  };

  check(
    'prior_mirror_refresh_gate_decision',
    `status passed, decision ${REQUIRED_MIRROR_REFRESH_DECISION}`,
    `status=${priorGate.status}, decision=${priorGate.decision}`,
    priorGate.status === 'passed' && priorGate.decision === REQUIRED_MIRROR_REFRESH_DECISION,
  );

  check(
    'outcome_mirror_kind_and_source',
    `kind player_history_2024_from_2021_2023_outcome_mirror, sha ${PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025}, review ${EXPECTED_PROMOTION_REVIEW_2021_2025}, decision ${EXPECTED_PROMOTION_DECISION_2021_2025}`,
    `kind=${outcomeMirror.kind}, sha=${outcomeMirror.governed_source?.sha256}, review=${outcomeMirror.governed_source?.promotionReview}`,
    outcomeMirror.kind === 'player_history_2024_from_2021_2023_outcome_mirror' &&
      outcomeMirror.governed_source?.sha256 === PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025 &&
      outcomeMirror.governed_source?.promotionReview === EXPECTED_PROMOTION_REVIEW_2021_2025,
  );
  check(
    'input_mirror_kind_and_source',
    `kind player_history_2024_from_2021_2023_input_mirror, sha ${PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025}, review ${EXPECTED_PROMOTION_REVIEW_2021_2025}`,
    `kind=${inputMirror.kind}, sha=${inputMirror.governed_source?.sha256}, review=${inputMirror.governed_source?.promotionReview}`,
    inputMirror.kind === 'player_history_2024_from_2021_2023_input_mirror' &&
      inputMirror.governed_source?.sha256 === PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025 &&
      inputMirror.governed_source?.promotionReview === EXPECTED_PROMOTION_REVIEW_2021_2025,
  );

  const outcomeOffScope = outcomeMirror.rows.filter(
    (row) => row.season !== TARGET_SEASON_2024 || row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE || !PLAYER_HISTORY_APPROVED_POSITIONS.includes(row.position),
  ).length;
  check(
    'outcome_rows_2024_reg_approved_positions_only',
    `every row season=${TARGET_SEASON_2024}, season_type=${PLAYER_HISTORY_APPROVED_SEASON_TYPE}, position in ${PLAYER_HISTORY_APPROVED_POSITIONS.join('/')}`,
    `${outcomeOffScope} off-scope rows of ${outcomeMirror.rows.length}`,
    outcomeOffScope === 0 && outcomeMirror.rows.length > 0,
  );

  const inputSeasonSet = new Set(INPUT_SEASONS_2021_2023);
  const input2024Rows = inputMirror.rows.filter((row) => row.season === TARGET_SEASON_2024).length;
  const inputOffWindow = inputMirror.rows.filter((row) => !inputSeasonSet.has(row.season) || row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE).length;
  check(
    'input_no_2024_rows_leakage_split_preserved',
    `0 rows with season ${TARGET_SEASON_2024}; every row in ${INPUT_SEASONS_2021_2023.join('/')} ${PLAYER_HISTORY_APPROVED_SEASON_TYPE}`,
    `${input2024Rows} target-season rows, ${inputOffWindow} off-window rows of ${inputMirror.rows.length}`,
    input2024Rows === 0 && inputOffWindow === 0 && inputMirror.rows.length > 0,
  );
  const rowsWithTargetOutcome = inputMirror.rows.filter((row) => TARGET_OUTCOME_KEYS.some((key) => Object.prototype.hasOwnProperty.call(row, key))).length;
  check(
    'input_no_target_outcome_values',
    `no input row carries ${TARGET_OUTCOME_KEYS.join('/')} (2024 target values live in the outcome layer only)`,
    `${rowsWithTargetOutcome} rows carrying a target-outcome key`,
    rowsWithTargetOutcome === 0,
  );

  const allRows: Array<{ source_refs: Array<{ source_name: string }> }> = [...outcomeMirror.rows, ...inputMirror.rows];
  let rowsMissingRefs = 0;
  let unapprovedRefs = 0;
  let fixtureMarkedRefs = 0;
  let totalRefs = 0;
  for (const row of allRows) {
    const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
    if (refs.length === 0) {
      rowsMissingRefs += 1;
      continue;
    }
    for (const ref of refs) {
      totalRefs += 1;
      const name = String(ref.source_name ?? '');
      if (!EXPECTED_APPROVED_SOURCE_PREFIXES.some((prefix) => name.startsWith(prefix))) unapprovedRefs += 1;
      if (PROMOTED_FIXTURE_MARKERS.some((marker) => name.includes(marker))) fixtureMarkedRefs += 1;
    }
  }
  check('mirror_source_refs_present', 'every mirror row carries >= 1 source_ref', `${rowsMissingRefs} rows missing refs (of ${allRows.length})`, rowsMissingRefs === 0 && allRows.length > 0);
  check(
    'mirror_source_refs_prefix_approved_no_fixture_markers',
    `all refs prefix-approved (${EXPECTED_APPROVED_SOURCE_PREFIXES.join(' | ')}) and free of ${PROMOTED_FIXTURE_MARKERS.join('/')}`,
    `${unapprovedRefs} unapproved of ${totalRefs} refs, ${fixtureMarkedRefs} fixture-marked`,
    unapprovedRefs === 0 && fixtureMarkedRefs === 0 && totalRefs > 0,
  );

  let forbiddenFieldHits = 0;
  for (const row of allRows) {
    for (const key of PROMOTED_FORBIDDEN_AVAILABILITY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) forbiddenFieldHits += 1;
    }
  }
  check('no_forbidden_availability_fields', `no mirror row carries ${PROMOTED_FORBIDDEN_AVAILABILITY_KEYS.join('/')}`, `${forbiddenFieldHits} forbidden-field hits`, forbiddenFieldHits === 0);

  let zeroCoercedUsage = 0;
  let populatedUnavailableUsage = 0;
  for (const row of inputMirror.rows) {
    const usage = row.usage_summary as unknown as Record<string, number | null> | null | undefined;
    for (const field of PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS) {
      const value = usage?.[field];
      if (value !== null && value !== undefined) {
        if (value === 0) zeroCoercedUsage += 1;
        else populatedUnavailableUsage += 1;
      }
    }
  }
  check(
    'unavailable_usage_fields_remain_null',
    `${PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS.join('/')} stay null in every input row`,
    `${zeroCoercedUsage} zero-coerced, ${populatedUnavailableUsage} populated non-null values`,
    zeroCoercedUsage === 0 && populatedUnavailableUsage === 0,
  );

  const integrityChecks = [...checks];
  const integrityPassed = integrityChecks.every((c) => c.passed);

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
  const floorChecks: AdditionalValidationCheck[] = [];
  const floorCheck = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    floorChecks.push({ dimension, expected, observed, passed });
  };
  floorCheck('overlap_min_joined_rows_overall', `>= ${OVERLAP_MIN_JOINED_ROWS_OVERALL}`, `${joined}`, joined >= OVERLAP_MIN_JOINED_ROWS_OVERALL);
  for (const position of OVERLAP_REQUIRED_POSITIONS) {
    const positionJoined = joinedByPosition[position] ?? 0;
    floorCheck(`overlap_min_joined_rows_position_${position}`, `>= ${OVERLAP_MIN_JOINED_ROWS_PER_POSITION}`, `${positionJoined}`, positionJoined >= OVERLAP_MIN_JOINED_ROWS_PER_POSITION);
  }
  const joinedShare = scored > 0 ? joined / scored : null;
  floorCheck('overlap_min_joined_share', `>= ${OVERLAP_MIN_JOINED_SHARE}`, joinedShare === null ? 'undefined (no scored rows)' : joinedShare.toFixed(4), joinedShare !== null && joinedShare >= OVERLAP_MIN_JOINED_SHARE);
  const floorsPassed = floorChecks.every((c) => c.passed);
  checks.push(...floorChecks);

  const failed = checks.filter((c) => !c.passed);
  return {
    checks,
    blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
    integrity_passed: integrityPassed,
    floors_passed: floorsPassed,
    observed_overlap: { scored_target_rows: scored, joined_rows: joined, joined_share: joinedShare, joined_rows_by_position: joinedByPosition },
  };
};

// ---------------------------------------------------------------------------------------------
// Full run + report assembly.
// ---------------------------------------------------------------------------------------------

export interface AdditionalValidationReport {
  version: typeof PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_VERSION;
  issue: typeof PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_ISSUE;
  marking: typeof ADDITIONAL_VALIDATION_RESULT_MARKING;
  decision: PlayerHistory2024From2021_2023AdditionalValidationDecision;
  preconditions: AdditionalValidationPreconditionsResult;
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
  decision_rationale: string;
  boundary_statements: {
    additional_validation_run_only: true;
    uses_136_refreshed_mirrors_not_prior_mirror_families: true;
    leakage_split_preserved: true;
    no_threshold_accepted_rejected_or_amended: true;
    no_production_binding_authorized: true;
    no_product_facing_signal_claimed: true;
    no_fantasy_advice_or_rankings_output: true;
    no_tiber_data_change: true;
    metrics_exist_only_inside_this_report: true;
    positive_decision_authorizes_only_a_separate_threshold_review_issue: true;
  };
}

const metricsForSubset = (
  predictions: readonly ControlledRunPrediction[],
  filter: (prediction: ControlledRunPrediction) => boolean,
): Record<ControlledRunArm, ControlledRunMetrics> => {
  const subset = predictions.filter(filter);
  return Object.fromEntries(
    ADDITIONAL_VALIDATION_ARMS.map((arm) => [
      arm,
      computeControlledRunMetrics(subset.map((prediction) => ({ actual: prediction.actual, predicted: prediction.predictions[arm] }))),
    ]),
  ) as Record<ControlledRunArm, ControlledRunMetrics>;
};

const BOUNDARY_STATEMENTS: AdditionalValidationReport['boundary_statements'] = {
  additional_validation_run_only: true,
  uses_136_refreshed_mirrors_not_prior_mirror_families: true,
  leakage_split_preserved: true,
  no_threshold_accepted_rejected_or_amended: true,
  no_production_binding_authorized: true,
  no_product_facing_signal_claimed: true,
  no_fantasy_advice_or_rankings_output: true,
  no_tiber_data_change: true,
  metrics_exist_only_inside_this_report: true,
  positive_decision_authorizes_only_a_separate_threshold_review_issue: true,
};

const emptyMetricsByArm = (): Record<ControlledRunArm, ControlledRunMetrics> =>
  Object.fromEntries(ADDITIONAL_VALIDATION_ARMS.map((arm) => [arm, { n: 0, mae: null, rmse: null, pearson: null, spearman: null }])) as Record<
    ControlledRunArm,
    ControlledRunMetrics
  >;

/**
 * Execute the full 2024-from-2021-2023 additional-validation run. Pure given its inputs;
 * deterministic for a fixed seed. Re-verifies preconditions directly against the mirrors passed in --
 * never trusts a stale/prior report's counts. Returns a `blocked` report (no metrics computed) if
 * integrity preconditions fail; computes metrics but marks `requires_followup` if only the
 * population/overlap floors fail; otherwise emits the ceiling decision.
 */
export const executePlayerHistory2024From2021_2023AdditionalValidation = (
  outcomeMirror: PlayerHistory2024OutcomeMirror,
  inputMirror: PlayerHistory2021_2023InputMirror,
  priorGate: Pick<PlayerHistory2024From2021_2023MirrorRefreshGateResult, 'status' | 'decision'>,
  shuffleSeed: number = ADDITIONAL_VALIDATION_SHUFFLE_SEED,
  lambda: number = ADDITIONAL_VALIDATION_RIDGE_LAMBDA,
  historyColumns: readonly ControlledRunFeatureColumn[] = ADDITIONAL_VALIDATION_HISTORY_COLUMNS,
): { report: AdditionalValidationReport; predictions: ControlledRunPrediction[] } => {
  const preconditions = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, inputMirror);

  const baseReport = {
    version: PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_VERSION,
    issue: PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_ISSUE,
    marking: ADDITIONAL_VALIDATION_RESULT_MARKING,
    preconditions,
    arms: ADDITIONAL_VALIDATION_ARMS,
    fold_design: {
      method: 'leave_one_out_cross_validation' as const,
      folds: 0,
      imputation: 'train_fold_mean_via_104_primitives' as const,
      standardization: 'train_fold_only_z_score' as const,
      ridge_lambda: lambda,
      shuffle_seed: shuffleSeed,
      shuffle_method: 'seeded_derangement_within_position_pre_outcome_independent' as const,
    },
    boundary_statements: BOUNDARY_STATEMENTS,
  };

  if (!preconditions.integrity_passed) {
    return {
      report: {
        ...baseReport,
        decision: 'player_history_2024_from_2021_2023_additional_validation_blocked',
        population: { evaluated_rows: 0, joined_rows: 0, no_history_rows: 0, by_position: {}, shuffled_control_integrity: { donors_assigned: 0, self_donations: 0, cross_position_donations: 0 } },
        metrics_by_arm: { overall: emptyMetricsByArm(), joined_only: emptyMetricsByArm(), no_history_only: emptyMetricsByArm(), per_position: {} },
        comparisons: [],
        decision_rationale:
          'A mirror-identity, leakage, provenance, or prior-gate-decision precondition failed; the run did not execute and no metric was computed. The refreshed mirrors must not be used until the first blocking reason is fixed.',
      },
      predictions: [],
    };
  }

  const rows = buildAdditionalValidationRows(outcomeMirror, inputMirror.rows, shuffleSeed);
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
  const comparisons: AdditionalValidationReport['comparisons'] = [];
  const subgroups: Array<[string, Record<ControlledRunArm, ControlledRunMetrics>]> = [
    ['overall', overall],
    ['joined_only', joinedOnly],
    ['no_history_only', noHistoryOnly],
    ...Object.entries(perPosition).map(([position, metrics]): [string, Record<ControlledRunArm, ControlledRunMetrics>] => [`position_${position}`, metrics]),
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

  const requiredJoinedMetricsDefined = ADDITIONAL_VALIDATION_ARMS.every((arm) => joinedOnly[arm].mae !== null && joinedOnly[arm].rmse !== null);

  let decision: PlayerHistory2024From2021_2023AdditionalValidationDecision;
  let decisionRationale: string;
  if (!preconditions.floors_passed || !requiredJoinedMetricsDefined) {
    decision = 'player_history_2024_from_2021_2023_additional_validation_requires_followup';
    decisionRationale = !preconditions.floors_passed
      ? 'Mirror identity, leakage, and provenance integrity all re-verified, but a #107 population/overlap floor did not clear when recomputed directly from the mirrors. Metrics are reported for transparency but must not be used to open the threshold-review issue yet.'
      : 'Mirror identity, leakage, provenance, and the #107 floors all re-verified, but a required joined-population metric came back undefined. The run requires follow-up before the threshold-review issue may be opened.';
  } else {
    decision = 'may_open_player_history_2024_from_2021_2023_threshold_review_issue';
    decisionRationale =
      'Mirror identity, leakage/provenance integrity, and the #107 population/overlap floors all re-verified directly against the #136 refreshed mirrors, and every required joined-population metric is defined. A SEPARATE issue may be opened to consider a threshold; this decision does not itself accept, reject, or amend any threshold, and does not bind production behavior.';
  }

  return {
    report: {
      ...baseReport,
      decision,
      fold_design: { ...baseReport.fold_design, folds: rows.length },
      population: {
        evaluated_rows: rows.length,
        joined_rows: rows.filter((row) => row.has_player_history).length,
        no_history_rows: rows.filter((row) => !row.has_player_history).length,
        by_position: byPosition,
        shuffled_control_integrity: { donors_assigned: donorsAssigned, self_donations: selfDonations, cross_position_donations: crossPosition },
      },
      metrics_by_arm: { overall, joined_only: joinedOnly, no_history_only: noHistoryOnly, per_position: perPosition },
      comparisons,
      decision_rationale: decisionRationale,
    },
    predictions,
  };
};

/** Re-exported so the CLI script and tests do not need to reach into #135/#136's module directly. */
export const ADDITIONAL_VALIDATION_MIRROR_PATHS = { outcome: OUTCOME_MIRROR_PATH_2024, input: INPUT_MIRROR_PATH_2021_2023 };
