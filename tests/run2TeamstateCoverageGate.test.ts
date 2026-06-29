import { describe, expect, it } from 'vitest';
import {
  NFL_TEAM_CODES_32,
  RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE,
  evaluateRun2TeamstateCoverageGate,
  type Run2TeamstateCoverageEvidence,
} from '../src/public/index.js';

// A fully-passing evidence baseline (32 teams, high row + cell coverage, join present, all positions).
const fullPassEvidence = (): Run2TeamstateCoverageEvidence => ({
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
  covered_teams: [...NFL_TEAM_CODES_32],
  scored_row_count: 38,
  matched_row_count: 35,
  teamstate_feature_columns: ['epaPerPlay', 'successRate', 'redZoneTdRate'],
  teamstate_cell_total: 114,
  teamstate_cell_nonnull: 100,
  null_cells_by_column: { epaPerPlay: 4, successRate: 4, redZoneTdRate: 6 },
  positions: [
    { position: 'QB', matched: 8, scored: 8 },
    { position: 'RB', matched: 9, scored: 10 },
    { position: 'WR', matched: 13, scored: 14 },
    { position: 'TE', matched: 5, scored: 6 },
  ],
  // Complete row-level join evidence: one record per scored row, 35 matched (== matched_row_count).
  join_diagnostics: Array.from({ length: 38 }, (_, i) => ({
    player_id: `p${i}`,
    position: 'WR',
    team_2024: 'BAL',
    teamstate_team_code: i < 35 ? 'BAL' : null,
    matched: i < 35,
    unmatched_reason: i < 35 ? null : 'team not covered',
  })),
});

describe('Run 2 Teamstate coverage gate', () => {
  it('fails the previous 3-team / 8-row / 82%-imputed state (blocks rerun)', () => {
    const result = evaluateRun2TeamstateCoverageGate(RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE);
    expect(result.status).toBe('teamstate_coverage_gate_failed_team_coverage');
    expect(result.decision).toBe('must_not_rerun');
    expect(result.team_coverage.covered_count).toBe(3);
    expect(result.team_coverage.passed).toBe(false);
    expect(result.scored_row_coverage.passed).toBe(false);
    expect(result.nonnull_cell_coverage.passed).toBe(false);
    // The recorded ratios match the audit (≈21.1% rows, ≈18.4% cells).
    expect(result.scored_row_coverage.ratio).toBeCloseTo(8 / 38, 6);
    expect(result.nonnull_cell_coverage.ratio).toBeCloseTo(21 / 114, 6);
    // Missing teams are listed explicitly.
    expect(result.team_coverage.missing_teams).toContain('KC');
    expect(result.team_coverage.missing_teams.length).toBe(29);
  });

  it('fails on missing governance before any coverage math', () => {
    const evidence = fullPassEvidence();
    evidence.governance.governance_marker_present = false;
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_missing_governance');
    expect(result.decision).toBe('must_not_rerun');
  });

  it('fails on missing/invalid cutoff before any coverage math', () => {
    const evidence = fullPassEvidence();
    evidence.cutoff.recorded_cutoff_as_of = null;
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_cutoff');
    expect(result.decision).toBe('must_not_rerun');
  });

  it('fails closed when row-level join diagnostics are missing', () => {
    const evidence = fullPassEvidence();
    evidence.join_diagnostics = null;
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_join_diagnostics_missing');
    expect(result.decision).toBe('fail_closed_incomplete_evidence');
  });

  it('fails closed when join diagnostics are present but incomplete (placeholder rows)', () => {
    // Coverage thresholds all pass, but only one placeholder join record is supplied for 38 scored rows.
    const evidence = fullPassEvidence();
    evidence.join_diagnostics = [
      { player_id: 'p1', position: 'QB', team_2024: 'BAL', teamstate_team_code: 'BAL', matched: true },
    ];
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_join_diagnostics_missing');
    expect(result.decision).toBe('fail_closed_incomplete_evidence');
    expect(result.blocking_reasons.join(' ')).toContain('incomplete');
  });

  it('fails on insufficient team coverage (below 28/32)', () => {
    const evidence = fullPassEvidence();
    evidence.covered_teams = NFL_TEAM_CODES_32.slice(0, 27);
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_team_coverage');
    expect(result.team_coverage.covered_count).toBe(27);
    expect(result.decision).toBe('must_not_rerun');
  });

  it('fails on insufficient scored-row coverage (below 80%)', () => {
    const evidence = fullPassEvidence();
    evidence.matched_row_count = 20; // 20/38 ≈ 52.6%
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_scored_row_coverage');
    expect(result.decision).toBe('must_not_rerun');
  });

  it('fails on null/imputation dominance (non-null cells below 75%)', () => {
    const evidence = fullPassEvidence();
    evidence.teamstate_cell_nonnull = 50; // 50/114 ≈ 43.9%
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_failed_null_dominance');
    expect(result.decision).toBe('must_not_rerun');
  });

  it('passes when all thresholds are met and authorizes only an unchanged rerun', () => {
    const result = evaluateRun2TeamstateCoverageGate(fullPassEvidence());
    expect(result.status).toBe('teamstate_coverage_gate_passed');
    expect(result.decision).toBe('may_rerun_unchanged_comparison');
    expect(result.team_coverage.passed).toBe(true);
    expect(result.scored_row_coverage.passed).toBe(true);
    expect(result.nonnull_cell_coverage.passed).toBe(true);
  });

  it('returns not_evaluated (fail closed) for null evidence', () => {
    const result = evaluateRun2TeamstateCoverageGate(null);
    expect(result.status).toBe('teamstate_coverage_gate_not_evaluated');
    expect(result.decision).toBe('fail_closed_incomplete_evidence');
  });

  it('warns (does not hard-fail) when a scored position has no matched coverage', () => {
    // Previous state has TE 0/6 -> a warning, but the blocking status is team coverage.
    const result = evaluateRun2TeamstateCoverageGate(RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE);
    expect(result.warnings.join(' ')).toContain('position TE');
    const te = result.position_coverage.find((p) => p.position === 'TE');
    expect(te?.has_meaningful_coverage).toBe(false);
  });

  it('warns when team coverage meets the minimum but is below the preferred 32/32', () => {
    const evidence = fullPassEvidence();
    evidence.covered_teams = NFL_TEAM_CODES_32.slice(0, 30); // 30/32: passes min, below preferred
    const result = evaluateRun2TeamstateCoverageGate(evidence);
    expect(result.status).toBe('teamstate_coverage_gate_passed');
    expect(result.warnings.join(' ')).toContain('below the preferred 32/32');
  });

  it('emits no fantasy / product / advice keys', () => {
    const result = evaluateRun2TeamstateCoverageGate(fullPassEvidence());
    const collectKeys = (value: unknown, acc: string[] = []): string[] => {
      if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, acc));
      else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          acc.push(key);
          collectKeys(nested, acc);
        }
      }
      return acc;
    };
    const keys = collectKeys(result).map((key) => key.toLowerCase());
    for (const forbidden of ['ranking', 'startsit', 'start_sit', 'advice', 'trade', 'draft', 'product', 'prediction']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});
