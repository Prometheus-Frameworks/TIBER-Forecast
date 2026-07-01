/**
 * Player-history feature extraction scaffold (Forecast #103).
 *
 * Implements the extraction boundary defined by the controlled experiment design in #101 / PR #102,
 * following the coverage/provenance gate in #99 / PR #100 (`player_season_coverage_gate_passed` →
 * `may_design_experiment`). This module is scaffold/feature-extraction ONLY:
 *
 * - pure, deterministic functions; no network access; no file I/O inside the core functions,
 * - structurally enforces `row.season < targetSeason` (never relies on caller discipline),
 * - each candidate feature family (coverage, production, usage, age/career, team context) is
 *   independently toggleable so a later ablation run can turn families on/off,
 * - never fabricates a null value (missing prior season / null birth_date / null rookie_year all stay
 *   null, never zero-filled or estimated),
 * - never emits an active/inactive/IR/practice-squad/ownership field,
 * - includes a reusable, tested, pure train-fold-mean imputation helper (adapted from
 *   `runRun2TeamstateComparison.ts`) for later model code to use -- this module does NOT train,
 *   evaluate, or bind anything into `seasonalPprModel.ts`.
 *
 * No Forecast run. No Run 3. No model training/tuning/evaluation. No feature binding. No baseline
 * change. No TIBER-Data/Teamstate change. No signal claim.
 */

export const PLAYER_HISTORY_FEATURE_SCAFFOLD_VERSION = 'player-history-feature-scaffold-v1' as const;

/** Fields a player-history input row must never carry; presence fails the whole build closed. */
const FORBIDDEN_AVAILABILITY_KEYS: readonly string[] = [
  'active_status',
  'ownership_status',
  'roster_status',
  'active_roster_status',
];

/** Usage fields that are 100% unavailable in the source artifact; always excluded, never zero-filled. */
export const EXCLUDED_UNAVAILABLE_USAGE_FIELDS: readonly string[] = [
  'snap_share',
  'routes_run',
  'route_participation',
  'red_zone_targets',
  'red_zone_carries',
];

export type PlayerHistoryFeatureFamily = 'coverage' | 'production' | 'usage' | 'age_career' | 'team_context';

export const ALL_PLAYER_HISTORY_FEATURE_FAMILIES: readonly PlayerHistoryFeatureFamily[] = [
  'coverage',
  'production',
  'usage',
  'age_career',
  'team_context',
];

export interface PlayerHistorySourceRef {
  source_name: string;
  observed_at: string | null;
}

export interface PlayerHistoryUsageSummary {
  targets: number | null;
  receptions: number | null;
  rushing_attempts: number | null;
  receiving_air_yards: number | null;
  target_share: number | null;
  air_yards_share: number | null;
  wopr: number | null;
  racr: number | null;
  snap_share: number | null;
  routes_run: number | null;
  route_participation: number | null;
  red_zone_targets: number | null;
  red_zone_carries: number | null;
}

export interface PlayerHistoryProductionSummary {
  season_ppr: number | null;
  season_ppg: number | null;
  games_for_ppg: number | null;
}

/**
 * A single pre-target player-season row, shaped after TIBER-Data's `player_season_coverage_v0`
 * candidate rows. `[key: string]: unknown` intentionally allows a test to inject an unexpected key
 * (e.g. a forbidden availability field) so {@link buildPlayerHistoryFeatures} can detect and reject it.
 */
export interface PlayerHistoryInputRow {
  player_id: string;
  player_name: string;
  position: string;
  season: number;
  season_type: string;
  identity_confidence: string;
  source_refs: PlayerHistorySourceRef[];
  teams: string[];
  primary_team: string | null;
  primary_team_rule: string | null;
  weeks_observed: number;
  coverage_status: string;
  missing_fields: string[];
  production_summary: PlayerHistoryProductionSummary;
  usage_summary: PlayerHistoryUsageSummary;
  birth_date: string | null;
  season_age: number | null;
  draft_year: number | null;
  rookie_year: number | null;
  career_year: number | null;
  [unexpectedKey: string]: unknown;
}

export interface PlayerHistoryFeatureOptions {
  targetSeason: number;
  /** Defaults to all families. Pass a subset for a later ablation arm. */
  families?: readonly PlayerHistoryFeatureFamily[];
}

export interface PlayerHistoryCoverageFeatures {
  prior_seasons_observed_count: number;
  prior_weeks_observed_total: number;
  prior_weeks_observed_mean: number | null;
  coverage_status_counts: Record<string, number>;
  /** Mean count of `missing_fields` entries across observed prior seasons; null if none observed. */
  missingness_rate: number | null;
}

export interface PlayerHistoryProductionFeatures {
  /** Keyed only by seasons where a row actually exists; a present key with value 0 is a real zero. */
  season_ppr_by_season: Record<number, number | null>;
  season_ppg_by_season: Record<number, number | null>;
  /** Sum of the 2 most recent pre-target seasons' season_ppr -- null unless BOTH are present. */
  trailing_2yr_ppr_total: number | null;
  /** Sum of all 3 input-window seasons' season_ppr -- null unless ALL 3 are present. */
  trailing_3yr_ppr_total: number | null;
  trailing_2yr_ppr_mean: number | null;
  trailing_3yr_ppr_mean: number | null;
  /** Most-recent-minus-second-most-recent season_ppr -- null unless both consecutive seasons present. */
  year_over_year_ppr_trend: number | null;
}

export interface PlayerHistoryUsageFeatures {
  targets_by_season: Record<number, number | null>;
  receptions_by_season: Record<number, number | null>;
  rushing_attempts_by_season: Record<number, number | null>;
  receiving_air_yards_by_season: Record<number, number | null>;
  target_share_by_season: Record<number, number | null>;
  air_yards_share_by_season: Record<number, number | null>;
  wopr_by_season: Record<number, number | null>;
  racr_by_season: Record<number, number | null>;
  /** Documents which source usage fields are structurally excluded (never populated by TIBER-Data). */
  unavailable_fields_excluded: readonly string[];
}

export interface PlayerHistoryAgeCareerFeatures {
  /** From the most recent pre-target row; null if that row's birth_date is null (never fabricated). */
  latest_pre_target_season_age: number | null;
  /** From the most recent pre-target row; null if that row's rookie_year is null (never fabricated). */
  latest_pre_target_career_year: number | null;
  draft_year: number | null;
  rookie_year: number | null;
  /**
   * true only when the most recent pre-target row is identity-verified (`identity_confidence ===
   * 'source_verified'`) AND carries a null `draft_year` -- a confirmed absence of a draft record, not
   * an unverified/unknown identity. null when identity is not source-verified (unknown, not asserted).
   */
  undrafted_indicator: boolean | null;
}

export interface PlayerHistoryTeamContextFeatures {
  /** teams[] is team-of-record in weekly production rows -- NOT roster membership, NOT active status. */
  multi_team_prior_season_indicator: boolean;
  multi_team_season_count: number;
  latest_primary_team: string | null;
}

export interface PlayerHistoryFeatureRow {
  row_kind: 'player_history_feature_candidate_not_model_ready';
  player_id: string;
  player_name: string;
  position: string;
  target_season: number;
  /** The row.season values actually used after the structural leakage filter, ascending. */
  input_seasons_considered: number[];
  coverage?: PlayerHistoryCoverageFeatures;
  production?: PlayerHistoryProductionFeatures;
  usage?: PlayerHistoryUsageFeatures;
  age_career?: PlayerHistoryAgeCareerFeatures;
  team_context?: PlayerHistoryTeamContextFeatures;
}

export interface PlayerHistoryCoverageSummary {
  target_season: number;
  input_seasons_present: number[];
  total_players: number;
  players_by_seasons_observed_count: Record<number, number>;
  rows_considered: number;
  rows_rejected_for_leakage: number;
}

const hasForbiddenAvailabilityField = (row: PlayerHistoryInputRow): string[] =>
  FORBIDDEN_AVAILABILITY_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(row, key));

/** Throws (fails closed) if any row carries a forbidden availability/ownership field. */
export const assertNoForbiddenAvailabilityFields = (rows: readonly PlayerHistoryInputRow[]): void => {
  for (const row of rows) {
    const forbidden = hasForbiddenAvailabilityField(row);
    if (forbidden.length > 0) {
      throw new Error(
        `player-history scaffold: row for player_id=${row.player_id} season=${row.season} carries forbidden availability field(s): ${forbidden.join(', ')}. This scaffold must never emit or consume active/inactive/ownership status.`,
      );
    }
  }
};

/**
 * Structural leakage guard: `row.season < targetSeason`. Never relies on caller discipline -- every
 * entry point in this module calls this before building any feature.
 */
export const filterPlayerHistoryInputRows = (
  rows: readonly PlayerHistoryInputRow[],
  targetSeason: number,
): PlayerHistoryInputRow[] => rows.filter((row) => row.season < targetSeason);

const groupByPlayer = (rows: readonly PlayerHistoryInputRow[]): Map<string, PlayerHistoryInputRow[]> => {
  const grouped = new Map<string, PlayerHistoryInputRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.player_id);
    if (existing) existing.push(row);
    else grouped.set(row.player_id, [row]);
  }
  for (const playerRows of grouped.values()) playerRows.sort((a, b) => a.season - b.season);
  return grouped;
};

const buildCoverageFeatures = (playerRows: readonly PlayerHistoryInputRow[]): PlayerHistoryCoverageFeatures => {
  const weeksObserved = playerRows.map((row) => row.weeks_observed);
  const statusCounts: Record<string, number> = {};
  for (const row of playerRows) statusCounts[row.coverage_status] = (statusCounts[row.coverage_status] ?? 0) + 1;
  const missingCounts = playerRows.map((row) => row.missing_fields.length);
  return {
    prior_seasons_observed_count: playerRows.length,
    prior_weeks_observed_total: weeksObserved.reduce((sum, value) => sum + value, 0),
    prior_weeks_observed_mean: playerRows.length > 0 ? weeksObserved.reduce((sum, value) => sum + value, 0) / playerRows.length : null,
    coverage_status_counts: statusCounts,
    missingness_rate: playerRows.length > 0 ? missingCounts.reduce((sum, value) => sum + value, 0) / playerRows.length : null,
  };
};

const buildProductionFeatures = (
  playerRows: readonly PlayerHistoryInputRow[],
  targetSeason: number,
): PlayerHistoryProductionFeatures => {
  const byPpr: Record<number, number | null> = {};
  const byPpg: Record<number, number | null> = {};
  for (const row of playerRows) {
    byPpr[row.season] = row.production_summary.season_ppr;
    byPpg[row.season] = row.production_summary.season_ppg;
  }

  // Anchored to targetSeason, NOT to whichever season the player happened to last appear in -- if the
  // immediate pre-target season is missing entirely (e.g. a player observed in 2022-2023 but not 2024,
  // for a 2025 target), the trailing window must null out rather than silently substitute older seasons.
  const twoMostRecent = [targetSeason - 1, targetSeason - 2];
  const threeMostRecent = [targetSeason - 1, targetSeason - 2, targetSeason - 3];
  const pprFor = (season: number): number | null => byPpr[season] ?? null;
  const allPresent = (seasons: number[]): boolean => seasons.every((season) => Object.prototype.hasOwnProperty.call(byPpr, season) && byPpr[season] !== null);

  const trailing2yrTotal = allPresent(twoMostRecent)
    ? twoMostRecent.reduce((sum, season) => sum + (pprFor(season) ?? 0), 0)
    : null;
  const trailing3yrTotal = allPresent(threeMostRecent)
    ? threeMostRecent.reduce((sum, season) => sum + (pprFor(season) ?? 0), 0)
    : null;
  const yoyTrend = allPresent(twoMostRecent)
    ? (pprFor(twoMostRecent[0]!) ?? 0) - (pprFor(twoMostRecent[1]!) ?? 0)
    : null;

  return {
    season_ppr_by_season: byPpr,
    season_ppg_by_season: byPpg,
    trailing_2yr_ppr_total: trailing2yrTotal,
    trailing_3yr_ppr_total: trailing3yrTotal,
    trailing_2yr_ppr_mean: trailing2yrTotal !== null ? trailing2yrTotal / 2 : null,
    trailing_3yr_ppr_mean: trailing3yrTotal !== null ? trailing3yrTotal / 3 : null,
    year_over_year_ppr_trend: yoyTrend,
  };
};

const byUsageField = (
  playerRows: readonly PlayerHistoryInputRow[],
  field: keyof PlayerHistoryUsageSummary,
): Record<number, number | null> => {
  const result: Record<number, number | null> = {};
  for (const row of playerRows) result[row.season] = row.usage_summary[field];
  return result;
};

const buildUsageFeatures = (playerRows: readonly PlayerHistoryInputRow[]): PlayerHistoryUsageFeatures => ({
  targets_by_season: byUsageField(playerRows, 'targets'),
  receptions_by_season: byUsageField(playerRows, 'receptions'),
  rushing_attempts_by_season: byUsageField(playerRows, 'rushing_attempts'),
  receiving_air_yards_by_season: byUsageField(playerRows, 'receiving_air_yards'),
  target_share_by_season: byUsageField(playerRows, 'target_share'),
  air_yards_share_by_season: byUsageField(playerRows, 'air_yards_share'),
  wopr_by_season: byUsageField(playerRows, 'wopr'),
  racr_by_season: byUsageField(playerRows, 'racr'),
  unavailable_fields_excluded: EXCLUDED_UNAVAILABLE_USAGE_FIELDS,
});

const buildAgeCareerFeatures = (playerRows: readonly PlayerHistoryInputRow[]): PlayerHistoryAgeCareerFeatures => {
  if (playerRows.length === 0) {
    return { latest_pre_target_season_age: null, latest_pre_target_career_year: null, draft_year: null, rookie_year: null, undrafted_indicator: null };
  }
  const latest = playerRows[playerRows.length - 1]!;
  return {
    // Never trust a row's season_age/career_year at face value -- force null whenever the field they are
    // derived from is null, even if a malformed/inconsistent input row carries a stale or fabricated value.
    latest_pre_target_season_age: latest.birth_date !== null ? latest.season_age : null,
    latest_pre_target_career_year: latest.rookie_year !== null ? latest.career_year : null,
    draft_year: latest.draft_year,
    rookie_year: latest.rookie_year,
    undrafted_indicator: latest.identity_confidence === 'source_verified' ? latest.draft_year === null : null,
  };
};

const buildTeamContextFeatures = (playerRows: readonly PlayerHistoryInputRow[]): PlayerHistoryTeamContextFeatures => {
  const multiTeamRows = playerRows.filter((row) => row.teams.length > 1);
  const latest = playerRows.length > 0 ? playerRows[playerRows.length - 1]! : null;
  return {
    multi_team_prior_season_indicator: multiTeamRows.length > 0,
    multi_team_season_count: multiTeamRows.length,
    latest_primary_team: latest?.primary_team ?? null,
  };
};

/**
 * Build candidate (not model-ready) player-history feature rows for a target season, one per player.
 * Structurally enforces `season < targetSeason` (never relies on caller discipline) and fails closed
 * if any input row carries a forbidden availability field. Each family is independently toggleable via
 * `options.families` (defaults to all) for a later ablation arm. Pure, deterministic, no I/O.
 */
export const buildPlayerHistoryFeatures = (
  rows: readonly PlayerHistoryInputRow[],
  options: PlayerHistoryFeatureOptions,
): PlayerHistoryFeatureRow[] => {
  assertNoForbiddenAvailabilityFields(rows);
  const filtered = filterPlayerHistoryInputRows(rows, options.targetSeason);
  const families = options.families ?? ALL_PLAYER_HISTORY_FEATURE_FAMILIES;
  const familySet = new Set(families);
  const grouped = groupByPlayer(filtered);

  const result: PlayerHistoryFeatureRow[] = [];
  // Sort player_ids for deterministic output order regardless of input/Map iteration order.
  const playerIds = [...grouped.keys()].sort();
  for (const playerId of playerIds) {
    const playerRows = grouped.get(playerId)!;
    const first = playerRows[0]!;
    const row: PlayerHistoryFeatureRow = {
      row_kind: 'player_history_feature_candidate_not_model_ready',
      player_id: playerId,
      player_name: first.player_name,
      position: first.position,
      target_season: options.targetSeason,
      input_seasons_considered: playerRows.map((r) => r.season),
    };
    if (familySet.has('coverage')) row.coverage = buildCoverageFeatures(playerRows);
    if (familySet.has('production')) row.production = buildProductionFeatures(playerRows, options.targetSeason);
    if (familySet.has('usage')) row.usage = buildUsageFeatures(playerRows);
    if (familySet.has('age_career')) row.age_career = buildAgeCareerFeatures(playerRows);
    if (familySet.has('team_context')) row.team_context = buildTeamContextFeatures(playerRows);
    result.push(row);
  }
  return result;
};

/** Read-only coverage summary over the input rows for a given target season. Pure, no I/O. */
export const summarizePlayerHistoryCoverage = (
  rows: readonly PlayerHistoryInputRow[],
  targetSeason: number,
): PlayerHistoryCoverageSummary => {
  const filtered = filterPlayerHistoryInputRows(rows, targetSeason);
  const grouped = groupByPlayer(filtered);
  const playersBySeasonsObservedCount: Record<number, number> = {};
  for (const playerRows of grouped.values()) {
    const count = playerRows.length;
    playersBySeasonsObservedCount[count] = (playersBySeasonsObservedCount[count] ?? 0) + 1;
  }
  return {
    target_season: targetSeason,
    input_seasons_present: [...new Set(filtered.map((row) => row.season))].sort((a, b) => a - b),
    total_players: grouped.size,
    players_by_seasons_observed_count: playersBySeasonsObservedCount,
    rows_considered: filtered.length,
    rows_rejected_for_leakage: rows.length - filtered.length,
  };
};

// --- Null-handling policy: a reusable, pure, tested helper for LATER model code ----------------------
//
// Adapted directly from the train-fold mean imputation already proven in
// `src/rehearsal/runRun2TeamstateComparison.ts`. Provided here as pure primitives only -- this module
// does not fit a model, does not standardize a design matrix, and does not run any experiment. A future
// controlled-run issue would use these primitives per LOOCV fold (means computed from the training
// rows only, never leaking the held-out row's own value into its own imputation).

export interface PlayerHistoryImputationRow {
  player_id: string;
  /** Feature name -> value, or null when unavailable for this player. */
  values: Record<string, number | null>;
}

/**
 * Per-column mean over the non-null values in `trainRows` only. A column that is null for every
 * training row imputes to 0 as a documented, ridge-neutral fallback (never a silent zero-fill of real
 * data -- there is no real data to fill).
 */
export const computePlayerHistoryTrainFoldMeans = (
  trainRows: readonly PlayerHistoryImputationRow[],
  columns: readonly string[],
): Record<string, number> => {
  const means: Record<string, number> = {};
  for (const column of columns) {
    let sum = 0;
    let count = 0;
    for (const row of trainRows) {
      const value = row.values[column];
      if (typeof value === 'number' && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
    means[column] = count > 0 ? sum / count : 0;
  }
  return means;
};

/** The imputed value for one row/column: the real value if present and finite, else the fold mean. */
export const imputePlayerHistoryValue = (
  row: PlayerHistoryImputationRow,
  column: string,
  means: Record<string, number>,
): number => {
  const value = row.values[column];
  return typeof value === 'number' && Number.isFinite(value) ? value : means[column]!;
};
