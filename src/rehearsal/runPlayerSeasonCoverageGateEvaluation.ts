/**
 * Evaluate the player_season_coverage_v0 candidate gate against the mirrored TIBER-Data evidence
 * (Forecast issue #99).
 *
 * This is a GATE-EVALUATION harness only. It performs NO Forecast run, no Run 3, no feature binding,
 * no baseline change, no model tuning, and no TIBER-Data/Teamstate change. It translates the mirrored
 * compact evidence (`data/fixtures/tiberData/player_season_coverage_v0_2022_2025.mirror.json`, itself
 * derived from the real, committed TIBER-Data candidate artifact merged in PR #191) into Forecast's
 * gate evidence shape and runs {@link evaluatePlayerSeasonCoverageGate}. A pass authorizes only
 * DESIGNING a future controlled experiment in a separate issue — it makes no signal claim and
 * authorizes no run.
 *
 * All inputs are committed local fixtures; nothing is fetched from the network. This module is pure
 * (no I/O); the CLI script (`scripts/runPlayerSeasonCoverageGateEvaluation.ts`) does the file reading.
 */

import {
  evaluatePlayerSeasonCoverageGate,
  type PlayerSeasonCoverageEvidence,
  type PlayerSeasonCoverageGateResult,
  type PlayerSeasonCoverageProposedCutoffDesign,
  type PlayerSeasonCoverageRowSample,
} from '../reports/playerSeasonCoverageGate.js';

/** Parsed shape of the mirrored evidence file (`...mirror.json`). */
export interface MirroredPlayerSeasonCoverageEvidence {
  kind: string;
  issue: string;
  governed_source: {
    repo: string;
    sourceArtifactPath: string;
    sha256: string;
    schemaPath: string;
    validatorPath: string;
    coverageReportPathMd: string;
    coverageReportPathJson: string;
  };
  refs: string[];
  identity: {
    artifact_id: string;
    status: string;
    generated_at: string;
    row_grain: string;
  };
  provenance: {
    source_refs_present: boolean;
    source_names: string[];
    fixture_or_scaffold_marker_hits: number;
    season_2024_row_count: number;
    season_2024_source_backed: boolean;
  };
  scope: {
    seasons_present: number[];
    season_type_values: string[];
    positions_present: string[];
    full_career_coverage_claimed: boolean;
  };
  grain: {
    total_rows: number;
    duplicate_grain_count: number;
    reg_post_overlap_violations: number;
    required_row_fields_missing_count: number;
  };
  aggregate_stats: {
    rows_by_season: Record<string, number>;
    rows_by_position: Record<string, number>;
    multi_team_row_count: number;
    draft_year_null_count: number;
    season_age_null_count: number;
  };
  row_sample: Array<Record<string, unknown>>;
  proposed_cutoff_design: PlayerSeasonCoverageProposedCutoffDesign | null;
}

export interface PlayerSeasonCoverageGateEvaluation {
  evidence: PlayerSeasonCoverageEvidence;
  result: PlayerSeasonCoverageGateResult;
  source_identity: {
    tiber_data_source_artifact_path: string;
    tiber_data_source_sha256: string;
    schema_path: string;
    validator_path: string;
    coverage_report_path_md: string;
    coverage_report_path_json: string;
    refs: string[];
  };
}

/** Translate a raw mirrored row-sample entry into the gate's typed row shape (defensive on shape). */
const toRowSample = (raw: Record<string, unknown>): PlayerSeasonCoverageRowSample => ({
  // Spread first so unexpected keys (e.g. a forbidden availability field injected into the mirror) are
  // preserved for the gate's semantic check to detect; the "_sample_reason" annotation is
  // documentation-only and is dropped. Every field below is then set explicitly on top so the typed,
  // defaulted values always win over whatever raw shape the mirror happened to carry.
  ...Object.fromEntries(Object.entries(raw).filter(([key]) => key !== '_sample_reason')),
  player_id: (raw.player_id as string) ?? null,
  player_name: (raw.player_name as string) ?? null,
  position: (raw.position as string) ?? null,
  season: (raw.season as number) ?? null,
  season_type: (raw.season_type as string) ?? null,
  source_refs: Array.isArray(raw.source_refs) ? (raw.source_refs as PlayerSeasonCoverageRowSample['source_refs']) : [],
  teams: Array.isArray(raw.teams) ? (raw.teams as string[]) : [],
  primary_team: (raw.primary_team as string | null) ?? null,
  primary_team_rule: (raw.primary_team_rule as string | null) ?? null,
  coverage_status: (raw.coverage_status as string) ?? null,
  missing_fields: Array.isArray(raw.missing_fields) ? (raw.missing_fields as string[]) : [],
  usage_summary: (raw.usage_summary as Record<string, number | string | null>) ?? {},
  birth_date: (raw.birth_date as string | null) ?? null,
  season_age: (raw.season_age as number | null) ?? null,
  draft_year: (raw.draft_year as number | null) ?? null,
  rookie_year: (raw.rookie_year as number | null) ?? null,
  career_year: (raw.career_year as number | null) ?? null,
});

/** Build the gate evidence from the mirrored fixture. Pure (no I/O). */
export const buildPlayerSeasonCoverageEvidenceFromMirror = (
  mirror: MirroredPlayerSeasonCoverageEvidence,
): PlayerSeasonCoverageEvidence => ({
  identity: {
    artifact_id: mirror.identity.artifact_id,
    status: mirror.identity.status,
    generated_at: mirror.identity.generated_at,
    row_grain: mirror.identity.row_grain,
  },
  provenance: {
    source_refs_present: mirror.provenance.source_refs_present,
    source_names: mirror.provenance.source_names,
    fixture_or_scaffold_marker_hits: mirror.provenance.fixture_or_scaffold_marker_hits,
    season_2024_row_count: mirror.provenance.season_2024_row_count,
    season_2024_source_backed: mirror.provenance.season_2024_source_backed,
  },
  scope: {
    seasons_present: mirror.scope.seasons_present,
    season_type_values: mirror.scope.season_type_values,
    positions_present: mirror.scope.positions_present,
    full_career_coverage_claimed: mirror.scope.full_career_coverage_claimed,
  },
  grain: {
    total_rows: mirror.grain.total_rows,
    duplicate_grain_count: mirror.grain.duplicate_grain_count,
    reg_post_overlap_violations: mirror.grain.reg_post_overlap_violations,
    required_row_fields_missing_count: mirror.grain.required_row_fields_missing_count,
  },
  row_sample: mirror.row_sample.map(toRowSample),
  proposed_cutoff_design: mirror.proposed_cutoff_design,
});

/** Build the gate evidence from the mirrored fixture and evaluate the gate. Pure (no I/O). */
export const evaluatePlayerSeasonCoverageGateFromMirror = (
  mirror: MirroredPlayerSeasonCoverageEvidence,
): PlayerSeasonCoverageGateEvaluation => {
  const evidence = buildPlayerSeasonCoverageEvidenceFromMirror(mirror);
  const result = evaluatePlayerSeasonCoverageGate(evidence);
  return {
    evidence,
    result,
    source_identity: {
      tiber_data_source_artifact_path: mirror.governed_source.sourceArtifactPath,
      tiber_data_source_sha256: mirror.governed_source.sha256,
      schema_path: mirror.governed_source.schemaPath,
      validator_path: mirror.governed_source.validatorPath,
      coverage_report_path_md: mirror.governed_source.coverageReportPathMd,
      coverage_report_path_json: mirror.governed_source.coverageReportPathJson,
      refs: mirror.refs,
    },
  };
};
