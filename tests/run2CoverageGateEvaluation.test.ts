import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE,
  RUN2_TEAMSTATE_FEATURE_COLUMNS,
  buildRun2CoverageGateEvidenceFromTeamstate,
  evaluateRun2CoverageGateFromTeamstate,
  evaluateRun2TeamstateCoverageGate,
  scoredForecastPopulation,
  type MirroredTeamstateCoverageEvidence,
  type MirroredTeamstateFullArtifact,
  type Run2CoverageGateEvaluationInputs,
  type TeamSeasonFeatureAvailability,
} from '../src/public/index.js';

const FIXTURE_DIR = path.resolve(process.cwd(), 'data/fixtures/teamstate');
const readJson = <T>(name: string): T => JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf-8')) as T;

const coverageEvidence = readJson<MirroredTeamstateCoverageEvidence>('team_week_raw_v0_2024_forecast_run2.coverage_evidence.json');
const fullArtifact = readJson<MirroredTeamstateFullArtifact>('team_week_raw_v0_2024_forecast_run2.full.json');
const availability = readJson<TeamSeasonFeatureAvailability>('team_season_feature_availability_2024.json');

const baseInputs = (): Run2CoverageGateEvaluationInputs => ({ coverageEvidence, fullArtifact, availability });

describe('Run 2 Teamstate coverage gate evaluation against full-mode evidence (#94)', () => {
  it('accepts the full-mode 32-team evidence and passes the gate', () => {
    const { result } = evaluateRun2CoverageGateFromTeamstate(baseInputs());
    expect(result.status).toBe('teamstate_coverage_gate_passed');
    expect(result.decision).toBe('may_rerun_unchanged_comparison');
    expect(result.team_coverage.covered_count).toBe(32);
    expect(result.team_coverage.missing_teams).toEqual([]);
    expect(result.team_coverage.passed).toBe(true);
  });

  it('builds complete row-level join diagnostics: one record per scored row, matched == matched_row_count', () => {
    const evidence = buildRun2CoverageGateEvidenceFromTeamstate(baseInputs());
    const scored = scoredForecastPopulation();
    expect(evidence.scored_row_count).toBe(scored.length);
    expect(evidence.join_diagnostics).not.toBeNull();
    expect(evidence.join_diagnostics).toHaveLength(evidence.scored_row_count);
    const matchedInDiagnostics = (evidence.join_diagnostics ?? []).filter((row) => row.matched).length;
    expect(matchedInDiagnostics).toBe(evidence.matched_row_count);
    // With all 32 teams covered, every scored row matches.
    expect(evidence.matched_row_count).toBe(evidence.scored_row_count);
    expect(evidence.scored_row_count).toBe(38);
  });

  it('passes scored-row coverage: every scored row maps to a covered team', () => {
    const { result } = evaluateRun2CoverageGateFromTeamstate(baseInputs());
    expect(result.scored_row_coverage.matched).toBe(38);
    expect(result.scored_row_coverage.scored).toBe(38);
    expect(result.scored_row_coverage.ratio).toBe(1);
    expect(result.scored_row_coverage.passed).toBe(true);
  });

  it('excludes pressure and fantasy fields from the non-null-cell model; counts redZoneTdRate honestly', () => {
    const evidence = buildRun2CoverageGateEvidenceFromTeamstate(baseInputs());
    // Feature columns are the three Run 2-bound Teamstate inputs; no pressure / fantasy columns.
    expect(evidence.teamstate_feature_columns).toEqual([...RUN2_TEAMSTATE_FEATURE_COLUMNS]);
    expect(evidence.teamstate_feature_columns).toContain('redZoneTdRate');
    for (const column of evidence.teamstate_feature_columns) {
      expect(column.toLowerCase()).not.toContain('pressure');
      expect(column.toLowerCase()).not.toContain('fantasy');
    }
    // 38 scored x 3 columns = 114 cells; every team has a finite season value for each column, so all
    // cells are non-null (no zero-fill, no imputation needed).
    expect(evidence.teamstate_cell_total).toBe(114);
    expect(evidence.teamstate_cell_nonnull).toBe(114);
    expect(evidence.null_cells_by_column).toEqual({ epaPerPlay: 0, successRate: 0, redZoneTdRate: 0 });
    const { result } = evaluateRun2CoverageGateFromTeamstate(baseInputs());
    expect(result.nonnull_cell_coverage.passed).toBe(true);
  });

  it('reports full position coverage (QB/RB/WR/TE all matched)', () => {
    const { result } = evaluateRun2CoverageGateFromTeamstate(baseInputs());
    const byPosition = Object.fromEntries(result.position_coverage.map((p) => [p.position, p]));
    expect(byPosition.QB.matched).toBe(byPosition.QB.scored);
    expect(byPosition.RB.matched).toBe(byPosition.RB.scored);
    expect(byPosition.WR.matched).toBe(byPosition.WR.scored);
    expect(byPosition.TE.matched).toBe(byPosition.TE.scored);
    expect(result.warnings).toEqual([]);
  });

  it('fails closed when governance markers are missing (before coverage math)', () => {
    const evidence = buildRun2CoverageGateEvidenceFromTeamstate(baseInputs());
    const ungoverned = { ...evidence, governance: { ...evidence.governance, governance_marker_present: false } };
    const result = evaluateRun2TeamstateCoverageGate(ungoverned);
    expect(result.status).toBe('teamstate_coverage_gate_failed_missing_governance');
    expect(result.decision).toBe('must_not_rerun');
  });

  it('fails closed when row-level join diagnostics are incomplete (placeholder rows cannot authorize a pass)', () => {
    const evidence = buildRun2CoverageGateEvidenceFromTeamstate(baseInputs());
    const placeholder = { ...evidence, join_diagnostics: (evidence.join_diagnostics ?? []).slice(0, 1) };
    const result = evaluateRun2TeamstateCoverageGate(placeholder);
    expect(result.status).toBe('teamstate_coverage_gate_failed_join_diagnostics_missing');
    expect(result.decision).toBe('fail_closed_incomplete_evidence');

    const missing = { ...evidence, join_diagnostics: null };
    expect(evaluateRun2TeamstateCoverageGate(missing).decision).toBe('fail_closed_incomplete_evidence');
  });

  it('fails closed when the coverage evidence itself is ungoverned or sha-less (not just the full artifact)', () => {
    // covered_teams / source identity come from coverageEvidence, so an ungoverned mirror must fail
    // even though the full artifact is governed.
    const ungovernedSource = {
      ...baseInputs(),
      coverageEvidence: { ...coverageEvidence, source: { ...coverageEvidence.source, governanceStatus: 'ungoverned' } },
    };
    expect(evaluateRun2CoverageGateFromTeamstate(ungovernedSource).result.status).toBe('teamstate_coverage_gate_failed_missing_governance');

    const shaLessSource = {
      ...baseInputs(),
      coverageEvidence: { ...coverageEvidence, source: { ...coverageEvidence.source, sha256: null } },
    };
    const shaLess = evaluateRun2CoverageGateFromTeamstate(shaLessSource).result;
    expect(shaLess.status).toBe('teamstate_coverage_gate_failed_missing_governance');
    expect(shaLess.decision).toBe('must_not_rerun');
  });

  it('does not count a Run 2 feature column that was not emitted for Forecast consumption', () => {
    // Drop redZoneTdRate from the emitted forecast input columns: its cells must all become null
    // (untrusted), driving non-null coverage below threshold rather than counting off the hard-coded list.
    const emittedWithout = coverageEvidence.emitted.forecastInputColumns.filter((c) => c !== 'redZoneTdRate');
    const inputs = {
      ...baseInputs(),
      coverageEvidence: { ...coverageEvidence, emitted: { ...coverageEvidence.emitted, forecastInputColumns: emittedWithout } },
    };
    const evidence = buildRun2CoverageGateEvidenceFromTeamstate(inputs);
    expect(evidence.null_cells_by_column.redZoneTdRate).toBe(38);
    expect(evidence.teamstate_cell_nonnull).toBe(76);
    const result = evaluateRun2CoverageGateFromTeamstate(inputs).result;
    expect(result.nonnull_cell_coverage.passed).toBe(false);
    expect(result.decision).toBe('must_not_rerun');
  });

  it('the previous 3-team BAL/CIN/PHI evidence shape fails the gate', () => {
    const result = evaluateRun2TeamstateCoverageGate(RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE);
    expect(result.status).toBe('teamstate_coverage_gate_failed_team_coverage');
    expect(result.decision).toBe('must_not_rerun');
    expect(result.team_coverage.covered_count).toBe(3);
    // Sanity contrast: the full-mode evidence passes where the 3-team evidence fails.
    expect(evaluateRun2CoverageGateFromTeamstate(baseInputs()).result.decision).toBe('may_rerun_unchanged_comparison');
  });

  it('is deterministic / reproducible', () => {
    const a = evaluateRun2CoverageGateFromTeamstate(baseInputs()).result;
    const b = evaluateRun2CoverageGateFromTeamstate(baseInputs()).result;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the committed durable report matches a fresh evaluation', () => {
    const committed = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'docs/reports/teamstate-run2-coverage-gate-evaluation-2026-06-29.json'), 'utf-8'),
    ) as { final_status: string; final_decision: string; gate_result: unknown };
    const fresh = evaluateRun2CoverageGateFromTeamstate(baseInputs());
    expect(committed.final_status).toBe(fresh.result.status);
    expect(committed.final_decision).toBe(fresh.result.decision);
    expect(committed.gate_result).toEqual(JSON.parse(JSON.stringify(fresh.result)));
  });
});
