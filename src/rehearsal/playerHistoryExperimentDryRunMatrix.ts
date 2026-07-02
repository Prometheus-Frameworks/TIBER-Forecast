/**
 * Controlled player-history experiment DRY-RUN matrix builder (Forecast #105).
 *
 * Assembles the matrix shape a LATER controlled run would consume, following the design in #101/#102
 * and the feature-extraction scaffold merged in #103/PR #104. It joins/aligns:
 *
 * - the existing accepted Forecast baseline target population (currently the n=38 scored
 *   seasonal-PPR fixture scaffold -- documented as fixture, warned about in the report),
 * - real player-history features built by the #104 scaffold (never reimplemented here),
 * - a deterministic, position-stratified shuffled-control arm SHAPE,
 * - row-level provenance and exclusion reasons.
 *
 * Every boundary from #104 is inherited by delegating feature construction to
 * `buildPlayerHistoryFeatures` with an explicit input window: target-season leakage, the approved
 * 2022-2024 input window, REG-only season_type, QB/RB/WR/TE-only positions, and forbidden
 * availability/ownership fields all fail closed inside the scaffold before any matrix row is built.
 *
 * DRY RUN ONLY. This module does NOT: run Forecast, create Run 3, train/tune/evaluate/compare a
 * model, compute MAE/RMSE/Pearson/rank-correlation, change the baseline, bind features into
 * `seasonalPprModel.ts`, fit imputation statistics over the target population, standardize a design
 * matrix, coerce null to zero, or claim any signal. Baseline outcome values (`ppr_2025_actual`) are
 * deliberately NOT copied into matrix rows -- only their presence is recorded -- so this artifact
 * cannot be silently reused as a training/evaluation table.
 */

import type { SeasonalPlayerObservation } from '../contracts/seasonalPprBacktest.js';
import {
  ALL_PLAYER_HISTORY_FEATURE_FAMILIES,
  buildPlayerHistoryFeatures,
  type PlayerHistoryFeatureFamily,
  type PlayerHistoryFeatureRow,
  type PlayerHistoryInputRow,
} from './playerHistoryFeatureScaffold.js';
import { isDerangement, seededDerangement } from './util/seededShuffle.js';

export const PLAYER_HISTORY_DRY_RUN_MATRIX_VERSION = 'player-history-experiment-dry-run-matrix-v1' as const;

export const PLAYER_HISTORY_DRY_RUN_ROW_KIND = 'player_history_experiment_dry_run_matrix_row_not_model_ready' as const;

/** The three future arms. Labels/shape only -- this module never evaluates arm performance. */
export const PLAYER_HISTORY_EXPERIMENT_ARMS = [
  'baseline_only',
  'real_player_history_features',
  'shuffled_player_history_control',
] as const;

export type PlayerHistoryExperimentArm = (typeof PLAYER_HISTORY_EXPERIMENT_ARMS)[number];

/** Deterministic default seed for the shuffled-control shape. Same seed -> same assignment. */
export const PLAYER_HISTORY_DRY_RUN_SHUFFLE_SEED = 20260702;

export const PLAYER_HISTORY_DRY_RUN_SHUFFLE_METHOD = 'seeded_derangement_within_position' as const;

/**
 * The null-handling posture every matrix row carries. Later train-fold imputation (the #104
 * primitives) would compute per-column means from TRAINING-fold rows only, per fold; nothing is
 * fitted here and no null is encoded as zero.
 */
export const PLAYER_HISTORY_DRY_RUN_NULL_POSTURE =
  'nulls_preserved_no_zero_coercion_train_fold_mean_imputation_deferred_to_run_issue' as const;

export type PlayerHistoryDryRunExclusionReason =
  | 'target_outcome_unavailable'
  | 'player_history_features_without_target_row'
  | 'position_mismatch_between_target_and_player_history';

export interface PlayerHistoryDryRunExclusion {
  player_id: string;
  player_name: string;
  position: string;
  reason: PlayerHistoryDryRunExclusionReason;
  detail: string;
}

export interface PlayerHistoryDryRunShuffledControl {
  /** 'assigned' when a within-position donor payload exists; otherwise why not. */
  posture: 'assigned' | 'identity_unavoidable_single_row_group' | 'no_feature_bearing_rows_in_group' | 'row_has_no_real_features';
  /** player_id whose real features this row would receive in the shuffled arm; null when unassigned. */
  donor_player_id: string | null;
  /** The donor's real feature payload (within-position); null when unassigned. */
  payload: PlayerHistoryFeatureRow | null;
}

export interface PlayerHistoryDryRunMatrixRow {
  row_kind: typeof PLAYER_HISTORY_DRY_RUN_ROW_KIND;
  status: 'dry_run_only_not_model_ready';
  player_id: string;
  player_name: string;
  position: string;
  target_season: number;
  /**
   * Reference-only pointer to the baseline/target fixture row. The 2025 outcome VALUE is not copied
   * here -- only its presence -- so this matrix cannot double as an evaluation table.
   */
  target_row_ref: {
    source: string;
    governance_status: string;
    target_outcome_present: boolean;
    outcome_value_deliberately_omitted: true;
  };
  baseline_row_ref: string;
  input_seasons_considered: number[];
  /** Per-family availability for THIS row's real player-history features (all false when no join). */
  feature_family_availability: Record<PlayerHistoryFeatureFamily, boolean>;
  real_feature_join_status: 'joined' | 'no_player_history_features_for_player' | 'position_mismatch_features_excluded';
  /** The #104 scaffold's feature row for this player, verbatim; null when no features joined. */
  real_player_history: PlayerHistoryFeatureRow | null;
  shuffled_control: PlayerHistoryDryRunShuffledControl;
  null_handling_posture: typeof PLAYER_HISTORY_DRY_RUN_NULL_POSTURE;
  source_refs: string[];
}

export interface PlayerHistoryDryRunShuffleGroupReport {
  position: string;
  feature_bearing_row_count: number;
  derangement_possible: boolean;
  derangement_applied: boolean;
  note: string;
}

export interface PlayerHistoryDryRunJoinSummary {
  target_population_size: number;
  scored_target_rows: number;
  unavailable_target_rows: number;
  player_history_feature_players: number;
  joined_rows: number;
  target_rows_without_player_history_features: number;
  feature_players_without_target_row: number;
  exclusions: PlayerHistoryDryRunExclusion[];
}

export interface PlayerHistoryDryRunFamilyCoverage {
  family: PlayerHistoryFeatureFamily;
  rows_with_family_available: number;
  matrix_rows_total: number;
}

export interface PlayerHistoryDryRunMissingnessSummary {
  joined_rows_inspected: number;
  /** Per numeric feature-leaf path: how many joined rows carry null there. Empty when no joins. */
  null_counts_by_feature_path: Record<string, number>;
  /** Real zeros observed in joined payloads -- proof zeros are preserved distinct from nulls. */
  zero_value_paths_observed: string[];
}

export interface BuildPlayerHistoryDryRunMatrixInput {
  /** The accepted Forecast baseline/target population (today: the seasonal PPR seed snapshot). */
  targetPopulation: readonly SeasonalPlayerObservation[];
  /** Raw pre-target player-history rows (e.g. the #104 input mirror's rows). */
  playerHistoryRows: readonly PlayerHistoryInputRow[];
  targetSeason: number;
  inputSeasons: readonly number[];
  /** Where the target population came from + its governance posture, echoed into every row/report. */
  baselineSource: { path: string; governance_status: string; data_source: string };
  /** Provenance strings for the player-history side (mirror path, TIBER-Data artifact + sha). */
  playerHistorySourceRefs: readonly string[];
  shuffleSeed?: number;
}

export interface PlayerHistoryDryRunMatrixReport {
  version: typeof PLAYER_HISTORY_DRY_RUN_MATRIX_VERSION;
  row_kind: typeof PLAYER_HISTORY_DRY_RUN_ROW_KIND;
  status: 'dry_run_only_not_model_ready';
  target_season: number;
  input_seasons: number[];
  arms: readonly PlayerHistoryExperimentArm[];
  baseline_source: { path: string; governance_status: string; data_source: string };
  baseline_population_is_fixture_scaffold_warning: string | null;
  matrix_rows: PlayerHistoryDryRunMatrixRow[];
  join_summary: PlayerHistoryDryRunJoinSummary;
  family_coverage: PlayerHistoryDryRunFamilyCoverage[];
  missingness: PlayerHistoryDryRunMissingnessSummary;
  shuffled_control: {
    method: typeof PLAYER_HISTORY_DRY_RUN_SHUFFLE_METHOD;
    seed: number;
    stratified_by_position: true;
    groups: PlayerHistoryDryRunShuffleGroupReport[];
    metrics_computed: false;
    note: string;
  };
  null_handling_posture: typeof PLAYER_HISTORY_DRY_RUN_NULL_POSTURE;
  boundary_statements: {
    no_forecast_run: true;
    no_run3: true;
    no_model_training_tuning_evaluation: true;
    no_mae_rmse_pearson_rank_correlation_computed: true;
    no_baseline_change: true;
    no_production_feature_binding: true;
    no_seasonal_ppr_model_wiring: true;
    no_tiber_data_or_teamstate_change: true;
    no_null_to_zero_coercion: true;
    no_signal_claim: true;
    no_fantasy_advice_or_product_output: true;
  };
}

/** Collect numeric-leaf null counts + real-zero paths from a joined feature payload. Read-only. */
const inspectPayloadMissingness = (
  payload: PlayerHistoryFeatureRow,
  nullCounts: Record<string, number>,
  zeroPaths: Set<string>,
): void => {
  const walk = (value: unknown, path: string): void => {
    if (value === null) {
      nullCounts[path] = (nullCounts[path] ?? 0) + 1;
      return;
    }
    if (typeof value === 'number') {
      if (value === 0) zeroPaths.add(path);
      return;
    }
    if (Array.isArray(value)) return; // arrays here are labels/refs, not numeric feature cells
    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        walk(nested, path === '' ? key : `${path}.${key}`);
      }
    }
  };
  for (const family of ALL_PLAYER_HISTORY_FEATURE_FAMILIES) {
    const familyPayload = payload[family];
    if (familyPayload !== undefined) walk(familyPayload, family);
  }
};

/**
 * Build the dry-run experiment matrix. Deterministic: same inputs + seed -> byte-identical report.
 * Pure, no I/O. All #104 fail-closed guards apply via the delegated feature build; the target
 * population is additionally required to be QB/RB/WR/TE by its own `ScoringPosition` type.
 */
export const buildPlayerHistoryExperimentDryRunMatrix = (
  input: BuildPlayerHistoryDryRunMatrixInput,
): PlayerHistoryDryRunMatrixReport => {
  const seed = input.shuffleSeed ?? PLAYER_HISTORY_DRY_RUN_SHUFFLE_SEED;

  // 1. Real player-history features via the #104 scaffold -- inherits every fail-closed boundary
  //    (leakage, input window, REG-only, positions, forbidden status fields). Never reimplemented.
  const featureRows = buildPlayerHistoryFeatures(input.playerHistoryRows, {
    targetSeason: input.targetSeason,
    inputSeasons: input.inputSeasons,
  });
  const featuresByPlayer = new Map(featureRows.map((row) => [row.player_id, row]));

  // 2. Split the target population: scored rows enter the matrix; rows with no observed outcome are
  //    excluded with a reason (never silently dropped, never zero-filled).
  const exclusions: PlayerHistoryDryRunExclusion[] = [];
  const scored = input.targetPopulation.filter((row) => {
    if (row.ppr_2025_actual === null) {
      exclusions.push({
        player_id: row.player_id,
        player_name: row.player_name,
        position: row.position,
        reason: 'target_outcome_unavailable',
        detail: `ppr_${input.targetSeason}_actual is null in the baseline population; a row with no observed target outcome cannot be evaluated by a later run and is excluded from the dry-run matrix.`,
      });
      return false;
    }
    return true;
  });

  // 3. Feature players with no target row are exclusions too -- they can never be scored.
  const targetIds = new Set(input.targetPopulation.map((row) => row.player_id));
  for (const featureRow of featureRows) {
    if (!targetIds.has(featureRow.player_id)) {
      exclusions.push({
        player_id: featureRow.player_id,
        player_name: featureRow.player_name,
        position: featureRow.position,
        reason: 'player_history_features_without_target_row',
        detail: 'Player-history features exist but the player is not in the baseline/target population, so no future arm could score this row.',
      });
    }
  }

  // 4. One matrix row per scored target-population player, deterministically ordered by player_id.
  const orderedScored = [...scored].sort((a, b) => (a.player_id < b.player_id ? -1 : a.player_id > b.player_id ? 1 : 0));
  const rows: PlayerHistoryDryRunMatrixRow[] = orderedScored.map((target) => {
    const candidate = featuresByPlayer.get(target.player_id) ?? null;
    // A player_id match is not enough: if the target population and the player-history features
    // disagree on position (a position-switch player), joining would let a payload from one position
    // enter -- and be donated within -- another position's shuffle group, breaking the documented
    // within-position control. The mismatched payload is excluded with a reason; the target row stays
    // in the matrix as a baseline-eligible, feature-less row.
    const positionMismatch = candidate !== null && candidate.position !== target.position;
    if (positionMismatch) {
      exclusions.push({
        player_id: target.player_id,
        player_name: target.player_name,
        position: target.position,
        reason: 'position_mismatch_between_target_and_player_history',
        detail: `Target population lists position=${target.position} but the player-history feature row carries position=${candidate!.position}; the feature payload is excluded so a ${candidate!.position} history can never enter or be donated within the ${target.position} shuffle group.`,
      });
    }
    const features = positionMismatch ? null : candidate;
    const familyAvailability = Object.fromEntries(
      ALL_PLAYER_HISTORY_FEATURE_FAMILIES.map((family) => [family, features !== null && features[family] !== undefined]),
    ) as Record<PlayerHistoryFeatureFamily, boolean>;
    return {
      row_kind: PLAYER_HISTORY_DRY_RUN_ROW_KIND,
      status: 'dry_run_only_not_model_ready',
      player_id: target.player_id,
      player_name: target.player_name,
      position: target.position,
      target_season: input.targetSeason,
      target_row_ref: {
        source: input.baselineSource.path,
        governance_status: input.baselineSource.governance_status,
        target_outcome_present: true,
        outcome_value_deliberately_omitted: true,
      },
      baseline_row_ref: `${input.baselineSource.path}#player_id=${target.player_id}`,
      input_seasons_considered: features?.input_seasons_considered ?? [],
      feature_family_availability: familyAvailability,
      real_feature_join_status: features !== null ? 'joined' : positionMismatch ? 'position_mismatch_features_excluded' : 'no_player_history_features_for_player',
      real_player_history: features,
      shuffled_control: {
        posture: 'row_has_no_real_features',
        donor_player_id: null,
        payload: null,
      },
      null_handling_posture: PLAYER_HISTORY_DRY_RUN_NULL_POSTURE,
      source_refs: [...input.playerHistorySourceRefs, input.baselineSource.path],
    };
  });

  // 5. Shuffled-control shape: within-position seeded derangement over the feature-bearing rows ONLY.
  //    Never across positions. Groups too small to derange are reported honestly, not repaired.
  const groupReports: PlayerHistoryDryRunShuffleGroupReport[] = [];
  const positions = [...new Set(rows.map((row) => row.position))].sort();
  for (const position of positions) {
    const group = rows.filter((row) => row.position === position && row.real_player_history !== null);
    if (group.length === 0) {
      groupReports.push({
        position,
        feature_bearing_row_count: 0,
        derangement_possible: false,
        derangement_applied: false,
        note: 'No feature-bearing rows in this position group; nothing to shuffle.',
      });
      continue;
    }
    if (group.length === 1) {
      group[0]!.shuffled_control = {
        posture: 'identity_unavoidable_single_row_group',
        donor_player_id: null,
        payload: null,
      };
      groupReports.push({
        position,
        feature_bearing_row_count: 1,
        derangement_possible: false,
        derangement_applied: false,
        note: 'Single feature-bearing row: a derangement is impossible at this sample size, so no shuffled payload is assigned rather than self-assigning.',
      });
      continue;
    }
    // Deterministic per-group seed offset keeps assignments independent across positions while the
    // overall run stays a pure function of the top-level seed.
    const groupSeed = (seed + position.charCodeAt(0) * 7919) | 0;
    const perm = seededDerangement(group.length, groupSeed);
    for (let i = 0; i < group.length; i += 1) {
      const donor = group[perm[i]!]!;
      group[i]!.shuffled_control = {
        posture: 'assigned',
        donor_player_id: donor.player_id,
        payload: donor.real_player_history,
      };
    }
    groupReports.push({
      position,
      feature_bearing_row_count: group.length,
      derangement_possible: true,
      derangement_applied: isDerangement(perm),
      note: `Seeded within-position derangement over ${group.length} feature-bearing rows; deterministic for seed ${seed}.`,
    });
  }

  // 6. Coverage + missingness (read-only counting; no statistics are fitted).
  const familyCoverage: PlayerHistoryDryRunFamilyCoverage[] = ALL_PLAYER_HISTORY_FEATURE_FAMILIES.map((family) => ({
    family,
    rows_with_family_available: rows.filter((row) => row.feature_family_availability[family]).length,
    matrix_rows_total: rows.length,
  }));
  const nullCounts: Record<string, number> = {};
  const zeroPaths = new Set<string>();
  const joinedRows = rows.filter((row) => row.real_player_history !== null);
  for (const row of joinedRows) inspectPayloadMissingness(row.real_player_history!, nullCounts, zeroPaths);

  const joinSummary: PlayerHistoryDryRunJoinSummary = {
    target_population_size: input.targetPopulation.length,
    scored_target_rows: scored.length,
    unavailable_target_rows: input.targetPopulation.length - scored.length,
    player_history_feature_players: featureRows.length,
    joined_rows: joinedRows.length,
    target_rows_without_player_history_features: rows.length - joinedRows.length,
    feature_players_without_target_row: exclusions.filter((e) => e.reason === 'player_history_features_without_target_row').length,
    exclusions,
  };

  return {
    version: PLAYER_HISTORY_DRY_RUN_MATRIX_VERSION,
    row_kind: PLAYER_HISTORY_DRY_RUN_ROW_KIND,
    status: 'dry_run_only_not_model_ready',
    target_season: input.targetSeason,
    input_seasons: [...input.inputSeasons],
    arms: PLAYER_HISTORY_EXPERIMENT_ARMS,
    baseline_source: { ...input.baselineSource },
    baseline_population_is_fixture_scaffold_warning:
      input.baselineSource.governance_status === 'fixture'
        ? `The current target population (${input.baselineSource.path}) is still the fixture/scaffold population (governance_status=fixture, n=${scored.length} scored). A later controlled run should prefer a real mounted TIBER-Data 2025 outcome population; the run-authorizing issue must state which population is used.`
        : null,
    matrix_rows: rows,
    join_summary: joinSummary,
    family_coverage: familyCoverage,
    missingness: {
      joined_rows_inspected: joinedRows.length,
      null_counts_by_feature_path: nullCounts,
      zero_value_paths_observed: [...zeroPaths].sort(),
    },
    shuffled_control: {
      method: PLAYER_HISTORY_DRY_RUN_SHUFFLE_METHOD,
      seed,
      stratified_by_position: true,
      groups: groupReports,
      metrics_computed: false,
      note: 'Shuffled-control SHAPE only: deterministic within-position donor assignment over feature-bearing rows. No arm was run, no metric was computed, and no comparison is implied. Groups where a derangement is impossible are reported, not repaired.',
    },
    null_handling_posture: PLAYER_HISTORY_DRY_RUN_NULL_POSTURE,
    boundary_statements: {
      no_forecast_run: true,
      no_run3: true,
      no_model_training_tuning_evaluation: true,
      no_mae_rmse_pearson_rank_correlation_computed: true,
      no_baseline_change: true,
      no_production_feature_binding: true,
      no_seasonal_ppr_model_wiring: true,
      no_tiber_data_or_teamstate_change: true,
      no_null_to_zero_coercion: true,
      no_signal_claim: true,
      no_fantasy_advice_or_product_output: true,
    },
  };
};
