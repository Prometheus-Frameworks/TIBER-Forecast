/**
 * Player-history mirror refresh from the promoted 2021-2025 `player_season_coverage_v0` artifact,
 * scoped to the 2024-from-2021-2023 additional-validation path (Forecast #135, following TIBER-Data's
 * 2021-2025 promotion chain #198->#207 and the #207 decision
 * `may_open_forecast_player_history_2021_2023_mirror_refresh_issue`).
 *
 * This is a MIRROR REFRESH ONLY. It runs no model, computes no MAE/RMSE/Pearson/Spearman or any other
 * player-history metric, binds nothing into production Forecast, touches no `seasonalPprModel.ts`,
 * creates no product/advice output, changes nothing in TIBER-Data, and infers no
 * availability/ownership/depth/injury status.
 *
 * This is a DIFFERENT promotion event from the one #117/#119/#120 refreshed mirrors from: TIBER-Data
 * #192/PR#193 promoted seasons 2022-2025 (sha 29f8e378...); TIBER-Data #202/PR#207 promoted seasons
 * 2021-2025 (sha d45f612b...), superseding the #192 OUTPUT at the same artifact_id/path without
 * invalidating the #192 review. The #119/#120 promoted-source mirrors (2025 outcome / 2022-2024 input)
 * and the #110 archived candidate mirrors are all PRESERVED UNCHANGED by this refresh; this module
 * writes to new, distinct mirror paths for the 2024-from-2021-2023 window only.
 *
 * Decision semantics (exactly one is emitted, per the #135 issue's required enum):
 * - `may_open_player_history_2024_from_2021_2023_additional_validation_issue`: source identity,
 *   mirror integrity, and population/overlap floors all passed. A SEPARATE issue may be opened to
 *   consider running additional validation against these mirrors; this decision does not itself run
 *   validation, accept thresholds, or make a production/leakage-audit claim.
 * - `forecast_player_history_mirror_refresh_requires_followup`: source identity and mirror integrity
 *   passed, but a population/overlap floor (or derangement feasibility) failed. The refreshed mirrors
 *   are internally valid but must not be used to open the additional-validation issue yet.
 * - `forecast_player_history_mirror_refresh_blocked`: the gate input was malformed, OR a source
 *   identity/sha/provenance check failed, OR a mirror integrity/leakage/null-semantics check failed.
 *   The refreshed mirrors must not be used at all.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistory2024From2021_2023MirrorRefresh.ts`)
 * reads the local promoted artifact + manifest, computes the actual sha256, and passes everything in.
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
  EXPECTED_APPROVED_SOURCE_PREFIXES,
  EXPECTED_PROMOTED_STATUS,
  PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS,
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_ARTIFACT_REPO,
  PROMOTED_FIXTURE_MARKERS,
  PROMOTED_FORBIDDEN_AVAILABILITY_KEYS,
  PROMOTED_MANIFEST_PATH,
  PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
  checkConsumerSafetyBoundary,
  checkLeakageDataBoundaries,
  checkManifestIdentity,
  checkPromotedArtifactIdentity,
  checkPromotedProvenance,
  type PromotedArtifact,
  type PromotedCoverageRecord,
  type PromotedManifest,
  type PromotedSourceGateExpectations,
} from './playerHistoryPromotedSourceGate.js';
import { EXPECTED_SOURCE_ARTIFACT_STATUS } from './playerHistoryRunPopulationMirrors.js';

export const PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION =
  'player-history-2024-from-2021-2023-mirror-refresh-v1' as const;

export const PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE = 'TIBER-Forecast#135' as const;

// ---------------------------------------------------------------------------------------------
// Pins for the 2021-2025 promotion (TIBER-Data #202 review, PR #207 merge). DIFFERENT event from the
// #192/#193 promotion (2022-2025, sha 29f8e378...) that #117/#119/#120 are pinned to.
// ---------------------------------------------------------------------------------------------

/** TIBER-Data merge commit that landed the 2021-2025 promotion (PR #207). */
export const PROMOTION_MERGE_COMMIT_2021_2025 = '711d6ee158d4e3bd116d1df4d76dea282200454d' as const;

/** Forecast-side pin of the 2021-2025 promoted artifact bytes (TIBER-Data #202/#207 manifest). */
export const PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025 =
  'd45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac' as const;

export const EXPECTED_PROMOTION_REVIEW_2021_2025 = 'TIBER-Data#202' as const;
export const EXPECTED_PROMOTION_DECISION_2021_2025 = 'promote_player_season_coverage_v0_2021_2025' as const;

/** The prior (superseded, but not invalidated) promotion this event's manifest lineage points at. */
export const PRIOR_PROMOTED_ARTIFACT_SHA256_2022_2025 =
  '29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035' as const;

/** Merged 2021-2025 candidate the promotion manifest declares as `source_candidate`. */
export const CANDIDATE_ARTIFACT_PATH_2021_2025 =
  'data/processed/evidence/player_season_coverage_2021_2025.source_backed.json' as const;
export const CANDIDATE_ARTIFACT_SHA256_2021_2025 =
  'c92404a1b519a62ee9f4b75f74662157fc8dd02b883648d4cdae694d0e021424' as const;

/** Expectations for the generic #117 identity-check functions, re-parameterized for this promotion. */
export const PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS: PromotedSourceGateExpectations = {
  promotedArtifactSha256: PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
  promotedStatus: EXPECTED_PROMOTED_STATUS,
  promotionReview: EXPECTED_PROMOTION_REVIEW_2021_2025,
  promotionDecision: EXPECTED_PROMOTION_DECISION_2021_2025,
  candidatePath: CANDIDATE_ARTIFACT_PATH_2021_2025,
  candidateSha256: CANDIDATE_ARTIFACT_SHA256_2021_2025,
  candidateStatusAtPromotion: EXPECTED_SOURCE_ARTIFACT_STATUS,
  approvedSourcePrefixes: EXPECTED_APPROVED_SOURCE_PREFIXES,
  recordCount: 3016,
  bySeason: { '2021': 633, '2022': 609, '2023': 576, '2024': 588, '2025': 610 },
  byPosition: { QB: 404, RB: 771, TE: 650, WR: 1191 },
  seasons: [2021, 2022, 2023, 2024, 2025],
  seasonType: 'REG',
  positions: ['QB', 'RB', 'TE', 'WR'],
  rowGrain: 'player_id + season + season_type',
};

/** The 2024-from-2021-2023 additional-validation path: target season and (leakage-excluded) input window. */
export const TARGET_SEASON_2024 = 2024;
export const INPUT_SEASONS_2021_2023: readonly number[] = [2021, 2022, 2023];

/**
 * Mirrors this refresh must NEVER overwrite: the #110 archived candidate mirrors and the #119/#120
 * promoted-source mirrors (2025 outcome / 2022-2024 input), all preserved as prior-window artifacts.
 */
export const PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED = [
  'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json',
  'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json',
  'data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json',
  'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json',
  'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json',
  'data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json',
] as const;

/** New mirror paths for this refresh, distinct from every path above (tested). */
export const OUTCOME_MIRROR_PATH_2024 = 'data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json' as const;
export const INPUT_MIRROR_PATH_2021_2023 = 'data/fixtures/tiberData/player_history_2021_2023_input_mirror.json' as const;
export const MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023 =
  'data/fixtures/tiberData/PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_PROVENANCE.json' as const;

/**
 * The only decisions this refresh may emit (per the #135 issue). Deliberately NO value contains
 * run/bind/production/metric/advice/threshold semantics: nothing here authorizes a model run, metric
 * computation, production binding, product output, or advice/rankings/threshold acceptance. Even the
 * strongest value only permits OPENING a separate issue that would itself have to authorize any run.
 */
export const PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_DECISIONS = [
  'may_open_player_history_2024_from_2021_2023_additional_validation_issue',
  'forecast_player_history_mirror_refresh_blocked',
  'forecast_player_history_mirror_refresh_requires_followup',
] as const;
export type PlayerHistory2024From2021_2023MirrorRefreshDecision =
  (typeof PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Mirror shapes
// ---------------------------------------------------------------------------------------------

export interface PlayerHistory2024From2021_2023GovernedSource {
  repo: typeof PROMOTED_ARTIFACT_REPO;
  promotedArtifactPath: typeof PROMOTED_ARTIFACT_PATH;
  promotedManifestPath: typeof PROMOTED_MANIFEST_PATH;
  promotionMergeCommit: typeof PROMOTION_MERGE_COMMIT_2021_2025;
  promotionReview: typeof EXPECTED_PROMOTION_REVIEW_2021_2025;
  sha256: typeof PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025;
  artifactStatus: string;
}

/** Explicit lineage from the PRIOR promotion (#192/#193, 2022-2025) to this one (#202/#207, 2021-2025). */
export interface PlayerHistory2024From2021_2023SourceLineage {
  refreshed_from_source: 'prior_promoted_artifact_2022_2025';
  refreshed_to_source: 'promoted_governed_artifact_2021_2025';
  prior_promoted_artifact_sha256: typeof PRIOR_PROMOTED_ARTIFACT_SHA256_2022_2025;
  prior_mirror_paths_preserved_unchanged: readonly string[];
  prior_mirrors_not_overwritten: true;
}

export interface PlayerHistory2024OutcomeMirrorRow {
  player_id: string;
  player_name: string;
  position: string;
  season: number;
  season_type: string;
  /** The 2024 target outcome. OUTCOME LAYER ONLY -- never consumed as a 2024 input feature. */
  season_ppr: number | null;
  source_refs: PlayerHistorySourceRef[];
  identity_confidence: string;
}

export interface PlayerHistory2024OutcomeMirror {
  kind: 'player_history_2024_from_2021_2023_outcome_mirror';
  version: typeof PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION;
  issue: typeof PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE;
  governed_source: PlayerHistory2024From2021_2023GovernedSource;
  source_lineage: PlayerHistory2024From2021_2023SourceLineage;
  boundary: {
    outcome_layer_only: true;
    rows_carry_no_input_features: true;
    outcome_values_must_not_become_2024_input_features: true;
    no_forecast_run_authorized_by_this_mirror: true;
    no_production_binding_authorized_by_this_mirror: true;
    no_validation_run_or_threshold_decision_by_this_mirror: true;
  };
  target_season: number;
  season_type: string;
  counts: { rows: number; players: number; by_position: Record<string, number> };
  rows: PlayerHistory2024OutcomeMirrorRow[];
}

export interface PlayerHistory2021_2023NoHistoryPlayer {
  player_id: string;
  player_name: string;
  position: string;
  note: 'no_2021_2023_source_rows_documented_absence_not_a_mirror_failure';
}

export interface PlayerHistory2021_2023InputMirror {
  kind: 'player_history_2024_from_2021_2023_input_mirror';
  version: typeof PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION;
  issue: typeof PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE;
  governed_source: PlayerHistory2024From2021_2023GovernedSource;
  source_lineage: PlayerHistory2024From2021_2023SourceLineage;
  input_window: { seasons: number[]; season_type: string; target_season_excluded: number };
  boundary: {
    contains_no_target_season_rows: true;
    contains_no_2024_outcome_values: true;
    nulls_preserved_never_zero_coerced: true;
    no_availability_ownership_depth_injury_fields: true;
    no_forecast_run_authorized_by_this_mirror: true;
    no_production_binding_authorized_by_this_mirror: true;
    no_validation_run_or_threshold_decision_by_this_mirror: true;
  };
  counts: {
    rows: number;
    players_with_history: number;
    outcome_players_without_history: number;
    by_season: Record<number, number>;
    by_position: Record<string, number>;
  };
  no_history_players: PlayerHistory2021_2023NoHistoryPlayer[];
  rows: PlayerHistoryInputRow[];
}

// ---------------------------------------------------------------------------------------------
// Builders (pure, deterministic, fail-closed)
// ---------------------------------------------------------------------------------------------

const sourceLineage = (): PlayerHistory2024From2021_2023SourceLineage => ({
  refreshed_from_source: 'prior_promoted_artifact_2022_2025',
  refreshed_to_source: 'promoted_governed_artifact_2021_2025',
  prior_promoted_artifact_sha256: PRIOR_PROMOTED_ARTIFACT_SHA256_2022_2025,
  prior_mirror_paths_preserved_unchanged: PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED,
  prior_mirrors_not_overwritten: true,
});

const governedSource = (artifactStatus: string): PlayerHistory2024From2021_2023GovernedSource => ({
  repo: PROMOTED_ARTIFACT_REPO,
  promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
  promotedManifestPath: PROMOTED_MANIFEST_PATH,
  promotionMergeCommit: PROMOTION_MERGE_COMMIT_2021_2025,
  promotionReview: EXPECTED_PROMOTION_REVIEW_2021_2025,
  sha256: PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  artifactStatus,
});

const assertNoForbiddenKeys = (record: PromotedCoverageRecord): void => {
  for (const key of PROMOTED_FORBIDDEN_AVAILABILITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(
        `2024-from-2021-2023 mirror refresh: source record player_id=${record.player_id} season=${record.season} carries forbidden availability field ${key}; the build fails closed.`,
      );
    }
  }
};

const assertPrefixApprovedRefs = (record: PromotedCoverageRecord): void => {
  const refs = Array.isArray(record.source_refs) ? record.source_refs : [];
  if (refs.length === 0) {
    throw new Error(
      `2024-from-2021-2023 mirror refresh: source record player_id=${record.player_id} season=${record.season} carries no source_refs; the build fails closed.`,
    );
  }
  for (const ref of refs) {
    const name = String(ref.source_name ?? '');
    if (!EXPECTED_APPROVED_SOURCE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      throw new Error(
        `2024-from-2021-2023 mirror refresh: source record player_id=${record.player_id} season=${record.season} carries non-prefix-approved source_ref "${name}"; the build fails closed.`,
      );
    }
    if (PROMOTED_FIXTURE_MARKERS.some((marker) => name.includes(marker))) {
      throw new Error(
        `2024-from-2021-2023 mirror refresh: source record player_id=${record.player_id} season=${record.season} carries fixture/scaffold-marked source_ref "${name}"; the build fails closed.`,
      );
    }
  }
};

const trimSourceRefs = (refs: PromotedCoverageRecord['source_refs']): PlayerHistorySourceRef[] =>
  refs.map((ref) => ({ source_name: ref.source_name, observed_at: ref.observed_at ?? null }));

const byPlayerIdThenSeason = (a: { player_id: string; season: number }, b: { player_id: string; season: number }): number =>
  a.player_id < b.player_id ? -1 : a.player_id > b.player_id ? 1 : a.season - b.season;

const countByPosition = (rows: ReadonlyArray<{ position: string }>): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.position] = (counts[row.position] ?? 0) + 1;
  return counts;
};

interface RawUsageSummary {
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
  [key: string]: unknown;
}

interface RawProductionSummary {
  season_ppr: number | null;
  season_ppg: number | null;
  games_for_ppg: number | null;
  [key: string]: unknown;
}

/**
 * Build the 2024 REG outcome mirror: one row per target-population player, carrying the target
 * outcome + identity + row-level provenance ONLY. Deterministic (sorted by player_id); fails closed
 * on forbidden fields, missing/unapproved/fixture-marked provenance, or duplicate
 * `player_id + season + season_type` grain.
 */
export const buildPlayerHistory2024OutcomeMirror = (artifact: PromotedArtifact): PlayerHistory2024OutcomeMirror => {
  const targetRecords = artifact.records.filter(
    (record) =>
      record.season === TARGET_SEASON_2024 &&
      record.season_type === PLAYER_HISTORY_APPROVED_SEASON_TYPE &&
      PLAYER_HISTORY_APPROVED_POSITIONS.includes(record.position),
  );
  const seen = new Set<string>();
  const rows: PlayerHistory2024OutcomeMirrorRow[] = [];
  for (const record of targetRecords) {
    assertNoForbiddenKeys(record);
    assertPrefixApprovedRefs(record);
    const grainKey = `${record.player_id}|${record.season}|${record.season_type}`;
    if (seen.has(grainKey)) {
      throw new Error(`2024-from-2021-2023 mirror refresh: duplicate outcome grain ${grainKey}; the build fails closed.`);
    }
    seen.add(grainKey);
    const production = record.production_summary as unknown as RawProductionSummary;
    rows.push({
      player_id: record.player_id,
      player_name: String(record.player_name ?? ''),
      position: record.position,
      season: record.season,
      season_type: record.season_type,
      season_ppr: production?.season_ppr ?? null,
      source_refs: trimSourceRefs(record.source_refs),
      identity_confidence: String(record.identity_confidence),
    });
  }
  rows.sort(byPlayerIdThenSeason);
  return {
    kind: 'player_history_2024_from_2021_2023_outcome_mirror',
    version: PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION,
    issue: PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE,
    governed_source: governedSource(artifact.status),
    source_lineage: sourceLineage(),
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      outcome_values_must_not_become_2024_input_features: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
      no_validation_run_or_threshold_decision_by_this_mirror: true,
    },
    target_season: TARGET_SEASON_2024,
    season_type: PLAYER_HISTORY_APPROVED_SEASON_TYPE,
    counts: { rows: rows.length, players: new Set(rows.map((r) => r.player_id)).size, by_position: countByPosition(rows) },
    rows,
  };
};

const trimToInputRow = (record: PromotedCoverageRecord): PlayerHistoryInputRow => {
  const production = record.production_summary as unknown as RawProductionSummary;
  const usage = (record.usage_summary ?? {}) as RawUsageSummary;
  return {
    player_id: record.player_id,
    player_name: String(record.player_name ?? ''),
    position: record.position,
    season: record.season,
    season_type: record.season_type,
    identity_confidence: String(record.identity_confidence),
    source_refs: trimSourceRefs(record.source_refs),
    teams: Array.isArray(record.teams) ? [...(record.teams as string[])] : [],
    primary_team: (record.primary_team as string | null) ?? null,
    primary_team_rule: (record.primary_team_rule as string | null) ?? null,
    weeks_observed: Number(record.weeks_observed ?? 0),
    coverage_status: String(record.coverage_status ?? ''),
    missing_fields: Array.isArray(record.missing_fields) ? [...(record.missing_fields as string[])] : [],
    production_summary: {
      season_ppr: production?.season_ppr ?? null,
      season_ppg: production?.season_ppg ?? null,
      games_for_ppg: production?.games_for_ppg ?? null,
    },
    // Nulls are preserved verbatim -- unavailable usage fields stay null, never zero-coerced.
    usage_summary: {
      targets: usage.targets ?? null,
      receptions: usage.receptions ?? null,
      rushing_attempts: usage.rushing_attempts ?? null,
      receiving_air_yards: usage.receiving_air_yards ?? null,
      target_share: usage.target_share ?? null,
      air_yards_share: usage.air_yards_share ?? null,
      wopr: usage.wopr ?? null,
      racr: usage.racr ?? null,
      snap_share: usage.snap_share ?? null,
      routes_run: usage.routes_run ?? null,
      route_participation: usage.route_participation ?? null,
      red_zone_targets: usage.red_zone_targets ?? null,
      red_zone_carries: usage.red_zone_carries ?? null,
    },
    birth_date: (record.birth_date as string | null) ?? null,
    season_age: (record.season_age as number | null) ?? null,
    draft_year: (record.draft_year as number | null) ?? null,
    rookie_year: (record.rookie_year as number | null) ?? null,
    career_year: (record.career_year as number | null) ?? null,
  };
};

/**
 * Build the 2021-2023 REG input mirror for the outcome-mirror population: ALL input-window rows for
 * every outcome player, trimmed to the fields the #104 scaffold consumes. Structurally contains no
 * target-season row and no 2024 outcome value; outcome players with no input rows are documented
 * no-history players, not failures.
 */
export const buildPlayerHistory2021_2023InputMirror = (
  artifact: PromotedArtifact,
  outcomeMirror: PlayerHistory2024OutcomeMirror,
): PlayerHistory2021_2023InputMirror => {
  const populationIds = new Set(outcomeMirror.rows.map((row) => row.player_id));
  const inputSeasons = new Set(INPUT_SEASONS_2021_2023);
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
      throw new Error(`2024-from-2021-2023 mirror refresh: duplicate input grain ${grainKey}; the build fails closed.`);
    }
    seen.add(grainKey);
    rows.push(trimToInputRow(record));
  }
  rows.sort(byPlayerIdThenSeason);

  const playersWithHistory = new Set(rows.map((row) => row.player_id));
  const noHistoryPlayers: PlayerHistory2021_2023NoHistoryPlayer[] = outcomeMirror.rows
    .filter((row) => !playersWithHistory.has(row.player_id))
    .map((row) => ({
      player_id: row.player_id,
      player_name: row.player_name,
      position: row.position,
      note: 'no_2021_2023_source_rows_documented_absence_not_a_mirror_failure',
    }));

  const bySeason: Record<number, number> = {};
  for (const row of rows) bySeason[row.season] = (bySeason[row.season] ?? 0) + 1;

  return {
    kind: 'player_history_2024_from_2021_2023_input_mirror',
    version: PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION,
    issue: PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE,
    governed_source: governedSource(artifact.status),
    source_lineage: sourceLineage(),
    input_window: {
      seasons: [...INPUT_SEASONS_2021_2023],
      season_type: PLAYER_HISTORY_APPROVED_SEASON_TYPE,
      target_season_excluded: TARGET_SEASON_2024,
    },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2024_outcome_values: true,
      nulls_preserved_never_zero_coerced: true,
      no_availability_ownership_depth_injury_fields: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
      no_validation_run_or_threshold_decision_by_this_mirror: true,
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
// Source identity (verified separately, fail-closed, before any mirror is trusted)
// ---------------------------------------------------------------------------------------------

export interface PlayerSeasonCoverageV0_2021_2025IdentityCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface PlayerSeasonCoverageV0_2021_2025IdentityInput {
  manifest: PromotedManifest;
  artifact: PromotedArtifact;
  /** sha256 hex of the ACTUAL promoted artifact bytes, computed by the caller from the file read. */
  actualPromotedArtifactSha256: string;
}

export interface PlayerSeasonCoverageV0_2021_2025IdentityResult {
  passed: boolean;
  checks: PlayerSeasonCoverageV0_2021_2025IdentityCheck[];
  blocking_reasons: string[];
}

/**
 * Verify the promoted artifact's identity/sha/provenance/consumer-safety boundary against the
 * #202/#207 pins, RECOMPUTING every count/grain/provenance scan from the actual records rather than
 * trusting the manifest's envelope claims. Pure (no I/O). `expect` defaults to the real #202/#207
 * pins; tests may override it with a small synthetic expectations object so mutation tests do not
 * need to reconstruct the full 3016-record artifact.
 */
export const evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity = (
  input: PlayerSeasonCoverageV0_2021_2025IdentityInput,
  expect: PromotedSourceGateExpectations = PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS,
): PlayerSeasonCoverageV0_2021_2025IdentityResult => {
  const checks: PlayerSeasonCoverageV0_2021_2025IdentityCheck[] = [
    ...checkManifestIdentity(input.manifest, input.actualPromotedArtifactSha256, expect),
    ...checkPromotedArtifactIdentity(input.artifact, input.manifest, expect),
    ...checkPromotedProvenance(input.artifact.records, expect.approvedSourcePrefixes),
    ...checkConsumerSafetyBoundary(input.manifest),
    ...checkLeakageDataBoundaries(input.artifact.records),
  ];
  const failed = checks.filter((c) => !c.passed);
  return {
    passed: failed.length === 0,
    checks,
    blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
  };
};

// ---------------------------------------------------------------------------------------------
// Refresh gate (source identity result + mirror integrity + population/overlap floors)
// ---------------------------------------------------------------------------------------------

export interface PlayerHistory2024From2021_2023OverlapEvidence {
  scored_target_rows: number;
  joined_rows: number;
  joined_rows_by_position: Record<string, number>;
  shuffle_groups: Array<{ position: string; feature_bearing_row_count: number; derangement_possible: boolean }>;
}

export interface PlayerHistory2024From2021_2023MirrorRefreshGateInput {
  /** Result of verifying source identity separately (see `evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity`). */
  sourceIdentity: PlayerSeasonCoverageV0_2021_2025IdentityResult;
  outcomeMirror: PlayerHistory2024OutcomeMirror;
  inputMirror: PlayerHistory2021_2023InputMirror;
  overlap: PlayerHistory2024From2021_2023OverlapEvidence;
}

export interface PlayerHistory2024From2021_2023MirrorRefreshCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface PlayerHistory2024From2021_2023MirrorRefreshGateResult {
  gate_version: typeof PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION;
  issue: typeof PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE;
  status: 'passed' | 'requires_followup' | 'blocked' | 'invalid';
  decision: PlayerHistory2024From2021_2023MirrorRefreshDecision;
  decision_rule: string;
  checks: PlayerHistory2024From2021_2023MirrorRefreshCheck[];
  blocking_reasons: string[];
  source_identity_passed: boolean;
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
  prior_mirror_statement: string;
  ceiling_note: string;
}

const DECISION_RULE =
  'malformed gate input, OR any source-identity check (manifest/artifact/provenance/consumer-safety/leakage-data ' +
  'boundaries) failed, OR any refreshed-mirror integrity/leakage/provenance/null-semantics check failed -> ' +
  'forecast_player_history_mirror_refresh_blocked; identity and integrity passed but a population/overlap floor or ' +
  'derangement feasibility failed -> forecast_player_history_mirror_refresh_requires_followup; everything passed -> ' +
  'may_open_player_history_2024_from_2021_2023_additional_validation_issue. No decision authorizes a model run, ' +
  'metric computation, production binding, product output, advice/rankings, or threshold acceptance.';

const CEILING_NOTE =
  'may_open_player_history_2024_from_2021_2023_additional_validation_issue is the strongest decision this refresh can ' +
  'emit. It authorizes only OPENING a separate, later issue to consider running additional validation against these ' +
  'mirrors. It does not itself run that validation, accept or amend thresholds, make a leakage-audit or ' +
  'production-readiness claim, compute any metric, bind anything into production Forecast, or make a product/signal claim.';

const PRIOR_MIRROR_STATEMENT =
  'The #110 archived candidate mirrors and the #119/#120 promoted-source mirrors (2025 outcome / 2022-2024 input) at ' +
  PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED.join(', ') +
  ' are preserved unchanged. The mirrors refreshed here are written to new, distinct paths for the 2024-from-2021-2023 ' +
  'window and carry an explicit source_lineage block; nothing overwrites any prior mirror silently.';

const gateInputProblems = (input: Partial<PlayerHistory2024From2021_2023MirrorRefreshGateInput>): string[] => {
  const problems: string[] = [];
  if (!input.sourceIdentity || typeof input.sourceIdentity !== 'object' || typeof input.sourceIdentity.passed !== 'boolean') {
    problems.push('sourceIdentity missing or not a source-identity result');
  }
  if (!input.outcomeMirror || !Array.isArray(input.outcomeMirror.rows)) problems.push('outcomeMirror missing or rows not an array');
  if (!input.inputMirror || !Array.isArray(input.inputMirror.rows)) problems.push('inputMirror missing or rows not an array');
  if (!input.overlap || typeof input.overlap !== 'object') problems.push('overlap evidence missing');
  return problems;
};

/**
 * Evaluate the full 2024-from-2021-2023 mirror-refresh gate: source identity against the #202/#207
 * promotion pins, refreshed-mirror integrity (scope, leakage, provenance, null semantics), and the
 * #107-floor population/overlap checks. Pure (no I/O), fail-closed.
 */
export const evaluatePlayerHistory2024From2021_2023MirrorRefreshGate = (
  input: Partial<PlayerHistory2024From2021_2023MirrorRefreshGateInput>,
): PlayerHistory2024From2021_2023MirrorRefreshGateResult => {
  const problems = gateInputProblems(input);
  const base = {
    gate_version: PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION,
    issue: PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE,
    decision_rule: DECISION_RULE,
    thresholds: {
      min_joined_rows_overall: OVERLAP_MIN_JOINED_ROWS_OVERALL,
      min_joined_rows_per_position: OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
      min_joined_share: OVERLAP_MIN_JOINED_SHARE,
      required_positions: OVERLAP_REQUIRED_POSITIONS,
    },
    leakage_discipline: PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
    prior_mirror_statement: PRIOR_MIRROR_STATEMENT,
    ceiling_note: CEILING_NOTE,
  } as const;
  if (problems.length > 0) {
    return {
      ...base,
      status: 'invalid',
      decision: 'forecast_player_history_mirror_refresh_blocked',
      checks: [],
      blocking_reasons: problems.map((p) => `gate input malformed: ${p}`),
      source_identity_passed: false,
      mirror_integrity_passed: false,
      overlap_floors_passed: false,
      observed_overlap: { scored_target_rows: 0, joined_rows: 0, joined_share: null, joined_rows_by_position: {} },
    };
  }
  const { sourceIdentity, outcomeMirror, inputMirror, overlap } = input as PlayerHistory2024From2021_2023MirrorRefreshGateInput;

  const checks: PlayerHistory2024From2021_2023MirrorRefreshCheck[] = [];
  const check = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ dimension, expected, observed, passed });
  };

  // ---- Source identity against the #202/#207 promotion pins (verified separately, see
  // `evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity`; this gate trusts only its `passed` flag
  // and folds its own checks in verbatim for a complete evidence trail) -------------------------------
  for (const c of sourceIdentity.checks) check(c.dimension, c.expected, c.observed, c.passed);
  const identityPassed = sourceIdentity.passed;

  // ---- Outcome mirror integrity ------------------------------------------------------------------
  check(
    'outcome_mirror_kind_and_source',
    `kind player_history_2024_from_2021_2023_outcome_mirror tied to promoted sha ${PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025} (status ${EXPECTED_PROMOTED_STATUS})`,
    `kind=${outcomeMirror.kind} sha=${outcomeMirror.governed_source?.sha256} status=${outcomeMirror.governed_source?.artifactStatus}`,
    outcomeMirror.kind === 'player_history_2024_from_2021_2023_outcome_mirror' &&
      outcomeMirror.governed_source?.sha256 === PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025 &&
      outcomeMirror.governed_source?.artifactStatus === EXPECTED_PROMOTED_STATUS,
  );
  const outcomeOffScope = outcomeMirror.rows.filter(
    (row) =>
      row.season !== TARGET_SEASON_2024 ||
      row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE ||
      !PLAYER_HISTORY_APPROVED_POSITIONS.includes(row.position),
  ).length;
  check(
    'outcome_rows_2024_reg_approved_positions_only',
    `every row season=${TARGET_SEASON_2024}, season_type=${PLAYER_HISTORY_APPROVED_SEASON_TYPE}, position in ${PLAYER_HISTORY_APPROVED_POSITIONS.join('/')}`,
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
    `kind player_history_2024_from_2021_2023_input_mirror tied to promoted sha ${PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025} (status ${EXPECTED_PROMOTED_STATUS})`,
    `kind=${inputMirror.kind} sha=${inputMirror.governed_source?.sha256} status=${inputMirror.governed_source?.artifactStatus}`,
    inputMirror.kind === 'player_history_2024_from_2021_2023_input_mirror' &&
      inputMirror.governed_source?.sha256 === PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025 &&
      inputMirror.governed_source?.artifactStatus === EXPECTED_PROMOTED_STATUS,
  );
  const inputSeasonSet = new Set(INPUT_SEASONS_2021_2023);
  const input2024Rows = inputMirror.rows.filter((row) => row.season === TARGET_SEASON_2024).length;
  const inputOffWindow = inputMirror.rows.filter(
    (row) => !inputSeasonSet.has(row.season) || row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE,
  ).length;
  check(
    'input_no_2024_rows',
    `0 rows with season ${TARGET_SEASON_2024}; every row in ${INPUT_SEASONS_2021_2023.join('/')} ${PLAYER_HISTORY_APPROVED_SEASON_TYPE}`,
    `${input2024Rows} target-season rows, ${inputOffWindow} off-window rows of ${inputMirror.rows.length}`,
    input2024Rows === 0 && inputOffWindow === 0 && inputMirror.rows.length > 0,
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
  const TARGET_OUTCOME_KEYS = ['ppr_2024_actual', 'season_ppr_2024', 'target_outcome', 'target_season_ppr'];
  const rowsWithTargetOutcome = inputMirror.rows.filter((row) =>
    TARGET_OUTCOME_KEYS.some((key) => Object.prototype.hasOwnProperty.call(row, key)),
  ).length;
  check(
    'input_no_target_outcome_values',
    `no input row carries ${TARGET_OUTCOME_KEYS.join('/')} (2024 outcomes live in the outcome layer only)`,
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

  const integrityChecks = checks.slice(sourceIdentity.checks.length);
  const integrityPassed = integrityChecks.every((c) => c.passed);

  // ---- Population/overlap floors (#107 baseline) over the refreshed-mirror overlap evidence ---------
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
    'every position group with feature-bearing rows supports a derangement (required if a later validation issue considers control runs)',
    overlap.shuffle_groups.map((g) => `${g.position}:${g.feature_bearing_row_count}${g.derangement_possible ? '' : '(!)'}`).join(', ') ||
      'no groups',
    infeasibleGroups.length === 0,
  );

  const overlapFloorDimensions = new Set([
    'overlap_min_joined_rows_overall',
    ...OVERLAP_REQUIRED_POSITIONS.map((p) => `overlap_min_joined_rows_position_${p}`),
    'overlap_min_joined_share',
    'overlap_derangement_feasible_by_position',
  ]);
  const overlapChecks = checks.slice(sourceIdentity.checks.length + integrityChecks.length);
  // overlap_counts_sane and overlap_shuffle_evidence_present are evidence-integrity checks (block outright), not floors.
  const overlapIntegrityOk = overlapChecks
    .filter((c) => !overlapFloorDimensions.has(c.dimension))
    .every((c) => c.passed);
  const overlapFloorsPassed = overlapChecks.filter((c) => overlapFloorDimensions.has(c.dimension)).every((c) => c.passed);

  const failed = checks.filter((c) => !c.passed);
  let decision: PlayerHistory2024From2021_2023MirrorRefreshDecision;
  let status: PlayerHistory2024From2021_2023MirrorRefreshGateResult['status'];
  if (!identityPassed || !integrityPassed || !overlapIntegrityOk) {
    decision = 'forecast_player_history_mirror_refresh_blocked';
    status = 'blocked';
  } else if (!overlapFloorsPassed) {
    decision = 'forecast_player_history_mirror_refresh_requires_followup';
    status = 'requires_followup';
  } else {
    decision = 'may_open_player_history_2024_from_2021_2023_additional_validation_issue';
    status = 'passed';
  }

  return {
    ...base,
    status,
    decision,
    checks,
    blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
    source_identity_passed: identityPassed,
    mirror_integrity_passed: integrityPassed && overlapIntegrityOk,
    overlap_floors_passed: overlapFloorsPassed,
    observed_overlap: {
      scored_target_rows: overlap.scored_target_rows,
      joined_rows: overlap.joined_rows,
      joined_share: joinedShare,
      joined_rows_by_position: { ...overlap.joined_rows_by_position },
    },
  };
};
