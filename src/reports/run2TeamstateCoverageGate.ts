/**
 * Teamstate Run 2 coverage gate (#92).
 *
 * A pure, read-only benchmark evaluator that decides whether the governed Teamstate coverage is rich
 * enough to justify rerunning the (unchanged) #86 three-arm comparison. It performs NO rerun, no model
 * fit, no tuning, and no change to features/data/null-handling — it only checks coverage evidence
 * against fixed thresholds and returns a machine-readable status + decision. It exists because the
 * first controlled Run 2 (#86/#88) failed its sanity control on coverage so sparse (3/32 teams, 8/38
 * scored rows, ~82% imputed cells) that no Teamstate signal claim was possible. The gate fails closed:
 * missing governance/cutoff/join evidence blocks a rerun before any coverage math is trusted.
 */

/** Canonical 32 NFL team codes (nflverse-style), used to compute team coverage and missing teams. */
export const NFL_TEAM_CODES_32: readonly string[] = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF',
  'TB', 'TEN', 'WAS',
];

export const RUN2_COVERAGE_GATE_VERSION = 'run2-teamstate-coverage-gate-v1' as const;
/** Preferred: every team covered. Minimum candidate threshold to even consider a rerun. */
export const RUN2_GATE_PREFERRED_TEAM_COVERAGE = 32;
export const RUN2_GATE_MIN_TEAM_COVERAGE = 28;
/** At least 80% of scored Forecast rows must match governed Teamstate values. */
export const RUN2_GATE_MIN_SCORED_ROW_COVERAGE = 0.8;
/** At least 75% of Teamstate feature cells must be real governed (non-null) values. */
export const RUN2_GATE_MIN_NONNULL_CELL_COVERAGE = 0.75;

export type Run2CoverageGateStatus =
  | 'teamstate_coverage_gate_passed'
  | 'teamstate_coverage_gate_failed_missing_governance'
  | 'teamstate_coverage_gate_failed_cutoff'
  | 'teamstate_coverage_gate_failed_team_coverage'
  | 'teamstate_coverage_gate_failed_scored_row_coverage'
  | 'teamstate_coverage_gate_failed_null_dominance'
  | 'teamstate_coverage_gate_failed_join_diagnostics_missing'
  | 'teamstate_coverage_gate_not_evaluated';

export type Run2CoverageGateDecision =
  | 'may_rerun_unchanged_comparison'
  | 'must_not_rerun'
  | 'fail_closed_incomplete_evidence';

export interface Run2CoverageGovernanceEvidence {
  governance_marker_present: boolean;
  artifact_version: string | null;
  row_grain: string | null;
  generated_at: string | null;
  source_refs: string[];
  validation_refs: string[];
  lineage_refs: string[];
}

export interface Run2CoverageCutoffEvidence {
  recorded_cutoff_as_of: string | null;
  cutoff_before_target_season_start: boolean;
  no_target_season_leakage: boolean;
  no_fantasy_result_leakage: boolean;
}

export interface Run2CoveragePositionEvidence {
  position: string;
  matched: number;
  scored: number;
}

export interface Run2CoverageJoinRow {
  player_id: string;
  player_name?: string | null;
  position: string;
  team_2024: string;
  teamstate_team_code: string | null;
  matched: boolean;
  unmatched_reason?: string | null;
  source_artifact_ref?: string | null;
}

export interface Run2TeamstateCoverageEvidence {
  governance: Run2CoverageGovernanceEvidence;
  cutoff: Run2CoverageCutoffEvidence;
  covered_teams: string[];
  scored_row_count: number;
  matched_row_count: number;
  teamstate_feature_columns: string[];
  teamstate_cell_total: number;
  teamstate_cell_nonnull: number;
  null_cells_by_column: Record<string, number>;
  positions: Run2CoveragePositionEvidence[];
  /** Row-level join evidence. `null` (or empty) means it was not supplied → gate fails closed. */
  join_diagnostics: Run2CoverageJoinRow[] | null;
}

export interface Run2CoverageGateCheck {
  dimension: string;
  passed: boolean;
  observed: string;
  threshold: string;
  detail: string;
}

export interface Run2CoverageGateResult {
  gate_version: typeof RUN2_COVERAGE_GATE_VERSION;
  status: Run2CoverageGateStatus;
  decision: Run2CoverageGateDecision;
  team_coverage: {
    covered_count: number;
    preferred: number;
    minimum: number;
    covered_teams: string[];
    missing_teams: string[];
    passed: boolean;
  };
  scored_row_coverage: { matched: number; scored: number; ratio: number; threshold: number; passed: boolean };
  nonnull_cell_coverage: {
    nonnull: number;
    total: number;
    ratio: number;
    threshold: number;
    passed: boolean;
    null_cells_by_column: Record<string, number>;
  };
  position_coverage: Array<{ position: string; matched: number; scored: number; ratio: number; has_meaningful_coverage: boolean }>;
  checks: Run2CoverageGateCheck[];
  blocking_reasons: string[];
  warnings: string[];
  notes: string[];
}

const ratio = (numerator: number, denominator: number): number => (denominator > 0 ? numerator / denominator : 0);
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const GATE_NOTES = [
  'Coverage gate only: it performs NO Run 2 rerun, no model fit/tuning, no feature change, and no null-handling change. It evaluates coverage evidence and returns a decision.',
  'Null policy is unchanged and is comparison-time only: unavailable stays unavailable, never silent zero-fill; train-fold mean imputation is not applied here — the gate only measures how much imputation a rerun WOULD require.',
  'A pass authorizes only an UNCHANGED rerun of the #86 three-arm comparison; it makes no claim that Teamstate works or does not work in general.',
];

/**
 * Evaluate the Teamstate Run 2 coverage gate. Fail-closed precedence: governance → cutoff → join
 * diagnostics present → team coverage → scored-row coverage → non-null cell coverage. Position
 * coverage is reported and warned on (a position with scored rows but no matches), but does not by
 * itself flip the status. `null` evidence is `not_evaluated` (fail closed).
 */
export const evaluateRun2TeamstateCoverageGate = (
  evidence: Run2TeamstateCoverageEvidence | null,
): Run2CoverageGateResult => {
  const emptyTeamCoverage = {
    covered_count: 0,
    preferred: RUN2_GATE_PREFERRED_TEAM_COVERAGE,
    minimum: RUN2_GATE_MIN_TEAM_COVERAGE,
    covered_teams: [] as string[],
    missing_teams: [...NFL_TEAM_CODES_32],
    passed: false,
  };
  const emptyScored = { matched: 0, scored: 0, ratio: 0, threshold: RUN2_GATE_MIN_SCORED_ROW_COVERAGE, passed: false };
  const emptyCells = {
    nonnull: 0,
    total: 0,
    ratio: 0,
    threshold: RUN2_GATE_MIN_NONNULL_CELL_COVERAGE,
    passed: false,
    null_cells_by_column: {} as Record<string, number>,
  };

  if (evidence === null) {
    return {
      gate_version: RUN2_COVERAGE_GATE_VERSION,
      status: 'teamstate_coverage_gate_not_evaluated',
      decision: 'fail_closed_incomplete_evidence',
      team_coverage: emptyTeamCoverage,
      scored_row_coverage: emptyScored,
      nonnull_cell_coverage: emptyCells,
      position_coverage: [],
      checks: [],
      blocking_reasons: ['No coverage evidence supplied; the gate cannot be evaluated.'],
      warnings: [],
      notes: GATE_NOTES,
    };
  }

  const nflSet = new Set(NFL_TEAM_CODES_32);
  const coveredTeams = [...new Set(evidence.covered_teams.filter((team) => nflSet.has(team)))].sort();
  const missingTeams = NFL_TEAM_CODES_32.filter((team) => !coveredTeams.includes(team));
  const teamPassed = coveredTeams.length >= RUN2_GATE_MIN_TEAM_COVERAGE;

  const scoredRatio = ratio(evidence.matched_row_count, evidence.scored_row_count);
  const scoredPassed = scoredRatio >= RUN2_GATE_MIN_SCORED_ROW_COVERAGE;

  const cellRatio = ratio(evidence.teamstate_cell_nonnull, evidence.teamstate_cell_total);
  const cellPassed = cellRatio >= RUN2_GATE_MIN_NONNULL_CELL_COVERAGE;

  const teamCoverage = {
    covered_count: coveredTeams.length,
    preferred: RUN2_GATE_PREFERRED_TEAM_COVERAGE,
    minimum: RUN2_GATE_MIN_TEAM_COVERAGE,
    covered_teams: coveredTeams,
    missing_teams: missingTeams,
    passed: teamPassed,
  };
  const scoredCoverage = {
    matched: evidence.matched_row_count,
    scored: evidence.scored_row_count,
    ratio: scoredRatio,
    threshold: RUN2_GATE_MIN_SCORED_ROW_COVERAGE,
    passed: scoredPassed,
  };
  const cellCoverage = {
    nonnull: evidence.teamstate_cell_nonnull,
    total: evidence.teamstate_cell_total,
    ratio: cellRatio,
    threshold: RUN2_GATE_MIN_NONNULL_CELL_COVERAGE,
    passed: cellPassed,
    null_cells_by_column: evidence.null_cells_by_column,
  };
  const positionCoverage = evidence.positions.map((position) => ({
    position: position.position,
    matched: position.matched,
    scored: position.scored,
    ratio: ratio(position.matched, position.scored),
    has_meaningful_coverage: position.scored === 0 || position.matched > 0,
  }));

  // Governance prerequisites (checked before any coverage math is trusted).
  const g = evidence.governance;
  const governanceComplete =
    g.governance_marker_present &&
    typeof g.artifact_version === 'string' && g.artifact_version.length > 0 &&
    typeof g.row_grain === 'string' && g.row_grain.length > 0 &&
    typeof g.generated_at === 'string' && g.generated_at.length > 0 &&
    g.source_refs.length > 0 && g.validation_refs.length > 0 && g.lineage_refs.length > 0;

  const c = evidence.cutoff;
  const cutoffComplete =
    typeof c.recorded_cutoff_as_of === 'string' && c.recorded_cutoff_as_of.length > 0 &&
    c.cutoff_before_target_season_start && c.no_target_season_leakage && c.no_fantasy_result_leakage;

  const joinPresent = Array.isArray(evidence.join_diagnostics) && evidence.join_diagnostics.length > 0;

  const checks: Run2CoverageGateCheck[] = [
    {
      dimension: 'governance_prerequisites',
      passed: governanceComplete,
      observed: governanceComplete ? 'all governance/source/validation/lineage refs present' : 'missing one or more governance prerequisites',
      threshold: 'explicit marker + artifact version + row grain + generated_at + source/validation/lineage refs',
      detail: 'Governance prerequisites must be present before coverage is trusted.',
    },
    {
      dimension: 'cutoff_prerequisites',
      passed: cutoffComplete,
      observed: cutoffComplete ? `recorded as-of ${c.recorded_cutoff_as_of}, pre-target, no leakage` : 'missing/invalid cutoff or leakage flag',
      threshold: 'recorded as-of + cutoff before target-season start + no target-season/fantasy-result leakage',
      detail: 'Cutoff prerequisites must be present and leakage-free before coverage is trusted.',
    },
    {
      dimension: 'join_diagnostics_present',
      passed: joinPresent,
      observed: joinPresent ? `${evidence.join_diagnostics!.length} row-level join records` : 'no row-level join evidence',
      threshold: 'row-level join diagnostics required (player/team/teamCode/matched/source)',
      detail: 'Row-level join evidence is required to distinguish true coverage gaps from join bugs.',
    },
    {
      dimension: 'team_coverage',
      passed: teamPassed,
      observed: `${coveredTeams.length}/32 teams`,
      threshold: `>= ${RUN2_GATE_MIN_TEAM_COVERAGE}/32 (preferred ${RUN2_GATE_PREFERRED_TEAM_COVERAGE}/32)`,
      detail: missingTeams.length > 0 ? `missing: ${missingTeams.join(', ')}` : 'all teams covered',
    },
    {
      dimension: 'scored_row_coverage',
      passed: scoredPassed,
      observed: `${evidence.matched_row_count}/${evidence.scored_row_count} (${pct(scoredRatio)})`,
      threshold: `>= ${pct(RUN2_GATE_MIN_SCORED_ROW_COVERAGE)} of scored rows matched`,
      detail: 'Most scored Forecast rows must carry governed Teamstate values.',
    },
    {
      dimension: 'nonnull_cell_coverage',
      passed: cellPassed,
      observed: `${evidence.teamstate_cell_nonnull}/${evidence.teamstate_cell_total} (${pct(cellRatio)})`,
      threshold: `>= ${pct(RUN2_GATE_MIN_NONNULL_CELL_COVERAGE)} real governed cells`,
      detail: 'Real governed values must dominate the Teamstate feature matrix (not null/imputed).',
    },
  ];

  const warnings: string[] = [];
  if (joinPresent && evidence.join_diagnostics!.filter((row) => row.matched).length !== evidence.matched_row_count) {
    warnings.push('join_diagnostics matched-row count does not equal matched_row_count; verify the join evidence is complete.');
  }
  for (const position of positionCoverage) {
    if (!position.has_meaningful_coverage) {
      warnings.push(`position ${position.position} has ${position.matched}/${position.scored} matched rows (no meaningful Teamstate coverage); by-position metrics for it would be uninformative.`);
    }
  }
  if (teamPassed && coveredTeams.length < RUN2_GATE_PREFERRED_TEAM_COVERAGE) {
    warnings.push(`team coverage ${coveredTeams.length}/32 meets the minimum but is below the preferred 32/32; missing: ${missingTeams.join(', ')}.`);
  }

  // Fail-closed precedence.
  let status: Run2CoverageGateStatus;
  let decision: Run2CoverageGateDecision;
  const blocking_reasons: string[] = [];
  if (!governanceComplete) {
    status = 'teamstate_coverage_gate_failed_missing_governance';
    decision = 'must_not_rerun';
    blocking_reasons.push('Governance prerequisites incomplete (marker/version/grain/generated_at/source/validation/lineage).');
  } else if (!cutoffComplete) {
    status = 'teamstate_coverage_gate_failed_cutoff';
    decision = 'must_not_rerun';
    blocking_reasons.push('Cutoff prerequisites incomplete or leakage flags not satisfied.');
  } else if (!joinPresent) {
    status = 'teamstate_coverage_gate_failed_join_diagnostics_missing';
    decision = 'fail_closed_incomplete_evidence';
    blocking_reasons.push('Row-level join diagnostics are missing; cannot distinguish coverage gaps from join bugs.');
  } else if (!teamPassed) {
    status = 'teamstate_coverage_gate_failed_team_coverage';
    decision = 'must_not_rerun';
    blocking_reasons.push(`Team coverage ${coveredTeams.length}/32 is below the minimum ${RUN2_GATE_MIN_TEAM_COVERAGE}/32 (missing: ${missingTeams.join(', ')}).`);
  } else if (!scoredPassed) {
    status = 'teamstate_coverage_gate_failed_scored_row_coverage';
    decision = 'must_not_rerun';
    blocking_reasons.push(`Scored-row coverage ${pct(scoredRatio)} is below the ${pct(RUN2_GATE_MIN_SCORED_ROW_COVERAGE)} threshold.`);
  } else if (!cellPassed) {
    status = 'teamstate_coverage_gate_failed_null_dominance';
    decision = 'must_not_rerun';
    blocking_reasons.push(`Non-null cell coverage ${pct(cellRatio)} is below the ${pct(RUN2_GATE_MIN_NONNULL_CELL_COVERAGE)} threshold (null/imputation dominates).`);
  } else {
    status = 'teamstate_coverage_gate_passed';
    decision = 'may_rerun_unchanged_comparison';
  }

  return {
    gate_version: RUN2_COVERAGE_GATE_VERSION,
    status,
    decision,
    team_coverage: teamCoverage,
    scored_row_coverage: scoredCoverage,
    nonnull_cell_coverage: cellCoverage,
    position_coverage: positionCoverage,
    checks,
    blocking_reasons,
    warnings,
    notes: GATE_NOTES,
  };
};

/**
 * The coverage evidence from the first controlled Run 2 (#86/#88/#90): governance and cutoff are
 * present, but coverage is sparse (3/32 teams, 8/38 scored rows, 21/114 non-null cells). Committed as a
 * single source of truth so the benchmark doc and tests agree that this state fails the gate.
 */
export const RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE: Run2TeamstateCoverageEvidence = {
  governance: {
    governance_marker_present: true,
    artifact_version: 'team_week_raw_v0',
    row_grain: 'team_week',
    generated_at: '2026-06-25T19:20:51+00:00',
    source_refs: ['exports/governed/team_week_raw_v0/2024/team_week_raw_v0.jsonl'],
    validation_refs: ['exports/governed/team_week_raw_v0/2024/validation-report.json'],
    lineage_refs: ['exports/governed/team_week_raw_v0/2024/lineage-manifest.json'],
  },
  cutoff: {
    recorded_cutoff_as_of: '2025-03-01T00:00:00.000Z',
    cutoff_before_target_season_start: true,
    no_target_season_leakage: true,
    no_fantasy_result_leakage: true,
  },
  covered_teams: ['BAL', 'CIN', 'PHI'],
  scored_row_count: 38,
  matched_row_count: 8,
  teamstate_feature_columns: ['epaPerPlay', 'successRate', 'redZoneTdRate'],
  teamstate_cell_total: 114,
  teamstate_cell_nonnull: 21,
  null_cells_by_column: { epaPerPlay: 30, successRate: 30, redZoneTdRate: 33 },
  positions: [
    { position: 'QB', matched: 3, scored: 8 },
    { position: 'RB', matched: 3, scored: 10 },
    { position: 'WR', matched: 2, scored: 14 },
    { position: 'TE', matched: 0, scored: 6 },
  ],
  join_diagnostics: [
    { player_id: '00-0034796', player_name: 'Lamar Jackson', position: 'QB', team_2024: 'BAL', teamstate_team_code: 'BAL', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0034844', player_name: 'Derrick Henry', position: 'RB', team_2024: 'BAL', teamstate_team_code: 'BAL', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0036971', player_name: 'Jalen Hurts', position: 'QB', team_2024: 'PHI', teamstate_team_code: 'PHI', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0038542', player_name: 'Saquon Barkley', position: 'RB', team_2024: 'PHI', teamstate_team_code: 'PHI', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0035659', player_name: 'A.J. Brown', position: 'WR', team_2024: 'PHI', teamstate_team_code: 'PHI', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0036389', player_name: 'Joe Burrow', position: 'QB', team_2024: 'CIN', teamstate_team_code: 'CIN', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0035685', player_name: 'Chase Brown', position: 'RB', team_2024: 'CIN', teamstate_team_code: 'CIN', matched: true, source_artifact_ref: 'team_week_raw_v0' },
    { player_id: '00-0036322', player_name: "Ja'Marr Chase", position: 'WR', team_2024: 'CIN', teamstate_team_code: 'CIN', matched: true, source_artifact_ref: 'team_week_raw_v0' },
  ],
};
