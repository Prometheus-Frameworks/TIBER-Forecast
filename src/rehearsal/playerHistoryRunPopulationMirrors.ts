/**
 * Real target-population mirror builders for the controlled player-history run path (Forecast #109).
 *
 * Implements the mirror scope decided in #107/PR #108: the first signal-bearing run targets the real
 * 2025 REG population from the candidate TIBER-Data `player_season_coverage_v0` artifact. This module
 * provides PURE, deterministic builders; all file/hash I/O lives in the generator script
 * (`scripts/buildPlayerHistoryRunPopulationMirrors.ts`), which must verify the sha256 pin fail-closed
 * before calling anything here.
 *
 * Boundaries (from #107/#108/#109):
 * - the source artifact is CANDIDATE evidence (`candidate_evidence_artifact_not_promoted`); building
 *   mirrors from it does NOT promote it and no production consumer may treat it as promoted truth,
 * - the OUTCOME mirror carries the 2025 target outcome (`season_ppr`), identity/position, and
 *   row-level provenance (`source_refs`, `identity_confidence`) ONLY -- never input features,
 * - the INPUT mirror carries 2022-2024 REG rows for outcome-mirror players ONLY -- never a 2025 row,
 *   never a 2025 outcome value, trimmed to the fields the #104 scaffold consumes,
 * - absence of 2022-2024 source rows for an outcome player is documented no-history, not a failure,
 * - nulls are preserved verbatim; nothing is coerced to zero,
 * - forbidden availability/ownership fields fail the whole build closed.
 *
 * No run, no metrics, no model, no promotion, no signal claim.
 */

import type { PlayerHistoryInputRow, PlayerHistorySourceRef, PlayerHistoryUsageSummary } from './playerHistoryFeatureScaffold.js';
import {
  PLAYER_HISTORY_APPROVED_POSITIONS,
  PLAYER_HISTORY_APPROVED_SEASON_TYPE,
} from './playerHistoryFeatureScaffold.js';

export const PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION = 'player-history-run-population-mirrors-v1' as const;

/** The sha256 pin carried forward from #100/#104/#108. The generator fails closed on mismatch. */
export const PINNED_SOURCE_ARTIFACT_SHA256 = '39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b' as const;

export const PINNED_SOURCE_ARTIFACT_REPO = 'Prometheus-Frameworks/TIBER-Data' as const;

export const PINNED_SOURCE_ARTIFACT_PATH = 'data/processed/evidence/player_season_coverage_2022_2025.source_backed.json' as const;

export const EXPECTED_SOURCE_ARTIFACT_STATUS = 'candidate_evidence_artifact_not_promoted' as const;

export const RUN_POPULATION_TARGET_SEASON = 2025;

export const RUN_POPULATION_INPUT_SEASONS: readonly number[] = [2022, 2023, 2024];

const FORBIDDEN_AVAILABILITY_KEYS: readonly string[] = [
  'active_status',
  'ownership_status',
  'roster_status',
  'active_roster_status',
];

/** Loose view of one raw record in the source artifact; unknown extras tolerated, forbidden keys not. */
export interface SourceCoverageRecord {
  player_id: string;
  player_name: string;
  position: string;
  season: number;
  season_type: string;
  identity_confidence: string;
  source_refs: Array<{ source_name: string; observed_at: string | null; [k: string]: unknown }>;
  teams: string[];
  primary_team: string | null;
  primary_team_rule: string | null;
  weeks_observed: number;
  coverage_status: string;
  missing_fields: string[];
  production_summary: { season_ppr: number | null; season_ppg: number | null; games_for_ppg: number | null };
  usage_summary: PlayerHistoryUsageSummary;
  birth_date: string | null;
  season_age: number | null;
  draft_year: number | null;
  rookie_year: number | null;
  career_year: number | null;
  [k: string]: unknown;
}

export interface SourceCoverageArtifact {
  artifact_id: string;
  status: string;
  seasons: number[];
  season_type_scope: string[];
  included_positions: string[];
  row_grain: string;
  records: SourceCoverageRecord[];
  [k: string]: unknown;
}

export interface PlayerHistoryOutcomeMirrorRow {
  player_id: string;
  player_name: string;
  position: string;
  season: number;
  season_type: string;
  /** The target outcome. OUTCOME LAYER ONLY -- never consumed as an input feature. */
  season_ppr: number | null;
  /** Row-level provenance so the target-population gate can verify source-backing per row. */
  source_refs: PlayerHistorySourceRef[];
  identity_confidence: string;
}

export interface PlayerHistoryOutcomeMirror {
  kind: 'player_history_run_population_outcome_mirror';
  version: typeof PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION;
  issue: 'TIBER-Forecast#109';
  governed_source: {
    repo: typeof PINNED_SOURCE_ARTIFACT_REPO;
    sourceArtifactPath: typeof PINNED_SOURCE_ARTIFACT_PATH;
    sha256: typeof PINNED_SOURCE_ARTIFACT_SHA256;
    artifactStatus: string;
  };
  boundary: {
    outcome_layer_only: true;
    rows_carry_no_input_features: true;
    source_artifact_not_promoted: true;
    building_this_mirror_promotes_nothing: true;
    no_forecast_run_authorized_by_this_mirror: true;
  };
  target_season: number;
  season_type: string;
  counts: { rows: number; players: number; by_position: Record<string, number> };
  rows: PlayerHistoryOutcomeMirrorRow[];
}

export interface PlayerHistoryNoHistoryPlayer {
  player_id: string;
  player_name: string;
  position: string;
  note: 'no_2022_2024_source_rows_documented_absence_not_a_mirror_failure';
}

export interface PlayerHistoryRunPopulationInputMirror {
  kind: 'player_history_run_population_input_mirror';
  version: typeof PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION;
  issue: 'TIBER-Forecast#109';
  governed_source: {
    repo: typeof PINNED_SOURCE_ARTIFACT_REPO;
    sourceArtifactPath: typeof PINNED_SOURCE_ARTIFACT_PATH;
    sha256: typeof PINNED_SOURCE_ARTIFACT_SHA256;
    artifactStatus: string;
  };
  input_window: { seasons: number[]; season_type: string; target_season_excluded: number };
  boundary: {
    contains_no_target_season_rows: true;
    contains_no_2025_outcome_values: true;
    source_artifact_not_promoted: true;
    nulls_preserved_never_zero_coerced: true;
    no_forecast_run_authorized_by_this_mirror: true;
  };
  counts: {
    rows: number;
    players_with_history: number;
    outcome_players_without_history: number;
    by_season: Record<number, number>;
    by_position: Record<string, number>;
  };
  no_history_players: PlayerHistoryNoHistoryPlayer[];
  rows: PlayerHistoryInputRow[];
}

/**
 * Fail-closed sha256 pin check. If TIBER-Data regenerates the artifact, the #99/#100 gate must be
 * re-run against the new artifact and the pin updated by review before mirrors are regenerated.
 */
export const assertPinnedSourceArtifactSha256 = (actualSha256Hex: string): void => {
  if (actualSha256Hex.toLowerCase() !== PINNED_SOURCE_ARTIFACT_SHA256) {
    throw new Error(
      `run-population mirrors: source artifact sha256 mismatch -- expected pinned ${PINNED_SOURCE_ARTIFACT_SHA256}, got ${actualSha256Hex}. The build fails closed; re-run the #99/#100 gate before updating the pin.`,
    );
  }
};

const assertNoForbiddenKeys = (record: SourceCoverageRecord): void => {
  for (const key of FORBIDDEN_AVAILABILITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(
        `run-population mirrors: source record player_id=${record.player_id} season=${record.season} carries forbidden availability field ${key}; the build fails closed.`,
      );
    }
  }
};

const trimSourceRefs = (refs: SourceCoverageRecord['source_refs']): PlayerHistorySourceRef[] =>
  refs.map((ref) => ({ source_name: ref.source_name, observed_at: ref.observed_at ?? null }));

const byPlayerIdThenSeason = (a: { player_id: string; season: number }, b: { player_id: string; season: number }): number =>
  a.player_id < b.player_id ? -1 : a.player_id > b.player_id ? 1 : a.season - b.season;

const countByPosition = (rows: ReadonlyArray<{ position: string }>): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.position] = (counts[row.position] ?? 0) + 1;
  return counts;
};

/**
 * Build the 2025 REG outcome mirror: one row per target-population player, carrying the target
 * outcome + identity + row-level provenance ONLY. Deterministic (sorted by player_id); fails closed
 * on forbidden fields or duplicate `player_id + season + season_type` grain.
 */
export const buildPlayerHistoryOutcomeMirror = (artifact: SourceCoverageArtifact): PlayerHistoryOutcomeMirror => {
  const targetRecords = artifact.records.filter(
    (record) =>
      record.season === RUN_POPULATION_TARGET_SEASON &&
      record.season_type === PLAYER_HISTORY_APPROVED_SEASON_TYPE &&
      PLAYER_HISTORY_APPROVED_POSITIONS.includes(record.position),
  );
  const seen = new Set<string>();
  const rows: PlayerHistoryOutcomeMirrorRow[] = [];
  for (const record of targetRecords) {
    assertNoForbiddenKeys(record);
    const grainKey = `${record.player_id}|${record.season}|${record.season_type}`;
    if (seen.has(grainKey)) {
      throw new Error(`run-population mirrors: duplicate outcome grain ${grainKey}; the build fails closed.`);
    }
    seen.add(grainKey);
    rows.push({
      player_id: record.player_id,
      player_name: record.player_name,
      position: record.position,
      season: record.season,
      season_type: record.season_type,
      season_ppr: record.production_summary.season_ppr,
      source_refs: trimSourceRefs(record.source_refs),
      identity_confidence: record.identity_confidence,
    });
  }
  rows.sort(byPlayerIdThenSeason);
  return {
    kind: 'player_history_run_population_outcome_mirror',
    version: PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
    issue: 'TIBER-Forecast#109',
    governed_source: {
      repo: PINNED_SOURCE_ARTIFACT_REPO,
      sourceArtifactPath: PINNED_SOURCE_ARTIFACT_PATH,
      sha256: PINNED_SOURCE_ARTIFACT_SHA256,
      artifactStatus: artifact.status,
    },
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      source_artifact_not_promoted: true,
      building_this_mirror_promotes_nothing: true,
      no_forecast_run_authorized_by_this_mirror: true,
    },
    target_season: RUN_POPULATION_TARGET_SEASON,
    season_type: PLAYER_HISTORY_APPROVED_SEASON_TYPE,
    counts: { rows: rows.length, players: new Set(rows.map((r) => r.player_id)).size, by_position: countByPosition(rows) },
    rows,
  };
};

const trimToInputRow = (record: SourceCoverageRecord): PlayerHistoryInputRow => ({
  player_id: record.player_id,
  player_name: record.player_name,
  position: record.position,
  season: record.season,
  season_type: record.season_type,
  identity_confidence: record.identity_confidence,
  source_refs: trimSourceRefs(record.source_refs),
  teams: [...record.teams],
  primary_team: record.primary_team,
  primary_team_rule: record.primary_team_rule,
  weeks_observed: record.weeks_observed,
  coverage_status: record.coverage_status,
  missing_fields: [...record.missing_fields],
  production_summary: {
    season_ppr: record.production_summary.season_ppr,
    season_ppg: record.production_summary.season_ppg,
    games_for_ppg: record.production_summary.games_for_ppg,
  },
  usage_summary: {
    targets: record.usage_summary.targets,
    receptions: record.usage_summary.receptions,
    rushing_attempts: record.usage_summary.rushing_attempts,
    receiving_air_yards: record.usage_summary.receiving_air_yards,
    target_share: record.usage_summary.target_share,
    air_yards_share: record.usage_summary.air_yards_share,
    wopr: record.usage_summary.wopr,
    racr: record.usage_summary.racr,
    snap_share: record.usage_summary.snap_share,
    routes_run: record.usage_summary.routes_run,
    route_participation: record.usage_summary.route_participation,
    red_zone_targets: record.usage_summary.red_zone_targets,
    red_zone_carries: record.usage_summary.red_zone_carries,
  },
  birth_date: record.birth_date,
  season_age: record.season_age,
  draft_year: record.draft_year,
  rookie_year: record.rookie_year,
  career_year: record.career_year,
});

/**
 * Build the 2022-2024 input mirror for the outcome-mirror population: ALL input-window REG rows for
 * every outcome player, trimmed to the #104 scaffold's fields. Structurally contains no target-season
 * row and no 2025 outcome value. Outcome players with no input rows are documented no-history players.
 */
export const buildPlayerHistoryRunPopulationInputMirror = (
  artifact: SourceCoverageArtifact,
  outcomeMirror: PlayerHistoryOutcomeMirror,
): PlayerHistoryRunPopulationInputMirror => {
  const populationIds = new Set(outcomeMirror.rows.map((row) => row.player_id));
  const inputSeasons = new Set(RUN_POPULATION_INPUT_SEASONS);
  const inputRecords = artifact.records.filter(
    (record) =>
      inputSeasons.has(record.season) &&
      record.season_type === PLAYER_HISTORY_APPROVED_SEASON_TYPE &&
      populationIds.has(record.player_id),
  );
  const rows: PlayerHistoryInputRow[] = [];
  for (const record of inputRecords) {
    assertNoForbiddenKeys(record);
    rows.push(trimToInputRow(record));
  }
  rows.sort(byPlayerIdThenSeason);

  const playersWithHistory = new Set(rows.map((row) => row.player_id));
  const noHistoryPlayers: PlayerHistoryNoHistoryPlayer[] = outcomeMirror.rows
    .filter((row) => !playersWithHistory.has(row.player_id))
    .map((row) => ({
      player_id: row.player_id,
      player_name: row.player_name,
      position: row.position,
      note: 'no_2022_2024_source_rows_documented_absence_not_a_mirror_failure',
    }));

  const bySeason: Record<number, number> = {};
  for (const row of rows) bySeason[row.season] = (bySeason[row.season] ?? 0) + 1;

  return {
    kind: 'player_history_run_population_input_mirror',
    version: PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
    issue: 'TIBER-Forecast#109',
    governed_source: {
      repo: PINNED_SOURCE_ARTIFACT_REPO,
      sourceArtifactPath: PINNED_SOURCE_ARTIFACT_PATH,
      sha256: PINNED_SOURCE_ARTIFACT_SHA256,
      artifactStatus: artifact.status,
    },
    input_window: {
      seasons: [...RUN_POPULATION_INPUT_SEASONS],
      season_type: PLAYER_HISTORY_APPROVED_SEASON_TYPE,
      target_season_excluded: RUN_POPULATION_TARGET_SEASON,
    },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2025_outcome_values: true,
      source_artifact_not_promoted: true,
      nulls_preserved_never_zero_coerced: true,
      no_forecast_run_authorized_by_this_mirror: true,
    },
    counts: {
      rows: rows.length,
      players_with_history: playersWithHistory.size,
      outcome_players_without_history: noHistoryPlayers.length,
      by_season: bySeason,
      by_position: countByPosition(rows),
    },
    no_history_players: noHistoryPlayers,
    rows,
  };
};
