/**
 * Guardrail tests for the promoted-source mirror refresh (Forecast #119).
 *
 * The refresh regenerates the player-history experiment mirrors from the PROMOTED TIBER-Data
 * artifact and re-runs the population/overlap gates. These tests pin the failure modes required by
 * #119: the #117 preflight must pass first, promoted-sha and candidate-lineage mismatches block,
 * the outcome mirror stays outcome-layer-only 2025, the input mirror structurally excludes 2025 and
 * target-outcome values, prefix provenance is enforced (missing/unapproved/mixed/embedded-token/
 * fixture refs fail), forbidden availability fields fail, unavailable usage fields can never be
 * zero-coerced or populated, the #107 population/overlap floors gate the decision, derangement
 * feasibility is checked, the decision enum stays free of run/metric/production/advice values, the
 * archived candidate mirrors are preserved, and the module imports nothing from production Forecast.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_CANDIDATE_MIRROR_PATHS,
  OVERLAP_FLOOR_DIMENSIONS,
  PREFLIGHT_DIMENSIONS,
  PROMOTED_INPUT_MIRROR_PATH,
  PROMOTED_MIRROR_PROVENANCE_PATH,
  PROMOTED_MIRROR_REFRESH_DECISIONS,
  PROMOTED_OUTCOME_MIRROR_PATH,
  REQUIRED_PREFLIGHT_GATE_DECISION,
  buildPromotedInputMirror,
  buildPromotedOutcomeMirror,
  evaluatePlayerHistoryPromotedMirrorRefreshGate,
  type PromotedInputMirror,
  type PromotedMirrorRefreshGateInput,
  type PromotedOutcomeMirror,
} from '../src/rehearsal/playerHistoryPromotedMirrorRefresh.js';
import {
  PINNED_PROMOTED_ARTIFACT_SHA256,
  PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
  PROMOTION_MERGE_COMMIT,
  type PromotedSourceGateResult,
} from '../src/rehearsal/playerHistoryPromotedSourceGate.js';
import {
  PINNED_SOURCE_ARTIFACT_SHA256,
  type SourceCoverageArtifact,
  type SourceCoverageRecord,
} from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

// ---------------------------------------------------------------------------------------------
// Synthetic source records: a tiny promoted-shaped artifact so each test mutates one property.
// ---------------------------------------------------------------------------------------------

const APPROVED_REF = { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z' };

const synthRecord = (overrides: Partial<SourceCoverageRecord> = {}): SourceCoverageRecord => ({
  player_id: '00-0000001',
  player_name: 'Synthetic Player',
  position: 'RB',
  season: 2024,
  season_type: 'REG',
  identity_confidence: 'source_verified',
  source_refs: [{ ...APPROVED_REF }],
  teams: ['SF'],
  primary_team: 'SF',
  primary_team_rule: null,
  weeks_observed: 17,
  coverage_status: 'full',
  missing_fields: [],
  production_summary: { season_ppr: 210.4, season_ppg: 12.4, games_for_ppg: 17 },
  usage_summary: {
    targets: 60,
    receptions: 48,
    rushing_attempts: 220,
    receiving_air_yards: 120,
    target_share: 0.14,
    air_yards_share: 0.05,
    wopr: 0.4,
    racr: 1.1,
    snap_share: null,
    routes_run: null,
    route_participation: null,
    red_zone_targets: null,
    red_zone_carries: null,
  },
  birth_date: '1999-01-01',
  season_age: 25,
  draft_year: 2021,
  rookie_year: 2021,
  career_year: 4,
  ...overrides,
});

const synthArtifact = (records: SourceCoverageRecord[], status = 'promoted_governed_artifact'): SourceCoverageArtifact => ({
  artifact_id: 'player_season_coverage_v0',
  status,
  seasons: [2022, 2023, 2024, 2025],
  season_type_scope: ['REG'],
  included_positions: ['QB', 'RB', 'TE', 'WR'],
  row_grain: 'player_id + season + season_type',
  records,
});

/** One 2025 outcome player per position plus 2022-2024 history rows for two of them. */
const defaultRecords = (): SourceCoverageRecord[] => [
  synthRecord({ player_id: '00-0000001', season: 2025, position: 'RB', production_summary: { season_ppr: 250.1, season_ppg: 14.7, games_for_ppg: 17 } }),
  synthRecord({ player_id: '00-0000002', season: 2025, position: 'WR' }),
  synthRecord({ player_id: '00-0000003', season: 2025, position: 'QB' }),
  synthRecord({ player_id: '00-0000004', season: 2025, position: 'TE', production_summary: { season_ppr: null, season_ppg: null, games_for_ppg: null } }),
  synthRecord({ player_id: '00-0000001', season: 2024, position: 'RB' }),
  synthRecord({ player_id: '00-0000001', season: 2023, position: 'RB' }),
  synthRecord({ player_id: '00-0000002', season: 2022, position: 'WR' }),
  // A non-population player's history row: must be excluded from the input mirror.
  synthRecord({ player_id: '00-0000099', season: 2024, position: 'WR' }),
  // An off-scope position in 2025: must be excluded from the outcome mirror.
  synthRecord({ player_id: '00-0000098', season: 2025, position: 'K' }),
];

const buildSynthMirrors = (): { outcome: PromotedOutcomeMirror; input: PromotedInputMirror } => {
  const artifact = synthArtifact(defaultRecords());
  const outcome = buildPromotedOutcomeMirror(artifact);
  return { outcome, input: buildPromotedInputMirror(artifact, outcome) };
};

// ---------------------------------------------------------------------------------------------
// Synthetic passing gate input (each failure test mutates exactly one property)
// ---------------------------------------------------------------------------------------------

const passingPreflight = (overrides: Partial<PromotedSourceGateResult> = {}): PromotedSourceGateResult => ({
  gate_version: 'player-history-promoted-source-gate-v1',
  status: 'passed',
  decision: 'may_open_promoted_mirror_refresh_issue',
  decision_rule: 'synthetic',
  checks: [],
  blocking_reasons: [],
  candidate_lineage_intact: true,
  leakage_discipline_for_future_refresh: PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
  candidate_mirror_relationship: 'synthetic',
  ceiling_note: 'synthetic',
  ...overrides,
});

const passingOverlap = (): PromotedMirrorRefreshGateInput['overlap'] => ({
  scored_target_rows: 600,
  joined_rows: 480,
  joined_rows_by_position: { QB: 66, RB: 115, WR: 184, TE: 115 },
  shuffle_groups: [
    { position: 'QB', feature_bearing_row_count: 66, derangement_possible: true },
    { position: 'RB', feature_bearing_row_count: 115, derangement_possible: true },
    { position: 'WR', feature_bearing_row_count: 184, derangement_possible: true },
    { position: 'TE', feature_bearing_row_count: 115, derangement_possible: true },
  ],
});

const passingGateInput = (): PromotedMirrorRefreshGateInput => {
  const { outcome, input } = buildSynthMirrors();
  return {
    preflightGateResult: passingPreflight(),
    actualPromotedArtifactSha256: PINNED_PROMOTED_ARTIFACT_SHA256,
    manifestCandidateSha256: PINNED_SOURCE_ARTIFACT_SHA256,
    outcomeMirror: outcome,
    inputMirror: input,
    overlap: passingOverlap(),
  };
};

const evaluate = (mutate?: (input: PromotedMirrorRefreshGateInput) => void) => {
  const input = passingGateInput();
  mutate?.(input);
  return evaluatePlayerHistoryPromotedMirrorRefreshGate(input);
};

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

describe('promoted mirror builders: scope, layering, null semantics', () => {
  it('the outcome mirror contains only 2025 REG QB/RB/WR/TE rows, outcome-layer fields only', () => {
    const { outcome } = buildSynthMirrors();
    expect(outcome.kind).toBe('player_history_promoted_outcome_mirror');
    expect(outcome.rows).toHaveLength(4);
    expect(outcome.rows.every((r) => r.season === 2025 && r.season_type === 'REG')).toBe(true);
    expect(outcome.rows.map((r) => r.position).sort()).toEqual(['QB', 'RB', 'TE', 'WR']);
    // Outcome-layer-only rows: identity + outcome + provenance, never input-feature payloads.
    for (const row of outcome.rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['identity_confidence', 'player_id', 'player_name', 'position', 'season', 'season_ppr', 'season_type', 'source_refs'].sort(),
      );
    }
    // Null outcomes are preserved as null (documented unavailable), never coerced.
    expect(outcome.rows.find((r) => r.player_id === '00-0000004')?.season_ppr).toBeNull();
    expect(outcome.governed_source.sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(outcome.governed_source.promotionMergeCommit).toBe(PROMOTION_MERGE_COMMIT);
  });

  it('the input mirror excludes every 2025 record and every non-population player, and documents no-history players', () => {
    const { outcome, input } = buildSynthMirrors();
    expect(input.kind).toBe('player_history_promoted_input_mirror');
    expect(input.rows.every((r) => [2022, 2023, 2024].includes(r.season))).toBe(true);
    expect(input.rows.some((r) => r.player_id === '00-0000099')).toBe(false);
    expect(input.counts.rows).toBe(3);
    expect(input.counts.players_with_history).toBe(2);
    // Outcome players without pre-target rows are documented absence, not failures.
    expect(input.no_history_players.map((p) => p.player_id).sort()).toEqual(['00-0000003', '00-0000004']);
    expect(input.no_history_players.every((p) => p.note === 'no_2022_2024_source_rows_documented_absence_not_a_mirror_failure')).toBe(true);
    expect(input.counts.outcome_players_without_history).toBe(outcome.rows.length - input.counts.players_with_history);
    expect(input.input_window.target_season_excluded).toBe(2025);
  });

  it('unavailable usage fields pass through as null, never zero-coerced; real values are preserved verbatim', () => {
    const { input } = buildSynthMirrors();
    for (const row of input.rows) {
      expect(row.usage_summary.snap_share).toBeNull();
      expect(row.usage_summary.routes_run).toBeNull();
      expect(row.usage_summary.route_participation).toBeNull();
      expect(row.usage_summary.red_zone_targets).toBeNull();
      expect(row.usage_summary.red_zone_carries).toBeNull();
      expect(row.usage_summary.targets).toBe(60);
    }
  });

  it('both mirrors stamp the candidate->promoted source lineage and preserve the archived candidate mirror paths', () => {
    const { outcome, input } = buildSynthMirrors();
    for (const mirror of [outcome, input]) {
      expect(mirror.source_lineage.refreshed_from_source).toBe('candidate_pin');
      expect(mirror.source_lineage.refreshed_to_source).toBe('promoted_governed_artifact');
      expect(mirror.source_lineage.prior_candidate_sha256).toBe(PINNED_SOURCE_ARTIFACT_SHA256);
      expect(mirror.source_lineage.archived_candidate_mirrors_preserved_at).toEqual(ARCHIVED_CANDIDATE_MIRROR_PATHS);
      expect(mirror.source_lineage.archived_candidate_mirrors_not_overwritten).toBe(true);
    }
    // The promoted mirror paths must never collide with an archived candidate path.
    for (const promotedPath of [PROMOTED_OUTCOME_MIRROR_PATH, PROMOTED_INPUT_MIRROR_PATH, PROMOTED_MIRROR_PROVENANCE_PATH]) {
      expect(ARCHIVED_CANDIDATE_MIRROR_PATHS).not.toContain(promotedPath);
    }
  });

  it('a forbidden availability/ownership field on a source record fails both builds closed', () => {
    for (const key of ['active_status', 'ownership_status', 'roster_status', 'active_roster_status']) {
      const records = defaultRecords();
      records[0] = synthRecord({ ...records[0], [key]: 'ACT' } as Partial<SourceCoverageRecord>);
      expect(() => buildPromotedOutcomeMirror(synthArtifact(records))).toThrow(/forbidden availability field/);
    }
    const records = defaultRecords();
    records[4] = synthRecord({ ...records[4], roster_status: 'ACT' } as Partial<SourceCoverageRecord>);
    const artifact = synthArtifact(records);
    const outcome = buildPromotedOutcomeMirror(artifact);
    expect(() => buildPromotedInputMirror(artifact, outcome)).toThrow(/forbidden availability field/);
  });

  it('missing, unapproved, mixed, embedded-token, and fixture-marked source refs fail the build closed', () => {
    const badRefSets: Array<{ label: string; refs: SourceCoverageRecord['source_refs'] }> = [
      { label: 'missing', refs: [] },
      { label: 'unapproved', refs: [{ source_name: 'espn_scrape_v2', observed_at: '2026-06-30T00:00:00Z' }] },
      { label: 'mixed', refs: [{ ...APPROVED_REF }, { source_name: 'manual_entry', observed_at: '2026-06-30T00:00:00Z' }] },
      // Embedded approved token must not pass the PREFIX allow-list.
      { label: 'embedded-token', refs: [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: '2026-06-30T00:00:00Z' }] },
      { label: 'fixture-marked', refs: [{ source_name: "nflreadpy.load_player_stats(summary_level='reg')#offline_fixture", observed_at: '2026-06-30T00:00:00Z' }] },
    ];
    for (const { refs } of badRefSets) {
      const records = defaultRecords();
      records[0] = synthRecord({ ...records[0], source_refs: refs });
      expect(() => buildPromotedOutcomeMirror(synthArtifact(records))).toThrow(/fails closed/);
    }
  });

  it('a duplicate player_id + season + season_type grain fails the build closed', () => {
    const records = [...defaultRecords(), synthRecord({ player_id: '00-0000001', season: 2025, position: 'RB' })];
    expect(() => buildPromotedOutcomeMirror(synthArtifact(records))).toThrow(/duplicate outcome grain/);
    const inputDupes = [...defaultRecords(), synthRecord({ player_id: '00-0000001', season: 2024, position: 'RB' })];
    const artifact = synthArtifact(inputDupes);
    const outcome = buildPromotedOutcomeMirror(artifact);
    expect(() => buildPromotedInputMirror(artifact, outcome)).toThrow(/duplicate input grain/);
  });
});

// ---------------------------------------------------------------------------------------------
// Refresh gate: preflight fail-closed
// ---------------------------------------------------------------------------------------------

describe('refresh gate: #117 preflight must pass before any refresh is usable', () => {
  it('the synthetic baseline passes with the ceiling decision', () => {
    const result = evaluate();
    expect(result.status).toBe('passed');
    expect(result.decision).toBe('may_open_promoted_controlled_rerun_issue');
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.blocking_reasons).toEqual([]);
  });

  it('a failed preflight gate blocks the refresh', () => {
    const result = evaluate((input) => {
      input.preflightGateResult = passingPreflight({ status: 'failed', decision: 'blocked_promoted_artifact_gate_failed' });
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.preflight_passed).toBe(false);
  });

  it('a preflight decision other than may_open_promoted_mirror_refresh_issue blocks, even with status passed', () => {
    const result = evaluate((input) => {
      input.preflightGateResult = passingPreflight({
        decision: 'may_continue_using_candidate_mirrors_for_archived_experiment_only',
      });
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain(REQUIRED_PREFLIGHT_GATE_DECISION);
  });

  it('a promoted artifact sha mismatch blocks', () => {
    const result = evaluate((input) => {
      input.actualPromotedArtifactSha256 = 'f'.repeat(64);
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('preflight_promoted_sha_matches_pin');
  });

  it('a source-candidate lineage sha mismatch blocks', () => {
    const result = evaluate((input) => {
      input.manifestCandidateSha256 = 'e'.repeat(64);
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('preflight_candidate_lineage_sha_matches_pin');
  });

  it('missing or false leakage-discipline fields block', () => {
    const result = evaluate((input) => {
      input.preflightGateResult = passingPreflight({
        leakage_discipline_for_future_refresh: {
          ...PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
          input_seasons_for_2025_prediction_remain_2022_2024_only: false,
        } as unknown as typeof PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
      });
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('preflight_leakage_discipline_recorded_true');
  });

  it('malformed gate input is invalid and unusable, not merely blocked', () => {
    const result = evaluatePlayerHistoryPromotedMirrorRefreshGate({});
    expect(result.status).toBe('invalid');
    expect(result.decision).toBe('promoted_mirror_refresh_invalid_must_not_use');
    expect(result.checks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Refresh gate: mirror integrity and leakage discipline
// ---------------------------------------------------------------------------------------------

describe('refresh gate: leakage, provenance, and null-semantics enforcement on the refreshed mirrors', () => {
  it('an injected 2025 row in the input mirror blocks (no target-season input leakage)', () => {
    const result = evaluate((input) => {
      input.inputMirror.rows.push({ ...input.inputMirror.rows[0], season: 2025 });
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('input_no_2025_rows');
  });

  it('a target-outcome value copied onto an input row blocks', () => {
    const result = evaluate((input) => {
      (input.inputMirror.rows[0] as Record<string, unknown>).ppr_2025_actual = 250.1;
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('input_no_target_outcome_values');
  });

  it('an off-scope outcome row (wrong season) blocks', () => {
    const result = evaluate((input) => {
      input.outcomeMirror.rows[0] = { ...input.outcomeMirror.rows[0], season: 2024 };
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('outcome_rows_2025_reg_approved_positions_only');
  });

  it('an input row for a player outside the outcome population blocks', () => {
    const result = evaluate((input) => {
      input.inputMirror.rows.push({ ...input.inputMirror.rows[0], player_id: '00-0009999' });
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('input_players_subset_of_outcome_population');
  });

  it('missing, unapproved, mixed, and embedded-token source refs on mirror rows block (prefix, never substring)', () => {
    for (const refs of [
      [],
      [{ source_name: 'espn_scrape_v2', observed_at: null }],
      [APPROVED_REF, { source_name: 'manual_entry', observed_at: null }],
      [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: null }],
    ]) {
      const result = evaluate((input) => {
        input.inputMirror.rows[0] = { ...input.inputMirror.rows[0], source_refs: refs };
      });
      expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
      expect(result.blocking_reasons.join(' ')).toMatch(/mirror_source_refs_present|mirror_source_refs_prefix_approved/);
    }
  });

  it('fixture/scaffold/offline_fixture markers in mirror provenance block', () => {
    for (const marker of ['offline_fixture', 'fixture_demo', 'scaffold']) {
      const result = evaluate((input) => {
        input.outcomeMirror.rows[0] = {
          ...input.outcomeMirror.rows[0],
          source_refs: [{ source_name: `nflreadpy.load_players() ${marker}`, observed_at: null }],
        };
      });
      expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
      expect(result.blocking_reasons.join(' ')).toContain('mirror_no_fixture_scaffold_markers');
    }
  });

  it('a forbidden availability/ownership field on any mirror row blocks', () => {
    const result = evaluate((input) => {
      (input.inputMirror.rows[0] as Record<string, unknown>).active_status = 'ACT';
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('mirror_no_forbidden_availability_fields');
  });

  it('a zero-coerced unavailable usage field blocks; a populated one blocks too', () => {
    for (const value of [0, 0.55]) {
      const result = evaluate((input) => {
        input.inputMirror.rows[0] = {
          ...input.inputMirror.rows[0],
          usage_summary: { ...input.inputMirror.rows[0].usage_summary, snap_share: value },
        };
      });
      expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
      expect(result.blocking_reasons.join(' ')).toContain('mirror_unavailable_usage_fields_remain_null');
    }
  });

  it('internally-contradictory overlap evidence (joined > scored) blocks outright, never design-only', () => {
    const result = evaluate((input) => {
      input.overlap.joined_rows = input.overlap.scored_target_rows + 1;
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_counts_sane');
  });
});

// ---------------------------------------------------------------------------------------------
// Refresh gate: population/overlap floors -> design-only
// ---------------------------------------------------------------------------------------------

describe('refresh gate: #107 population/overlap floors', () => {
  it('joined rows below the overall floor downgrade to design-only (mirrors intact, rerun not authorized)', () => {
    const result = evaluate((input) => {
      input.overlap.joined_rows = 150;
      input.overlap.joined_rows_by_position = { QB: 40, RB: 40, WR: 35, TE: 35 };
    });
    expect(result.status).toBe('design_only');
    expect(result.decision).toBe('may_use_promoted_mirrors_for_design_only');
    expect(result.mirror_integrity_passed).toBe(true);
    expect(result.overlap_floors_passed).toBe(false);
  });

  it('a single position below the per-position floor downgrades to design-only', () => {
    const result = evaluate((input) => {
      input.overlap.joined_rows_by_position = { ...input.overlap.joined_rows_by_position, QB: 29 };
    });
    expect(result.decision).toBe('may_use_promoted_mirrors_for_design_only');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_min_joined_rows_position_QB');
  });

  it('a joined share below 60% downgrades to design-only', () => {
    const result = evaluate((input) => {
      input.overlap.scored_target_rows = 1000;
      input.overlap.joined_rows = 480;
    });
    expect(result.decision).toBe('may_use_promoted_mirrors_for_design_only');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_min_joined_share');
  });

  it('an infeasible derangement in any feature-bearing position group downgrades to design-only', () => {
    const result = evaluate((input) => {
      input.overlap.shuffle_groups[0] = { position: 'QB', feature_bearing_row_count: 1, derangement_possible: false };
    });
    expect(result.decision).toBe('may_use_promoted_mirrors_for_design_only');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_derangement_feasible_by_position');
  });

  it('a preflight failure takes precedence over floor failures: blocked, not design-only', () => {
    const result = evaluate((input) => {
      input.preflightGateResult = passingPreflight({ status: 'failed', decision: 'blocked_promoted_artifact_gate_failed' });
      input.overlap.joined_rows = 10;
    });
    expect(result.decision).toBe('blocked_promoted_mirror_refresh_gate_failed');
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity and import isolation
// ---------------------------------------------------------------------------------------------

describe('refresh: decision-enum purity and production isolation', () => {
  it('the decision enum contains exactly the four #119 values and no production/binding/run/metric/advice value', () => {
    expect([...PROMOTED_MIRROR_REFRESH_DECISIONS]).toEqual([
      'may_open_promoted_controlled_rerun_issue',
      'may_use_promoted_mirrors_for_design_only',
      'blocked_promoted_mirror_refresh_gate_failed',
      'promoted_mirror_refresh_invalid_must_not_use',
    ]);
    for (const decision of PROMOTED_MIRROR_REFRESH_DECISIONS) {
      for (const forbidden of ['may_run', 'bind', 'production', 'metric', 'advice', 'ranking', 'signal', 'promote_']) {
        expect(decision).not.toContain(forbidden);
      }
    }
  });

  it('the preflight and floor dimension lists partition as designed (counts_sane is NOT a floor)', () => {
    expect(PREFLIGHT_DIMENSIONS.length).toBe(5);
    expect(OVERLAP_FLOOR_DIMENSIONS).not.toContain('overlap_counts_sane');
    expect(OVERLAP_FLOOR_DIMENSIONS).toContain('overlap_min_joined_share');
    expect(OVERLAP_FLOOR_DIMENSIONS).toContain('overlap_derangement_feasible_by_position');
  });

  it('every gate result restates the leakage discipline and the archived-candidate preservation statement', () => {
    for (const result of [evaluate(), evaluatePlayerHistoryPromotedMirrorRefreshGate({})]) {
      expect(result.leakage_discipline).toEqual(PROMOTED_SOURCE_LEAKAGE_DISCIPLINE);
      expect(result.archived_candidate_mirror_statement).toContain('preserved unchanged');
      expect(result.ceiling_note).toContain('does not itself authorize the rerun');
    }
  });

  it('refresh module and script import nothing from production Forecast (no seasonalPprModel, server, routes, scoring, board, fusion, services)', () => {
    for (const rel of ['src/rehearsal/playerHistoryPromotedMirrorRefresh.ts', 'scripts/runPlayerHistoryPromotedMirrorRefresh.ts']) {
      const source = readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      // Multi-line import blocks end with `} from '...'`; matching every `from '...'` line covers both forms.
      const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
      expect(importLines.length).toBeGreaterThan(0);
      for (const line of importLines) {
        expect(line).not.toMatch(/seasonalPprModel|\/server|\/routes|\/scoring|\/board|\/fusion|\/services/);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Committed refreshed artifacts (the real #119 outputs)
// ---------------------------------------------------------------------------------------------

describe('committed promoted-source mirrors and reports', () => {
  const outcome = readRepoJson<PromotedOutcomeMirror>(PROMOTED_OUTCOME_MIRROR_PATH);
  const inputMirror = readRepoJson<PromotedInputMirror>(PROMOTED_INPUT_MIRROR_PATH);
  const provenance = readRepoJson<{
    promoted_source: { promotedArtifactSha256Pinned: string; promotedArtifactSha256Actual: string; sourceCandidateSha256: string; promotionMergeCommit: string };
    preflight_gate: { evidence_path: string; committed_decision: string; rerun_decision: string };
    mirrors: { outcome_mirror: { path: string; sha256: string }; input_mirror: { path: string; sha256: string } };
    archived_candidate_mirrors: { preserved_unchanged_at: string[]; not_overwritten_by_this_refresh: boolean };
    refresh_gate_decision: string;
    boundary_statements: Record<string, boolean>;
  }>(PROMOTED_MIRROR_PROVENANCE_PATH);

  it('the committed outcome mirror is the full 610-player 2025 REG population tied to the promoted pin', () => {
    expect(outcome.kind).toBe('player_history_promoted_outcome_mirror');
    expect(outcome.governed_source.sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(outcome.counts).toEqual({ rows: 610, players: 610, by_position: { QB: 81, TE: 138, WR: 240, RB: 151 } });
    expect(outcome.rows).toHaveLength(610);
    expect(outcome.rows.every((r) => r.season === 2025 && r.season_type === 'REG')).toBe(true);
  });

  it('the committed input mirror has zero 2025 rows and preserves null usage semantics on every row', () => {
    expect(inputMirror.kind).toBe('player_history_promoted_input_mirror');
    expect(inputMirror.governed_source.sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(inputMirror.counts.rows).toBe(1145);
    expect(inputMirror.rows.every((r) => r.season !== 2025 && [2022, 2023, 2024].includes(r.season))).toBe(true);
    expect(
      inputMirror.rows.every(
        (r) =>
          r.usage_summary.snap_share === null &&
          r.usage_summary.routes_run === null &&
          r.usage_summary.route_participation === null &&
          r.usage_summary.red_zone_targets === null &&
          r.usage_summary.red_zone_carries === null,
      ),
    ).toBe(true);
  });

  it('every committed mirror row carries prefix-approved provenance', () => {
    const approved = ["nflreadpy.load_player_stats(", 'nflreadpy.load_players('];
    for (const rows of [outcome.rows, inputMirror.rows]) {
      expect(rows.every((r) => r.source_refs.length > 0 && r.source_refs.every((ref) => approved.some((p) => ref.source_name.startsWith(p))))).toBe(true);
    }
  });

  it('the provenance companion ties the mirrors to the promoted artifact, manifest commit, candidate lineage, and #117 gate', () => {
    expect(provenance.promoted_source.promotedArtifactSha256Pinned).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(provenance.promoted_source.promotedArtifactSha256Actual).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(provenance.promoted_source.sourceCandidateSha256).toBe(PINNED_SOURCE_ARTIFACT_SHA256);
    expect(provenance.promoted_source.promotionMergeCommit).toBe(PROMOTION_MERGE_COMMIT);
    expect(provenance.preflight_gate.committed_decision).toBe(REQUIRED_PREFLIGHT_GATE_DECISION);
    expect(provenance.preflight_gate.rerun_decision).toBe(REQUIRED_PREFLIGHT_GATE_DECISION);
    expect(provenance.refresh_gate_decision).toBe('may_open_promoted_controlled_rerun_issue');
    expect(PROMOTED_MIRROR_REFRESH_DECISIONS).toContain(provenance.refresh_gate_decision);
    expect(provenance.boundary_statements.mirror_refresh_only_not_a_model_run).toBe(true);
    expect(provenance.boundary_statements.no_metrics_computed).toBe(true);
    expect(provenance.boundary_statements.no_production_binding_authorized).toBe(true);
  });

  it('the provenance-recorded mirror sha256s match the committed mirror bytes', () => {
    for (const mirror of [provenance.mirrors.outcome_mirror, provenance.mirrors.input_mirror]) {
      const actual = createHash('sha256').update(readFileSync(path.join(REPO_ROOT, mirror.path))).digest('hex');
      expect(actual).toBe(mirror.sha256);
    }
  });

  it('the archived candidate mirrors still exist unchanged as candidate-pinned artifacts', () => {
    expect(provenance.archived_candidate_mirrors.preserved_unchanged_at).toEqual([...ARCHIVED_CANDIDATE_MIRROR_PATHS]);
    expect(provenance.archived_candidate_mirrors.not_overwritten_by_this_refresh).toBe(true);
    const archivedOutcome = readRepoJson<{ kind: string; governed_source: { sha256: string } }>(ARCHIVED_CANDIDATE_MIRROR_PATHS[0]);
    expect(archivedOutcome.kind).toBe('player_history_run_population_outcome_mirror');
    expect(archivedOutcome.governed_source.sha256).toBe(PINNED_SOURCE_ARTIFACT_SHA256);
  });

  it('the committed overlap-gate report passed with the ceiling decision and all checks green', () => {
    const report = readRepoJson<{ gate_result: { status: string; decision: string; checks: Array<{ passed: boolean }> } }>(
      'docs/reports/player-history-promoted-mirror-overlap-gate-2026-07-04.json',
    );
    expect(report.gate_result.status).toBe('passed');
    expect(report.gate_result.decision).toBe('may_open_promoted_controlled_rerun_issue');
    expect(report.gate_result.checks.every((c) => c.passed)).toBe(true);
  });
});
