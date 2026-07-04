/**
 * Promoted-source mirror refresh for the player-history experiment path (Forecast #119).
 *
 * Refreshes the Forecast experiment mirrors from the PROMOTED TIBER-Data
 * `player_season_coverage_v0` artifact (TIBER-Data #192 / PR #193, merge 65fb498), as authorized by
 * the #117 promoted-source gate decision `may_open_promoted_mirror_refresh_issue`. This is a MIRROR
 * REFRESH ONLY: it runs no model, computes no MAE/RMSE/Pearson/Spearman or any other player-history
 * metric, binds nothing into production Forecast, touches no `seasonalPprModel.ts`, creates no
 * product/advice output, changes nothing in TIBER-Data, and infers no availability/ownership/depth/
 * injury status.
 *
 * Decision semantics (exactly one is emitted):
 * - `may_open_promoted_controlled_rerun_issue`: preflight + mirror integrity + population/overlap
 *   floors all passed. A SEPARATE issue may be opened to consider rerunning the controlled
 *   experiment against the promoted-source mirrors; this decision does not itself authorize the run.
 * - `may_use_promoted_mirrors_for_design_only`: preflight and mirror integrity passed (the refreshed
 *   mirrors are internally valid, source-backed, leakage-clean), but the population/overlap floors
 *   or derangement feasibility failed. The mirrors may inform experiment DESIGN only; no rerun issue
 *   may be opened and nothing may consume them as features.
 * - `blocked_promoted_mirror_refresh_gate_failed`: the #117 preflight failed, or a mirror
 *   integrity/leakage/provenance check failed. The refreshed mirrors must not be used at all.
 * - `promoted_mirror_refresh_invalid_must_not_use`: the gate input itself is malformed, so no
 *   evaluation outcome may be used.
 *
 * The archived candidate mirrors (#110) are PRESERVED, never overwritten: the promoted-source
 * mirrors are written to new `*.promoted_*_mirror.json` paths and carry an explicit source-lineage
 * block showing the source changed from the candidate pin to the promoted artifact.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistoryPromotedMirrorRefresh.ts`) reads the
 * local promoted artifact + manifest, re-runs the #117 gate module as preflight (never trusting the
 * committed report alone), builds the mirrors, re-runs the dry-run matrix, and passes everything in.
 */

import {
  PLAYER_HISTORY_APPROVED_POSITIONS,
  PLAYER_HISTORY_APPROVED_SEASON_TYPE,
  type PlayerHistoryInputRow,
  type PlayerHistorySourceRef,
} from './playerHistoryFeatureScaffold.js';
import {
  OVERLAP_MIN_JOINED_ROWS_OVERALL,
  OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
  OVERLAP_MIN_JOINED_SHARE,
  OVERLAP_REQUIRED_POSITIONS,
} from './playerHistoryMirrorOverlapGate.js';
import {
  EXPECTED_PROMOTED_STATUS,
  PINNED_PROMOTED_ARTIFACT_SHA256,
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_ARTIFACT_REPO,
  PROMOTED_MANIFEST_PATH,
  PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
  PROMOTION_MERGE_COMMIT,
  EXPECTED_APPROVED_SOURCE_PREFIXES,
  PROMOTED_FIXTURE_MARKERS,
  PROMOTED_FORBIDDEN_AVAILABILITY_KEYS,
  PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS,
  type PromotedSourceGateResult,
} from './playerHistoryPromotedSourceGate.js';
import {
  PINNED_SOURCE_ARTIFACT_SHA256,
  RUN_POPULATION_INPUT_SEASONS,
  RUN_POPULATION_TARGET_SEASON,
  type SourceCoverageArtifact,
  type SourceCoverageRecord,
} from './playerHistoryRunPopulationMirrors.js';

export const PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION = 'player-history-promoted-mirror-refresh-v1' as const;

export const PROMOTED_MIRROR_REFRESH_ISSUE = 'TIBER-Forecast#119' as const;

/** The only #117 gate decision that authorizes this refresh; anything else fails the preflight closed. */
export const REQUIRED_PREFLIGHT_GATE_DECISION = 'may_open_promoted_mirror_refresh_issue' as const;

/**
 * Archived candidate-derived mirrors (#110). This refresh must NEVER overwrite them: they remain the
 * archived record of the #112/#116 candidate experiment. The promoted-source mirrors get new paths.
 */
export const ARCHIVED_CANDIDATE_MIRROR_PATHS = [
  'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json',
  'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json',
  'data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json',
] as const;

/** New promoted-source mirror paths (distinct from every archived candidate path -- tested). */
export const PROMOTED_OUTCOME_MIRROR_PATH =
  'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json' as const;
export const PROMOTED_INPUT_MIRROR_PATH =
  'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json' as const;
export const PROMOTED_MIRROR_PROVENANCE_PATH =
  'data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json' as const;

/**
 * The only decisions this refresh may emit. Deliberately NO value contains run/bind/production/
 * metric/advice semantics: nothing here authorizes a model run, metric computation, production
 * binding, product output, or advice/rankings (tested). Even the strongest value only permits
 * OPENING a separate issue that would itself have to authorize any rerun.
 */
export const PROMOTED_MIRROR_REFRESH_DECISIONS = [
  'may_open_promoted_controlled_rerun_issue',
  'may_use_promoted_mirrors_for_design_only',
  'blocked_promoted_mirror_refresh_gate_failed',
  'promoted_mirror_refresh_invalid_must_not_use',
] as const;
export type PromotedMirrorRefreshDecision = (typeof PROMOTED_MIRROR_REFRESH_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Promoted-source mirror shapes
// ---------------------------------------------------------------------------------------------

/** Governance identity every promoted-source mirror carries verbatim. */
export interface PromotedMirrorGovernedSource {
  repo: typeof PROMOTED_ARTIFACT_REPO;
  promotedArtifactPath: typeof PROMOTED_ARTIFACT_PATH;
  promotedManifestPath: typeof PROMOTED_MANIFEST_PATH;
  promotionMergeCommit: typeof PROMOTION_MERGE_COMMIT;
  sha256: typeof PINNED_PROMOTED_ARTIFACT_SHA256;
  artifactStatus: string;
}

/**
 * Explicit candidate->promoted lineage stamped on both mirrors so nobody can mistake them for the
 * archived candidate mirrors (or silently treat the archived mirrors as refreshed).
 */
export interface PromotedMirrorSourceLineage {
  refreshed_from_source: 'candidate_pin';
  refreshed_to_source: 'promoted_governed_artifact';
  prior_candidate_sha256: typeof PINNED_SOURCE_ARTIFACT_SHA256;
  archived_candidate_mirrors_preserved_at: readonly string[];
  archived_candidate_mirrors_not_overwritten: true;
}

export interface PromotedOutcomeMirrorRow {
  player_id: string;
  player_name: string;
  position: string;
  season: number;
  season_type: string;
  /** The 2025 target outcome. OUTCOME LAYER ONLY -- never consumed as a 2025 input feature. */
  season_ppr: number | null;
  source_refs: PlayerHistorySourceRef[];
  identity_confidence: string;
}

export interface PromotedOutcomeMirror {
  kind: 'player_history_promoted_outcome_mirror';
  version: typeof PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION;
  issue: typeof PROMOTED_MIRROR_REFRESH_ISSUE;
  governed_source: PromotedMirrorGovernedSource;
  source_lineage: PromotedMirrorSourceLineage;
  boundary: {
    outcome_layer_only: true;
    rows_carry_no_input_features: true;
    outcome_values_must_not_become_2025_input_features: true;
    no_forecast_run_authorized_by_this_mirror: true;
    no_production_binding_authorized_by_this_mirror: true;
  };
  target_season: number;
  season_type: string;
  counts: { rows: number; players: number; by_position: Record<string, number> };
  rows: PromotedOutcomeMirrorRow[];
}

export interface PromotedNoHistoryPlayer {
  player_id: string;
  player_name: string;
  position: string;
  note: 'no_2022_2024_source_rows_documented_absence_not_a_mirror_failure';
}

export interface PromotedInputMirror {
  kind: 'player_history_promoted_input_mirror';
  version: typeof PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION;
  issue: typeof PROMOTED_MIRROR_REFRESH_ISSUE;
  governed_source: PromotedMirrorGovernedSource;
  source_lineage: PromotedMirrorSourceLineage;
  input_window: { seasons: number[]; season_type: string; target_season_excluded: number };
  boundary: {
    contains_no_target_season_rows: true;
    contains_no_2025_outcome_values: true;
    nulls_preserved_never_zero_coerced: true;
    no_availability_ownership_depth_injury_fields: true;
    no_forecast_run_authorized_by_this_mirror: true;
    no_production_binding_authorized_by_this_mirror: true;
  };
  counts: {
    rows: number;
    players_with_history: number;
    outcome_players_without_history: number;
    by_season: Record<number, number>;
    by_position: Record<string, number>;
  };
  no_history_players: PromotedNoHistoryPlayer[];
  rows: PlayerHistoryInputRow[];
}

// ---------------------------------------------------------------------------------------------
// Builders (pure, deterministic, fail-closed)
// ---------------------------------------------------------------------------------------------

const SOURCE_LINEAGE: PromotedMirrorSourceLineage = {
  refreshed_from_source: 'candidate_pin',
  refreshed_to_source: 'promoted_governed_artifact',
  prior_candidate_sha256: PINNED_SOURCE_ARTIFACT_SHA256,
  archived_candidate_mirrors_preserved_at: ARCHIVED_CANDIDATE_MIRROR_PATHS,
  archived_candidate_mirrors_not_overwritten: true,
};

const governedSource = (artifactStatus: string): PromotedMirrorGovernedSource => ({
  repo: PROMOTED_ARTIFACT_REPO,
  promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
  promotedManifestPath: PROMOTED_MANIFEST_PATH,
  promotionMergeCommit: PROMOTION_MERGE_COMMIT,
  sha256: PINNED_PROMOTED_ARTIFACT_SHA256,
  artifactStatus,
});

const assertNoForbiddenKeys = (record: SourceCoverageRecord): void => {
  for (const key of PROMOTED_FORBIDDEN_AVAILABILITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(
        `promoted mirror refresh: source record player_id=${record.player_id} season=${record.season} carries forbidden availability field ${key}; the build fails closed.`,
      );
    }
  }
};

const assertPrefixApprovedRefs = (record: SourceCoverageRecord): void => {
  const refs = Array.isArray(record.source_refs) ? record.source_refs : [];
  if (refs.length === 0) {
    throw new Error(
      `promoted mirror refresh: source record player_id=${record.player_id} season=${record.season} carries no source_refs; the build fails closed.`,
    );
  }
  for (const ref of refs) {
    const name = String(ref.source_name ?? '');
    // PREFIX allow-list semantics (the TIBER-Data #193 standard, never downgraded to substring):
    // mixed approved+unapproved refs and embedded-token names fail closed.
    if (!EXPECTED_APPROVED_SOURCE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      throw new Error(
        `promoted mirror refresh: source record player_id=${record.player_id} season=${record.season} carries non-prefix-approved source_ref "${name}"; the build fails closed.`,
      );
    }
    if (PROMOTED_FIXTURE_MARKERS.some((marker) => name.includes(marker))) {
      throw new Error(
        `promoted mirror refresh: source record player_id=${record.player_id} season=${record.season} carries fixture/scaffold-marked source_ref "${name}"; the build fails closed.`,
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
 * Build the promoted-source 2025 REG outcome mirror: one row per target-population player, carrying
 * the target outcome + identity + row-level provenance ONLY. Deterministic (sorted by player_id);
 * fails closed on forbidden fields, missing/unapproved/fixture-marked provenance, or duplicate
 * `player_id + season + season_type` grain.
 */
export const buildPromotedOutcomeMirror = (artifact: SourceCoverageArtifact): PromotedOutcomeMirror => {
  const targetRecords = artifact.records.filter(
    (record) =>
      record.season === RUN_POPULATION_TARGET_SEASON &&
      record.season_type === PLAYER_HISTORY_APPROVED_SEASON_TYPE &&
      PLAYER_HISTORY_APPROVED_POSITIONS.includes(record.position),
  );
  const seen = new Set<string>();
  const rows: PromotedOutcomeMirrorRow[] = [];
  for (const record of targetRecords) {
    assertNoForbiddenKeys(record);
    assertPrefixApprovedRefs(record);
    const grainKey = `${record.player_id}|${record.season}|${record.season_type}`;
    if (seen.has(grainKey)) {
      throw new Error(`promoted mirror refresh: duplicate outcome grain ${grainKey}; the build fails closed.`);
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
    kind: 'player_history_promoted_outcome_mirror',
    version: PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION,
    issue: PROMOTED_MIRROR_REFRESH_ISSUE,
    governed_source: governedSource(artifact.status),
    source_lineage: SOURCE_LINEAGE,
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      outcome_values_must_not_become_2025_input_features: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
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
  // Nulls are preserved verbatim -- unavailable usage fields stay null, never zero-coerced.
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
 * Build the promoted-source 2022-2024 REG input mirror for the outcome-mirror population: ALL
 * input-window rows for every outcome player, trimmed to the fields the #104 scaffold consumes.
 * Structurally contains no target-season row and no 2025 outcome value; outcome players with no
 * input rows are documented no-history players, not failures.
 */
export const buildPromotedInputMirror = (
  artifact: SourceCoverageArtifact,
  outcomeMirror: PromotedOutcomeMirror,
): PromotedInputMirror => {
  const populationIds = new Set(outcomeMirror.rows.map((row) => row.player_id));
  const inputSeasons = new Set(RUN_POPULATION_INPUT_SEASONS);
  const inputRecords = artifact.records.filter(
    (record) =>
      inputSeasons.has(record.season) &&
      record.season_type === PLAYER_HISTORY_APPROVED_SEASON_TYPE &&
      populationIds.has(record.player_id),
  );
  const seen = new Set<string>();
  const rows: PlayerHistoryInputRow[] = [];
  for (const record of inputRecords) {
    assertNoForbiddenKeys(record);
    assertPrefixApprovedRefs(record);
    const grainKey = `${record.player_id}|${record.season}|${record.season_type}`;
    if (seen.has(grainKey)) {
      throw new Error(`promoted mirror refresh: duplicate input grain ${grainKey}; the build fails closed.`);
    }
    seen.add(grainKey);
    rows.push(trimToInputRow(record));
  }
  rows.sort(byPlayerIdThenSeason);

  const playersWithHistory = new Set(rows.map((row) => row.player_id));
  const noHistoryPlayers: PromotedNoHistoryPlayer[] = outcomeMirror.rows
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
    kind: 'player_history_promoted_input_mirror',
    version: PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION,
    issue: PROMOTED_MIRROR_REFRESH_ISSUE,
    governed_source: governedSource(artifact.status),
    source_lineage: SOURCE_LINEAGE,
    input_window: {
      seasons: [...RUN_POPULATION_INPUT_SEASONS],
      season_type: PLAYER_HISTORY_APPROVED_SEASON_TYPE,
      target_season_excluded: RUN_POPULATION_TARGET_SEASON,
    },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2025_outcome_values: true,
      nulls_preserved_never_zero_coerced: true,
      no_availability_ownership_depth_injury_fields: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
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

// ---------------------------------------------------------------------------------------------
// Refresh gate (preflight + mirror integrity + population/overlap floors)
// ---------------------------------------------------------------------------------------------

export interface PromotedMirrorRefreshCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface PromotedMirrorRefreshOverlapEvidence {
  scored_target_rows: number;
  joined_rows: number;
  joined_rows_by_position: Record<string, number>;
  shuffle_groups: Array<{ position: string; feature_bearing_row_count: number; derangement_possible: boolean }>;
}

export interface PromotedMirrorRefreshGateInput {
  /** Result of RE-RUNNING the #117 gate module against the local promoted files (never the committed report alone). */
  preflightGateResult: PromotedSourceGateResult;
  /** sha256 hex of the ACTUAL promoted artifact bytes, computed by the caller from the file read. */
  actualPromotedArtifactSha256: string;
  /** Candidate sha the promotion manifest declares (its source_candidate.sha256). */
  manifestCandidateSha256: string;
  outcomeMirror: PromotedOutcomeMirror;
  inputMirror: PromotedInputMirror;
  overlap: PromotedMirrorRefreshOverlapEvidence;
}

export interface PromotedMirrorRefreshGateResult {
  gate_version: typeof PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION;
  issue: typeof PROMOTED_MIRROR_REFRESH_ISSUE;
  status: 'passed' | 'design_only' | 'failed' | 'invalid';
  decision: PromotedMirrorRefreshDecision;
  decision_rule: string;
  checks: PromotedMirrorRefreshCheck[];
  blocking_reasons: string[];
  preflight_passed: boolean;
  mirror_integrity_passed: boolean;
  overlap_floors_passed: boolean;
  observed_overlap: {
    scored_target_rows: number;
    joined_rows: number;
    joined_share: number | null;
    joined_rows_by_position: Record<string, number>;
  };
  thresholds: {
    min_joined_rows_overall: number;
    min_joined_rows_per_position: number;
    min_joined_share: number;
    required_positions: readonly string[];
  };
  leakage_discipline: typeof PROMOTED_SOURCE_LEAKAGE_DISCIPLINE;
  archived_candidate_mirror_statement: string;
  ceiling_note: string;
}

const DECISION_RULE =
  'malformed gate input -> promoted_mirror_refresh_invalid_must_not_use; #117 preflight failed OR any mirror ' +
  'integrity/leakage/provenance check failed OR the overlap evidence is internally contradictory -> ' +
  'blocked_promoted_mirror_refresh_gate_failed; integrity passed but a population/overlap floor or derangement ' +
  'feasibility failed -> may_use_promoted_mirrors_for_design_only; everything passed -> ' +
  'may_open_promoted_controlled_rerun_issue. No decision authorizes a model run, metric computation, production ' +
  'binding, product output, or advice/rankings.';

const CEILING_NOTE =
  'may_open_promoted_controlled_rerun_issue is the strongest decision this refresh can emit. It authorizes only OPENING ' +
  'a separate, later issue to consider rerunning the controlled experiment against the promoted-source mirrors. It does ' +
  'not itself authorize the rerun, runs no model here, computes no MAE/RMSE/Pearson/Spearman or other metric, binds ' +
  'nothing into production Forecast, and makes no product or signal claim.';

const ARCHIVED_CANDIDATE_MIRROR_STATEMENT =
  'The archived candidate mirrors (#110) at ' +
  ARCHIVED_CANDIDATE_MIRROR_PATHS.join(', ') +
  ' are preserved unchanged as the archived record of the #112/#116 candidate experiment. The promoted-source mirrors ' +
  'are written to new *.promoted_*_mirror.json paths and carry an explicit source_lineage block; nothing overwrites the ' +
  'archived mirrors silently.';

const gateInputProblems = (input: Partial<PromotedMirrorRefreshGateInput>): string[] => {
  const problems: string[] = [];
  if (!input.preflightGateResult || typeof input.preflightGateResult !== 'object') {
    problems.push('preflightGateResult missing or not an object');
  }
  if (!input.actualPromotedArtifactSha256 || !/^[0-9a-f]{64}$/.test(input.actualPromotedArtifactSha256)) {
    problems.push('actualPromotedArtifactSha256 missing or not a sha256 hex digest');
  }
  if (!input.outcomeMirror || !Array.isArray(input.outcomeMirror.rows)) problems.push('outcomeMirror missing or rows not an array');
  if (!input.inputMirror || !Array.isArray(input.inputMirror.rows)) problems.push('inputMirror missing or rows not an array');
  if (!input.overlap || typeof input.overlap !== 'object') problems.push('overlap evidence missing');
  return problems;
};

/** Dimensions that make up the #117 preflight section of this gate. */
export const PREFLIGHT_DIMENSIONS = [
  'preflight_gate_status_passed',
  'preflight_gate_decision',
  'preflight_promoted_sha_matches_pin',
  'preflight_candidate_lineage_sha_matches_pin',
  'preflight_leakage_discipline_recorded_true',
] as const;

/**
 * Dimensions that are population/overlap floors (fail -> design-only, not blocked). Deliberately
 * EXCLUDES `overlap_counts_sane` and `overlap_shuffle_evidence_present_for_joined_positions`:
 * internally-contradictory or MISSING overlap evidence is an integrity failure and blocks outright
 * rather than downgrading to design-only.
 */
export const OVERLAP_FLOOR_DIMENSIONS = [
  'overlap_min_joined_rows_overall',
  ...OVERLAP_REQUIRED_POSITIONS.map((p) => `overlap_min_joined_rows_position_${p}`),
  'overlap_min_joined_share',
  'overlap_derangement_feasible_by_position',
] as const;

/**
 * Evaluate the full promoted-mirror-refresh gate: #117 preflight, refreshed-mirror integrity
 * (scope, leakage, provenance, null semantics), and the #107-floor population/overlap checks.
 * Pure (no I/O), fail-closed.
 */
export const evaluatePlayerHistoryPromotedMirrorRefreshGate = (
  input: Partial<PromotedMirrorRefreshGateInput>,
): PromotedMirrorRefreshGateResult => {
  const problems = gateInputProblems(input);
  const base = {
    gate_version: PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION,
    issue: PROMOTED_MIRROR_REFRESH_ISSUE,
    decision_rule: DECISION_RULE,
    thresholds: {
      min_joined_rows_overall: OVERLAP_MIN_JOINED_ROWS_OVERALL,
      min_joined_rows_per_position: OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
      min_joined_share: OVERLAP_MIN_JOINED_SHARE,
      required_positions: OVERLAP_REQUIRED_POSITIONS,
    },
    leakage_discipline: PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
    archived_candidate_mirror_statement: ARCHIVED_CANDIDATE_MIRROR_STATEMENT,
    ceiling_note: CEILING_NOTE,
  } as const;
  if (problems.length > 0) {
    return {
      ...base,
      status: 'invalid',
      decision: 'promoted_mirror_refresh_invalid_must_not_use',
      checks: [],
      blocking_reasons: problems.map((p) => `gate input malformed: ${p}`),
      preflight_passed: false,
      mirror_integrity_passed: false,
      overlap_floors_passed: false,
      observed_overlap: { scored_target_rows: 0, joined_rows: 0, joined_share: null, joined_rows_by_position: {} },
    };
  }
  const { preflightGateResult, actualPromotedArtifactSha256, manifestCandidateSha256, outcomeMirror, inputMirror, overlap } =
    input as PromotedMirrorRefreshGateInput;

  const checks: PromotedMirrorRefreshCheck[] = [];
  const check = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ dimension, expected, observed, passed });
  };

  // ---- #117 preflight (fail closed before anything else may be trusted) ------------------------
  check('preflight_gate_status_passed', 'passed', String(preflightGateResult.status), preflightGateResult.status === 'passed');
  check(
    'preflight_gate_decision',
    REQUIRED_PREFLIGHT_GATE_DECISION,
    String(preflightGateResult.decision),
    preflightGateResult.decision === REQUIRED_PREFLIGHT_GATE_DECISION,
  );
  check(
    'preflight_promoted_sha_matches_pin',
    PINNED_PROMOTED_ARTIFACT_SHA256,
    actualPromotedArtifactSha256,
    actualPromotedArtifactSha256 === PINNED_PROMOTED_ARTIFACT_SHA256,
  );
  check(
    'preflight_candidate_lineage_sha_matches_pin',
    PINNED_SOURCE_ARTIFACT_SHA256,
    String(manifestCandidateSha256),
    manifestCandidateSha256 === PINNED_SOURCE_ARTIFACT_SHA256,
  );
  const leakage = preflightGateResult.leakage_discipline_for_future_refresh as Record<string, boolean> | undefined;
  const leakageKeys = Object.keys(PROMOTED_SOURCE_LEAKAGE_DISCIPLINE);
  const leakageOk = leakage !== undefined && leakageKeys.every((key) => leakage[key] === true);
  check(
    'preflight_leakage_discipline_recorded_true',
    `all ${leakageKeys.length} leakage-discipline fields present and true`,
    leakage === undefined ? 'leakage discipline block MISSING' : leakageKeys.map((k) => `${k}=${leakage[k]}`).join(', '),
    leakageOk,
  );

  // ---- Outcome mirror integrity ------------------------------------------------------------------
  check(
    'outcome_mirror_kind_and_source',
    `kind player_history_promoted_outcome_mirror tied to promoted sha ${PINNED_PROMOTED_ARTIFACT_SHA256} (status ${EXPECTED_PROMOTED_STATUS})`,
    `kind=${outcomeMirror.kind} sha=${outcomeMirror.governed_source?.sha256} status=${outcomeMirror.governed_source?.artifactStatus}`,
    outcomeMirror.kind === 'player_history_promoted_outcome_mirror' &&
      outcomeMirror.governed_source?.sha256 === PINNED_PROMOTED_ARTIFACT_SHA256 &&
      outcomeMirror.governed_source?.artifactStatus === EXPECTED_PROMOTED_STATUS,
  );
  const outcomeOffScope = outcomeMirror.rows.filter(
    (row) =>
      row.season !== RUN_POPULATION_TARGET_SEASON ||
      row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE ||
      !PLAYER_HISTORY_APPROVED_POSITIONS.includes(row.position),
  ).length;
  check(
    'outcome_rows_2025_reg_approved_positions_only',
    `every row season=${RUN_POPULATION_TARGET_SEASON}, season_type=${PLAYER_HISTORY_APPROVED_SEASON_TYPE}, position in ${PLAYER_HISTORY_APPROVED_POSITIONS.join('/')}`,
    `${outcomeOffScope} off-scope rows of ${outcomeMirror.rows.length}`,
    outcomeOffScope === 0 && outcomeMirror.rows.length > 0,
  );
  const outcomePlayers = new Set(outcomeMirror.rows.map((r) => r.player_id)).size;
  check(
    'outcome_population_count_consistent',
    'rows > 0, one row per player, counts.rows/players match the rows array',
    `rows=${outcomeMirror.rows.length} players=${outcomePlayers} counts=${JSON.stringify({ rows: outcomeMirror.counts?.rows, players: outcomeMirror.counts?.players })}`,
    outcomeMirror.rows.length > 0 &&
      outcomePlayers === outcomeMirror.rows.length &&
      outcomeMirror.counts?.rows === outcomeMirror.rows.length &&
      outcomeMirror.counts?.players === outcomePlayers,
  );

  // ---- Input mirror integrity ----------------------------------------------------------------------
  check(
    'input_mirror_kind_and_source',
    `kind player_history_promoted_input_mirror tied to promoted sha ${PINNED_PROMOTED_ARTIFACT_SHA256} (status ${EXPECTED_PROMOTED_STATUS})`,
    `kind=${inputMirror.kind} sha=${inputMirror.governed_source?.sha256} status=${inputMirror.governed_source?.artifactStatus}`,
    inputMirror.kind === 'player_history_promoted_input_mirror' &&
      inputMirror.governed_source?.sha256 === PINNED_PROMOTED_ARTIFACT_SHA256 &&
      inputMirror.governed_source?.artifactStatus === EXPECTED_PROMOTED_STATUS,
  );
  const inputSeasonSet = new Set(RUN_POPULATION_INPUT_SEASONS);
  const input2025Rows = inputMirror.rows.filter((row) => row.season === RUN_POPULATION_TARGET_SEASON).length;
  const inputOffWindow = inputMirror.rows.filter(
    (row) => !inputSeasonSet.has(row.season) || row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE,
  ).length;
  check(
    'input_no_2025_rows',
    `0 rows with season ${RUN_POPULATION_TARGET_SEASON}; every row in ${RUN_POPULATION_INPUT_SEASONS.join('/')} ${PLAYER_HISTORY_APPROVED_SEASON_TYPE}`,
    `${input2025Rows} target-season rows, ${inputOffWindow} off-window rows of ${inputMirror.rows.length}`,
    input2025Rows === 0 && inputOffWindow === 0 && inputMirror.rows.length > 0,
  );
  const inputOffPositions = inputMirror.rows.filter((row) => !PLAYER_HISTORY_APPROVED_POSITIONS.includes(row.position)).length;
  check(
    'input_positions_in_scope',
    `every row position in ${PLAYER_HISTORY_APPROVED_POSITIONS.join('/')}`,
    `${inputOffPositions} off-scope rows`,
    inputOffPositions === 0,
  );
  const populationIds = new Set(outcomeMirror.rows.map((r) => r.player_id));
  const inputOutsidePopulation = inputMirror.rows.filter((row) => !populationIds.has(row.player_id)).length;
  check(
    'input_players_subset_of_outcome_population',
    'every input row belongs to an outcome-mirror player',
    `${inputOutsidePopulation} rows outside the population`,
    inputOutsidePopulation === 0,
  );
  // Leakage: target outcomes must not be copied into input feature rows. Structurally: no input row
  // is a 2025 row (checked above) and no row carries a target-outcome key.
  const TARGET_OUTCOME_KEYS = ['ppr_2025_actual', 'season_ppr_2025', 'target_outcome', 'target_season_ppr'];
  const rowsWithTargetOutcome = inputMirror.rows.filter((row) =>
    TARGET_OUTCOME_KEYS.some((key) => Object.prototype.hasOwnProperty.call(row, key)),
  ).length;
  check(
    'input_no_target_outcome_values',
    `no input row carries ${TARGET_OUTCOME_KEYS.join('/')} (2025 outcomes live in the outcome layer only)`,
    `${rowsWithTargetOutcome} rows carrying a target-outcome key`,
    rowsWithTargetOutcome === 0,
  );

  // ---- Provenance over BOTH refreshed mirrors (prefix semantics, never substring) ------------------
  const allRows: Array<{ source_refs: PlayerHistorySourceRef[] }> = [...outcomeMirror.rows, ...inputMirror.rows];
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
  check(
    'mirror_source_refs_present',
    'every mirror row carries >= 1 source_ref',
    `${rowsMissingRefs} rows missing refs (of ${allRows.length})`,
    rowsMissingRefs === 0 && allRows.length > 0,
  );
  check(
    'mirror_source_refs_prefix_approved',
    `ALL refs start with an approved prefix (${EXPECTED_APPROVED_SOURCE_PREFIXES.join(' | ')}); mixed and embedded-token provenance fail closed`,
    `${unapprovedRefs} unapproved of ${totalRefs} refs`,
    unapprovedRefs === 0 && totalRefs > 0,
  );
  check(
    'mirror_no_fixture_scaffold_markers',
    `no ref contains ${PROMOTED_FIXTURE_MARKERS.join('/')}`,
    `${fixtureMarkedRefs} fixture-marked refs`,
    fixtureMarkedRefs === 0,
  );

  // ---- Forbidden fields + null semantics over the refreshed rows ----------------------------------
  let forbiddenFieldHits = 0;
  for (const row of allRows) {
    for (const key of PROMOTED_FORBIDDEN_AVAILABILITY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) forbiddenFieldHits += 1;
    }
  }
  check(
    'mirror_no_forbidden_availability_fields',
    `no mirror row carries ${PROMOTED_FORBIDDEN_AVAILABILITY_KEYS.join('/')}`,
    `${forbiddenFieldHits} forbidden-field hits`,
    forbiddenFieldHits === 0,
  );
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
    'mirror_unavailable_usage_fields_remain_null',
    `${PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS.join('/')} stay null in every input row: any non-null (zero-coerced OR populated) fails`,
    `${zeroCoercedUsage} zero-coerced, ${populatedUnavailableUsage} populated non-null values`,
    zeroCoercedUsage === 0 && populatedUnavailableUsage === 0,
  );

  // ---- Population/overlap floors (#107 baseline) over the refreshed-mirror matrix evidence ---------
  const countsSane =
    Number.isFinite(overlap.scored_target_rows) &&
    Number.isFinite(overlap.joined_rows) &&
    overlap.scored_target_rows >= 0 &&
    overlap.joined_rows >= 0 &&
    overlap.joined_rows <= overlap.scored_target_rows;
  check(
    'overlap_counts_sane',
    '0 <= joined_rows <= scored_target_rows, both finite',
    `scored=${overlap.scored_target_rows}, joined=${overlap.joined_rows}`,
    countsSane,
  );
  check(
    'overlap_min_joined_rows_overall',
    `>= ${OVERLAP_MIN_JOINED_ROWS_OVERALL}`,
    `${overlap.joined_rows}`,
    overlap.joined_rows >= OVERLAP_MIN_JOINED_ROWS_OVERALL,
  );
  for (const position of OVERLAP_REQUIRED_POSITIONS) {
    const joined = overlap.joined_rows_by_position[position] ?? 0;
    check(
      `overlap_min_joined_rows_position_${position}`,
      `>= ${OVERLAP_MIN_JOINED_ROWS_PER_POSITION}`,
      `${joined}`,
      joined >= OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
    );
  }
  const joinedShare = countsSane && overlap.scored_target_rows > 0 ? overlap.joined_rows / overlap.scored_target_rows : null;
  check(
    'overlap_min_joined_share',
    `>= ${OVERLAP_MIN_JOINED_SHARE}`,
    joinedShare === null ? 'undefined (no scored rows)' : joinedShare.toFixed(4),
    joinedShare !== null && joinedShare >= OVERLAP_MIN_JOINED_SHARE,
  );
  // Missing shuffle evidence must never pass silently: a position that has joined rows but no
  // shuffle-group entry would otherwise make the derangement check below vacuously true. This is an
  // evidence-integrity failure (blocked), not a floor failure (design-only).
  const groupPositions = new Set(overlap.shuffle_groups.map((g) => g.position));
  const joinedPositionsMissingGroups = OVERLAP_REQUIRED_POSITIONS.filter(
    (position) => (overlap.joined_rows_by_position[position] ?? 0) > 0 && !groupPositions.has(position),
  );
  check(
    'overlap_shuffle_evidence_present_for_joined_positions',
    'every required position with joined rows carries a shuffle-group evidence entry (missing evidence fails closed)',
    joinedPositionsMissingGroups.length === 0
      ? `all joined positions have shuffle evidence (${overlap.shuffle_groups.map((g) => g.position).join(', ') || 'none needed'})`
      : `missing shuffle evidence for: ${joinedPositionsMissingGroups.join(', ')}`,
    joinedPositionsMissingGroups.length === 0,
  );
  const infeasibleGroups = overlap.shuffle_groups.filter((g) => g.feature_bearing_row_count > 0 && !g.derangement_possible);
  check(
    'overlap_derangement_feasible_by_position',
    'every position group with feature-bearing rows supports a derangement (required if later control runs are considered)',
    overlap.shuffle_groups.map((g) => `${g.position}:${g.feature_bearing_row_count}${g.derangement_possible ? '' : '(!)'}`).join(', ') ||
      'no groups',
    infeasibleGroups.length === 0,
  );

  // ---- Decision (fail-closed precedence) -----------------------------------------------------------
  const failed = checks.filter((c) => !c.passed);
  const preflightPassed = checks
    .filter((c) => (PREFLIGHT_DIMENSIONS as readonly string[]).includes(c.dimension))
    .every((c) => c.passed);
  const overlapDimensions = OVERLAP_FLOOR_DIMENSIONS as readonly string[];
  const overlapFloorsPassed = checks.filter((c) => overlapDimensions.includes(c.dimension)).every((c) => c.passed);
  const integrityPassed = checks
    .filter((c) => !(PREFLIGHT_DIMENSIONS as readonly string[]).includes(c.dimension) && !overlapDimensions.includes(c.dimension))
    .every((c) => c.passed);

  let decision: PromotedMirrorRefreshDecision;
  let status: PromotedMirrorRefreshGateResult['status'];
  if (!preflightPassed || !integrityPassed) {
    decision = 'blocked_promoted_mirror_refresh_gate_failed';
    status = 'failed';
  } else if (!overlapFloorsPassed) {
    decision = 'may_use_promoted_mirrors_for_design_only';
    status = 'design_only';
  } else {
    decision = 'may_open_promoted_controlled_rerun_issue';
    status = 'passed';
  }

  return {
    ...base,
    status,
    decision,
    checks,
    blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
    preflight_passed: preflightPassed,
    mirror_integrity_passed: integrityPassed,
    overlap_floors_passed: overlapFloorsPassed,
    observed_overlap: {
      scored_target_rows: overlap.scored_target_rows,
      joined_rows: overlap.joined_rows,
      joined_share: joinedShare,
      joined_rows_by_position: { ...overlap.joined_rows_by_position },
    },
  };
};
