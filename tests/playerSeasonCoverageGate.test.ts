import { describe, expect, it } from 'vitest';
import {
  evaluatePlayerSeasonCoverageGate,
  type PlayerSeasonCoverageEvidence,
  type PlayerSeasonCoverageRowSample,
} from '../src/public/index.js';

// A representative row sample drawn from the real TIBER-Data artifact (see
// data/fixtures/tiberData/player_season_coverage_v0_2022_2025.mirror.json): a single-team drafted
// player, a multi-team undrafted player (season_age present, draft_year null), and a single_week
// injury-shortened season with a real season_ppr=0.
const rodgers2023 = (): PlayerSeasonCoverageRowSample => ({
  player_id: '00-0023459',
  player_name: 'Aaron Rodgers',
  position: 'QB',
  season: 2023,
  season_type: 'REG',
  source_refs: [
    { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T19:36:52.260432+00:00' },
    { source_name: "nflreadpy.load_player_stats(summary_level='week')", observed_at: '2026-06-30T19:36:52.260432+00:00' },
    { source_name: 'nflreadpy.load_players()', observed_at: '2026-06-30T19:36:52.260432+00:00' },
  ],
  teams: ['NYJ'],
  primary_team: 'NYJ',
  primary_team_rule: null,
  coverage_status: 'single_week',
  missing_fields: ['games_missed', 'red_zone_carries', 'red_zone_targets', 'route_participation', 'routes_run', 'snap_share'],
  usage_summary: { targets: 0, snap_share: null, routes_run: null, red_zone_targets: null },
  birth_date: '1983-12-02',
  season_age: 39.75,
  draft_year: 2005,
  rookie_year: 2005,
  career_year: 19,
});

const shaheed2025MultiTeam = (): PlayerSeasonCoverageRowSample => ({
  player_id: '00-0037545',
  player_name: 'Rashid Shaheed',
  position: 'WR',
  season: 2025,
  season_type: 'REG',
  source_refs: [
    { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T19:36:52.260432+00:00' },
    { source_name: "nflreadpy.load_player_stats(summary_level='week')", observed_at: '2026-06-30T19:36:52.260432+00:00' },
    { source_name: 'nflreadpy.load_players()', observed_at: '2026-06-30T19:36:52.260432+00:00' },
  ],
  teams: ['NO', 'SEA'],
  primary_team: 'NO',
  primary_team_rule: 'most weeks_observed in REG week-level production rows for the season; ties broken by earliest week of first appearance, then alphabetical team code',
  coverage_status: 'full_season',
  missing_fields: ['draft_year', 'games_missed', 'red_zone_carries', 'red_zone_targets', 'route_participation', 'routes_run', 'snap_share'],
  usage_summary: { targets: 92, snap_share: null, routes_run: null, red_zone_targets: null },
  birth_date: '1998-08-31',
  season_age: 27.0,
  draft_year: null,
  rookie_year: 2022,
  career_year: 4,
});

const fullPassEvidence = (): PlayerSeasonCoverageEvidence => ({
  identity: {
    artifact_id: 'player_season_coverage_2022_2025.source_backed',
    status: 'candidate_evidence_artifact_not_promoted',
    generated_at: '2026-06-30T19:36:52.260432+00:00',
    row_grain: 'player_id + season + season_type',
  },
  provenance: {
    source_refs_present: true,
    source_names: [
      "nflreadpy.load_player_stats(summary_level='reg')",
      "nflreadpy.load_player_stats(summary_level='week')",
      'nflreadpy.load_players()',
    ],
    fixture_or_scaffold_marker_hits: 0,
    season_2024_row_count: 588,
    season_2024_source_backed: true,
  },
  scope: {
    seasons_present: [2022, 2023, 2024, 2025],
    season_type_values: ['REG'],
    positions_present: ['QB', 'RB', 'WR', 'TE'],
    full_career_coverage_claimed: false,
  },
  grain: {
    total_rows: 2383,
    duplicate_grain_count: 0,
    reg_post_overlap_violations: 0,
    required_row_fields_missing_count: 0,
  },
  semantic: {
    forbidden_availability_field_count: 0,
    zero_instead_of_null_violation_count: 0,
    fabricated_age_violation_count: 0,
    fabricated_career_year_violation_count: 0,
    multi_team_missing_rule_violation_count: 0,
  },
  row_sample: [rodgers2023(), shaheed2025MultiTeam()],
  proposed_cutoff_design: null,
});

describe('player_season_coverage_v0 candidate gate', () => {
  it('passes on the real representative evidence and returns may_design_experiment (never may_run_model)', () => {
    const result = evaluatePlayerSeasonCoverageGate(fullPassEvidence());
    expect(result.status).toBe('player_season_coverage_gate_passed');
    expect(result.decision).toBe('may_design_experiment');
    // The decision type has no `may_run_model` member at all; assert the literal string too.
    expect(result.decision).not.toBe('may_run_model');
    expect(result.blocking_reasons).toEqual([]);
  });

  it('does not require or falsely infer promoted/governed status', () => {
    const result = evaluatePlayerSeasonCoverageGate(fullPassEvidence());
    const allText = JSON.stringify(result).toLowerCase();
    // The result must never claim the artifact is "governed" or "promoted" as a positive state.
    expect(allText).not.toContain('"status":"governed"');
    expect(allText).toContain('candidate');
    expect(result.notes.join(' ')).toContain('not promoted');
  });

  it('returns needs_artifact_mirror (fail closed) for null evidence', () => {
    const result = evaluatePlayerSeasonCoverageGate(null);
    expect(result.status).toBe('player_season_coverage_gate_not_evaluated');
    expect(result.decision).toBe('needs_artifact_mirror');
  });

  it('fails on a fixture/scaffold source marker', () => {
    const evidence = fullPassEvidence();
    evidence.provenance.fixture_or_scaffold_marker_hits = 3;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_provenance');
    expect(result.decision).toBe('needs_provenance_fix');
  });

  it('fails on missing source refs', () => {
    const evidence = fullPassEvidence();
    evidence.provenance.source_refs_present = false;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_provenance');
    expect(result.decision).toBe('needs_provenance_fix');
  });

  it('fails when 2024 is missing / not source-backed', () => {
    const evidence = fullPassEvidence();
    evidence.provenance.season_2024_row_count = 0;
    evidence.provenance.season_2024_source_backed = false;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_provenance');
    expect(result.decision).toBe('needs_provenance_fix');
  });

  it('fails when an unapproved source name is reported alongside an approved one', () => {
    // Regression test (repo-owner review, PR #100): at-least-one-approved-source is not sufficient --
    // every reported source must be on the allow-list. A manual-override/unknown source slipped in
    // alongside a real nflreadpy source, with zero fixture markers, must still fail provenance.
    const evidence = fullPassEvidence();
    evidence.provenance.source_names = [...evidence.provenance.source_names, 'manual_override_or_unknown_source'];
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_provenance');
    expect(result.decision).toBe('needs_provenance_fix');
    expect(result.blocking_reasons.join(' ')).toContain('manual_override_or_unknown_source');
  });

  it('fails when season_type is implicit/missing at the scope level', () => {
    const evidence = fullPassEvidence();
    evidence.scope.season_type_values = [];
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_scope_window');
    expect(result.decision).toBe('needs_scope_fix');
  });

  it('fails when a row is missing season_type (grain requires it explicit per row)', () => {
    const evidence = fullPassEvidence();
    evidence.row_sample[0].season_type = null;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_grain');
    expect(result.decision).toBe('needs_grain_fix');
  });

  it('fails on a missing expected season (2022-2025 must all be present)', () => {
    const evidence = fullPassEvidence();
    evidence.scope.seasons_present = [2023, 2024, 2025];
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_scope_window');
    expect(result.decision).toBe('needs_scope_fix');
  });

  it('fails on a full-career-coverage overclaim', () => {
    const evidence = fullPassEvidence();
    evidence.scope.full_career_coverage_claimed = true;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_scope_window');
    expect(result.decision).toBe('needs_scope_fix');
  });

  it('fails on a disallowed position outside QB/RB/WR/TE', () => {
    const evidence = fullPassEvidence();
    evidence.scope.positions_present = ['QB', 'RB', 'WR', 'TE', 'DT'];
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_scope_window');
    expect(result.decision).toBe('needs_scope_fix');
  });

  it('fails on duplicate grain rows', () => {
    const evidence = fullPassEvidence();
    evidence.grain.duplicate_grain_count = 2;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_grain');
    expect(result.decision).toBe('needs_grain_fix');
  });

  it('fails when REG+POST overlaps with a separate REG/POST row for the same player-season', () => {
    const evidence = fullPassEvidence();
    evidence.grain.reg_post_overlap_violations = 1;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_grain');
    expect(result.decision).toBe('needs_grain_fix');
  });

  it('fails on a multi-team row missing an explicit primary_team_rule', () => {
    const evidence = fullPassEvidence();
    evidence.row_sample[1].primary_team_rule = null;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
    expect(result.decision).toBe('needs_grain_fix');
  });

  it('fails hard (must_not_consume) when a forbidden active/ownership/status field is present', () => {
    const evidence = fullPassEvidence();
    (evidence.row_sample[0] as unknown as Record<string, unknown>).active_status = 'active';
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
    expect(result.decision).toBe('must_not_consume');
    expect(result.blocking_reasons.join(' ')).toContain('active_status');
  });

  it('fails hard (must_not_consume) when ownership_status is present', () => {
    const evidence = fullPassEvidence();
    (evidence.row_sample[0] as unknown as Record<string, unknown>).ownership_status = 'active_roster';
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.decision).toBe('must_not_consume');
  });

  it('fails hard (must_not_consume) on an artifact-wide forbidden-field count even when the row_sample itself is clean', () => {
    // Regression test (Codex review, PR #100): a 4-row sample out of 2,383 rows cannot prove a
    // violation doesn't exist elsewhere in the artifact. The aggregate count must be authoritative.
    const evidence = fullPassEvidence();
    evidence.semantic.forbidden_availability_field_count = 1;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
    expect(result.decision).toBe('must_not_consume');
    expect(result.blocking_reasons.join(' ')).toContain('Artifact-wide scan');
  });

  it('fails on an artifact-wide zero-vs-null / fabricated-age / missing-primary_team_rule count beyond the sample', () => {
    const evidence = fullPassEvidence();
    evidence.semantic.zero_instead_of_null_violation_count = 2;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
    expect(result.decision).toBe('needs_grain_fix');
    expect(result.blocking_reasons.join(' ')).toContain('Artifact-wide scan reports 2');
  });

  it('fails on a zero-vs-null violation (an always-unavailable usage field coerced to zero)', () => {
    const evidence = fullPassEvidence();
    evidence.row_sample[0].usage_summary = { ...evidence.row_sample[0].usage_summary, snap_share: 0 };
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
    expect(result.decision).toBe('needs_grain_fix');
    expect(result.blocking_reasons.join(' ')).toContain('zero instead of null');
  });

  it('does not flag a legitimate real zero on a non-forbidden field (e.g. targets=0)', () => {
    const evidence = fullPassEvidence();
    evidence.row_sample[0].usage_summary = { ...evidence.row_sample[0].usage_summary, targets: 0 };
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_passed');
  });

  it('fails when season_age is fabricated without a birth_date', () => {
    const evidence = fullPassEvidence();
    evidence.row_sample[0].birth_date = null;
    evidence.row_sample[0].season_age = 39.75;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
    expect(result.blocking_reasons.join(' ')).toContain('fabrication');
  });

  it('fails when career_year is fabricated without a rookie_year', () => {
    const evidence = fullPassEvidence();
    evidence.row_sample[0].rookie_year = null;
    evidence.row_sample[0].career_year = 19;
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_semantic_boundary');
  });

  it('fails on a proposed cutoff design that leaks target-season summaries into an input row', () => {
    const evidence = fullPassEvidence();
    evidence.proposed_cutoff_design = { input_seasons: [2024], target_season: 2025, uses_target_season_summary_as_input: true };
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_cutoff_design');
    expect(result.decision).toBe('needs_cutoff_design');
  });

  it('fails on target-season overlap even when the leakage boolean is left false', () => {
    // Regression test (Codex review, PR #100): target_season appearing in input_seasons is leakage
    // regardless of what uses_target_season_summary_as_input claims -- the boolean alone must not be
    // trusted, since a design could set it false (by mistake or omission) while still overlapping.
    const evidence = fullPassEvidence();
    evidence.proposed_cutoff_design = { input_seasons: [2024, 2025], target_season: 2025, uses_target_season_summary_as_input: false };
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_failed_cutoff_design');
    expect(result.decision).toBe('needs_cutoff_design');
  });

  it('passes cutoff discipline for a design whose input seasons genuinely exclude the target season', () => {
    const evidence = fullPassEvidence();
    evidence.proposed_cutoff_design = { input_seasons: [2022, 2023, 2024], target_season: 2025, uses_target_season_summary_as_input: false };
    const result = evaluatePlayerSeasonCoverageGate(evidence);
    expect(result.status).toBe('player_season_coverage_gate_passed');
    expect(result.decision).toBe('may_design_experiment');
  });

  it('always carries a target-cutoff warning that run authorization remains blocked, even on a full pass', () => {
    const result = evaluatePlayerSeasonCoverageGate(fullPassEvidence());
    expect(result.decision).toBe('may_design_experiment');
    expect(result.warnings.join(' ')).toContain('No Forecast run is authorized');
    expect(result.notes.join(' ')).toContain('SEPARATE experiment-design issue');
  });

  it('emits no fantasy / product / advice keys', () => {
    const result = evaluatePlayerSeasonCoverageGate(fullPassEvidence());
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
    for (const forbidden of ['ranking', 'startsit', 'start_sit', 'advice', 'trade', 'draft_pick_advice', 'product', 'prediction']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});
