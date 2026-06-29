/**
 * Evaluate the Teamstate Run 2 coverage gate against the full-mode Teamstate coverage evidence
 * (Forecast issue #94).
 *
 * This is a GATE-EVALUATION harness only. It performs NO Run 2 rerun, no three-arm comparison, no
 * model fit/tuning, no feature change, and no null-handling change. It translates the mirrored
 * full-mode Teamstate coverage evidence (emitted by TIBER-Teamstate #72/#73/#74 from the governed
 * TIBER-Data 2024 `team_week_raw_v0` source) into Forecast's gate evidence shape, joins it against the
 * existing Forecast scored population (`seasonalPprSeedSnapshot`), builds complete row-level join
 * diagnostics, and runs {@link evaluateRun2TeamstateCoverageGate}. A pass authorizes only a later,
 * unchanged #86-style rerun issue — it makes no signal claim.
 *
 * All inputs are committed local fixtures; nothing is fetched from the network.
 */

import type { SeasonalPlayerObservation } from '../contracts/seasonalPprBacktest.js';
import { seasonalPprSeedSnapshot } from '../datasets/seasonal/fixtures/seasonalPprSeedSnapshot.js';
import {
  evaluateRun2TeamstateCoverageGate,
  type Run2TeamstateCoverageEvidence,
  type Run2CoverageGateResult,
  type Run2CoverageJoinRow,
} from '../reports/run2TeamstateCoverageGate.js';

/**
 * The Teamstate feature columns Forecast's Run 2 comparison actually binds (a subset of the emitted
 * `forecastInputColumns`). Pressure and the eight fantasy split fields are NOT here — Teamstate marks
 * them deferred/absent and excludes them — so the non-null-cell model counts only contract-included
 * columns. `redZoneTdRate` stays in as a null-aware partial-null column. Keeping this set at the three
 * columns the prior failed evidence used (114 = 38 x 3 cells) makes the result directly comparable.
 */
export const RUN2_TEAMSTATE_FEATURE_COLUMNS = ['epaPerPlay', 'successRate', 'redZoneTdRate'] as const;
export type Run2TeamstateFeatureColumn = (typeof RUN2_TEAMSTATE_FEATURE_COLUMNS)[number];

/** Parsed shape of the mirrored Teamstate coverage evidence (`...coverage_evidence.json`). */
export interface MirroredTeamstateCoverageEvidence {
  source: {
    sourceArtifactPath: string;
    sourceArtifactId: string;
    sha256: string | null;
    governanceStatus: string;
    governanceSource: string;
    provenanceStatus: string;
    validationReportPath: string | null;
    lineageManifestPath: string | null;
    upstreamCoverageAudit: string;
  };
  input: { season: number | null; teamCount: number; rowCount: number; presentTeams: string[]; missingTeams: string[] };
  emitted: { readinessStatus: string; teamCount: number; forecastInputColumns: string[] };
}

/** Parsed shape of the mirrored emitted Forecast Run 2 artifact (`...full.json`) — fields we read. */
export interface MirroredTeamstateFullArtifact {
  artifact: string;
  rowGrain: string;
  governance: { governanceStatus: string; governanceSource: string };
  provenanceStatus: string;
  sourceArtifacts: string[];
  validationReportPath: string | null;
  lineageManifestPath: string | null;
  forecastCutoff: { asOf: string; cutoffBeforeTargetSeason: boolean; sourceGeneratedAt: string | null };
  targetLeakageStatus: string;
  fantasySplitPosture: { status: string };
}

/** Parsed shape of the derived per-team feature availability fixture. */
export interface TeamSeasonFeatureAvailability {
  season: number;
  featureColumns: string[];
  provenance: { governedSourceSha256: string; teamstateMirrorSha256: string; refs: string[] };
  teams: Record<string, Record<string, number>>;
}

export interface Run2CoverageGateEvaluationInputs {
  coverageEvidence: MirroredTeamstateCoverageEvidence;
  fullArtifact: MirroredTeamstateFullArtifact;
  availability: TeamSeasonFeatureAvailability;
  scoredPopulation?: readonly SeasonalPlayerObservation[];
}

export interface Run2CoverageGateEvaluation {
  evidence: Run2TeamstateCoverageEvidence;
  result: Run2CoverageGateResult;
  source_identity: {
    teamstate_source_artifact_path: string;
    governed_source_sha256: string | null;
    upstream_coverage_audit: string;
    teamstate_evidence_present_teams: number;
    teamstate_emitted_forecast_input_columns: number;
    forecast_feature_columns: string[];
  };
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

/** A scored Forecast row is one with a non-null 2025 actual (null actuals exercise the fail-closed path). */
export const scoredForecastPopulation = (
  population: readonly SeasonalPlayerObservation[] = seasonalPprSeedSnapshot,
): readonly SeasonalPlayerObservation[] => population.filter((row) => row.ppr_2025_actual !== null);

/**
 * Translate the mirrored full-mode Teamstate evidence + the existing Forecast scored population into a
 * complete {@link Run2TeamstateCoverageEvidence}, with one row-level join diagnostic per scored row.
 * Honest, no zero-fill: a feature cell counts as non-null only when the row matched a covered team AND
 * that team has a governed (finite) season value for the column in the derived availability table.
 */
export const buildRun2CoverageGateEvidenceFromTeamstate = (
  inputs: Run2CoverageGateEvaluationInputs,
): Run2TeamstateCoverageEvidence => {
  const { coverageEvidence, fullArtifact, availability } = inputs;
  const scored = scoredForecastPopulation(inputs.scoredPopulation);

  const coveredTeams = [...coverageEvidence.input.presentTeams].sort();
  const coveredSet = new Set(coveredTeams);
  const featureColumns = [...RUN2_TEAMSTATE_FEATURE_COLUMNS];

  // The report claims the Run 2 feature columns are a subset of the emitted Forecast input columns and
  // are backed by the derived availability table. Verify that here: a required column that was NOT
  // emitted for Forecast consumption (omitted/renamed) or is absent from the availability fixture is
  // untrusted, so every one of its cells is treated as null (governed value unavailable). It is never
  // counted as non-null off the hard-coded list alone — that would let unemitted columns pass the gate.
  const emittedColumnSet = new Set(coverageEvidence.emitted.forecastInputColumns);
  const availabilityColumnSet = new Set(availability.featureColumns);
  const columnIsTrusted = (column: string): boolean =>
    emittedColumnSet.has(column) && availabilityColumnSet.has(column);

  // Row-level join diagnostics: exactly one record per scored row.
  const joinDiagnostics: Run2CoverageJoinRow[] = scored.map((row) => {
    const matched = coveredSet.has(row.team_2024);
    return {
      player_id: row.player_id,
      player_name: row.player_name,
      position: row.position,
      team_2024: row.team_2024,
      teamstate_team_code: matched ? row.team_2024 : null,
      matched,
      unmatched_reason: matched ? null : `team_2024 ${row.team_2024} is not in the governed Teamstate covered set`,
      source_artifact_ref: coverageEvidence.source.sourceArtifactId,
    };
  });
  const matchedRows = joinDiagnostics.filter((row) => row.matched);

  // Non-null cell accounting over scored rows x feature columns. A cell is non-null iff the row matched
  // a covered team and that team has a finite (governed) season value for the column. Unavailable stays
  // null — never zero-filled.
  const nullCellsByColumn: Record<string, number> = Object.fromEntries(featureColumns.map((c) => [c, 0]));
  let nonNullCells = 0;
  for (const row of scored) {
    const teamAvailability = availability.teams[row.team_2024];
    const matched = coveredSet.has(row.team_2024);
    for (const column of featureColumns) {
      const finiteWeeks = matched && columnIsTrusted(column) && teamAvailability ? (teamAvailability[column] ?? 0) : 0;
      if (finiteWeeks > 0) nonNullCells += 1;
      else nullCellsByColumn[column] += 1;
    }
  }
  const cellTotal = scored.length * featureColumns.length;

  const positions = POSITIONS.map((position) => {
    const scoredAtPosition = scored.filter((row) => row.position === position);
    const matchedAtPosition = scoredAtPosition.filter((row) => coveredSet.has(row.team_2024));
    return { position, matched: matchedAtPosition.length, scored: scoredAtPosition.length };
  });

  // Governance must hold for BOTH the emitted artifact AND the coverage evidence: the covered-team
  // set, source identity, and join source refs all come from `coverageEvidence`, so an ungoverned,
  // sha-less, or stale coverage-evidence mirror must fail the gate even if the full artifact is
  // governed. The pinned governed-source sha must be present (the value match is asserted upstream by
  // the Teamstate checksum-pin guard and the derived availability provenance).
  const fullArtifactGoverned =
    fullArtifact.governance.governanceStatus === 'governed' &&
    fullArtifact.governance.governanceSource === 'explicit_marker' &&
    fullArtifact.provenanceStatus === 'governed_real_data';
  const coverageEvidenceGoverned =
    coverageEvidence.source.governanceStatus === 'governed' &&
    coverageEvidence.source.governanceSource === 'explicit_marker' &&
    coverageEvidence.source.provenanceStatus === 'governed_real_data' &&
    typeof coverageEvidence.source.sha256 === 'string' &&
    coverageEvidence.source.sha256.length > 0;

  return {
    governance: {
      governance_marker_present: fullArtifactGoverned && coverageEvidenceGoverned,
      artifact_version: fullArtifact.artifact,
      row_grain: fullArtifact.rowGrain,
      generated_at: fullArtifact.forecastCutoff.sourceGeneratedAt,
      source_refs: fullArtifact.sourceArtifacts,
      validation_refs: fullArtifact.validationReportPath ? [fullArtifact.validationReportPath] : [],
      lineage_refs: fullArtifact.lineageManifestPath ? [fullArtifact.lineageManifestPath] : [],
    },
    cutoff: {
      recorded_cutoff_as_of: fullArtifact.forecastCutoff.asOf,
      cutoff_before_target_season_start: fullArtifact.forecastCutoff.cutoffBeforeTargetSeason,
      no_target_season_leakage: fullArtifact.targetLeakageStatus === 'no_target_future_leakage_fields_emitted_as_input',
      no_fantasy_result_leakage: fullArtifact.fantasySplitPosture.status === 'absent_excluded_from_forecast_use',
    },
    covered_teams: coveredTeams,
    scored_row_count: scored.length,
    matched_row_count: matchedRows.length,
    teamstate_feature_columns: featureColumns,
    teamstate_cell_total: cellTotal,
    teamstate_cell_nonnull: nonNullCells,
    null_cells_by_column: nullCellsByColumn,
    positions,
    join_diagnostics: joinDiagnostics,
  };
};

/** Build the gate evidence from the mirrored inputs and evaluate the gate. Pure (no I/O). */
export const evaluateRun2CoverageGateFromTeamstate = (
  inputs: Run2CoverageGateEvaluationInputs,
): Run2CoverageGateEvaluation => {
  const evidence = buildRun2CoverageGateEvidenceFromTeamstate(inputs);
  const result = evaluateRun2TeamstateCoverageGate(evidence);
  return {
    evidence,
    result,
    source_identity: {
      teamstate_source_artifact_path: inputs.coverageEvidence.source.sourceArtifactPath,
      governed_source_sha256: inputs.coverageEvidence.source.sha256,
      upstream_coverage_audit: inputs.coverageEvidence.source.upstreamCoverageAudit,
      teamstate_evidence_present_teams: inputs.coverageEvidence.input.presentTeams.length,
      teamstate_emitted_forecast_input_columns: inputs.coverageEvidence.emitted.forecastInputColumns.length,
      forecast_feature_columns: [...RUN2_TEAMSTATE_FEATURE_COLUMNS],
    },
  };
};
