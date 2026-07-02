import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SOURCE_ARTIFACT_STATUS,
  PINNED_SOURCE_ARTIFACT_PATH,
  PINNED_SOURCE_ARTIFACT_REPO,
  PINNED_SOURCE_ARTIFACT_SHA256,
  PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
  evaluatePlayerHistoryTargetPopulationGate,
  type PlayerHistoryOutcomeMirror,
  type PlayerHistoryOutcomeMirrorRow,
} from '../src/public/index.js';

const row = (overrides: Partial<PlayerHistoryOutcomeMirrorRow> & { player_id: string }): PlayerHistoryOutcomeMirrorRow => ({
  player_name: `Player ${overrides.player_id}`,
  position: 'WR',
  season: 2025,
  season_type: 'REG',
  season_ppr: 123.4,
  source_refs: [{ source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z' }],
  identity_confidence: 'source_verified',
  ...overrides,
});

const mirror = (rows: PlayerHistoryOutcomeMirrorRow[], overrides: Partial<PlayerHistoryOutcomeMirror> = {}): PlayerHistoryOutcomeMirror => ({
  kind: 'player_history_run_population_outcome_mirror',
  version: PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
  issue: 'TIBER-Forecast#109',
  governed_source: {
    repo: PINNED_SOURCE_ARTIFACT_REPO,
    sourceArtifactPath: PINNED_SOURCE_ARTIFACT_PATH,
    sha256: PINNED_SOURCE_ARTIFACT_SHA256,
    artifactStatus: EXPECTED_SOURCE_ARTIFACT_STATUS,
  },
  boundary: {
    outcome_layer_only: true,
    rows_carry_no_input_features: true,
    source_artifact_not_promoted: true,
    building_this_mirror_promotes_nothing: true,
    no_forecast_run_authorized_by_this_mirror: true,
  },
  target_season: 2025,
  season_type: 'REG',
  counts: { rows: rows.length, players: new Set(rows.map((r) => r.player_id)).size, by_position: {} },
  rows,
  ...overrides,
});

describe('target-population gate: pass path and ceiling', () => {
  it('passes a well-formed outcome mirror with may_continue_to_overlap_gate (never may_run)', () => {
    const result = evaluatePlayerHistoryTargetPopulationGate(mirror([row({ player_id: 'a1' }), row({ player_id: 'b2' })]));
    expect(result.status).toBe('player_history_target_population_gate_passed');
    expect(result.decision).toBe('may_continue_to_overlap_gate');
    expect(result.blocking_reasons).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('"may_run"');
  });

  it('reports population counts including null-outcome rows', () => {
    const result = evaluatePlayerHistoryTargetPopulationGate(
      mirror([row({ player_id: 'a1' }), row({ player_id: 'b2', season_ppr: null })]),
    );
    expect(result.population_counts.rows).toBe(2);
    expect(result.population_counts.null_outcome_rows).toBe(1);
    expect(result.decision).toBe('may_continue_to_overlap_gate'); // a genuine null outcome is preserved, not a block
  });
});

describe('target-population gate: fail-closed paths', () => {
  const expectBlocked = (m: PlayerHistoryOutcomeMirror, dimension: string) => {
    const result = evaluatePlayerHistoryTargetPopulationGate(m);
    expect(result.decision).toBe('blocked_target_population');
    expect(result.checks.find((c) => c.dimension === dimension)?.passed).toBe(false);
  };

  it('blocks offline_fixture-sourced rows', () => {
    expectBlocked(
      mirror([row({ player_id: 'a1', source_refs: [{ source_name: 'offline_fixture:data/raw/foo.json', observed_at: null }] })]),
      'no_fixture_source_markers',
    );
  });

  it('blocks duplicate player_id + season + season_type grain', () => {
    expectBlocked(mirror([row({ player_id: 'a1' }), row({ player_id: 'a1' })]), 'row_grain_unique');
  });

  it('blocks non-REG rows', () => {
    expectBlocked(mirror([row({ player_id: 'a1', season_type: 'POST' })]), 'season_type_scope');
  });

  it('blocks out-of-scope positions', () => {
    expectBlocked(mirror([row({ player_id: 'a1', position: 'K' })]), 'position_scope');
  });

  it('blocks non-2025 rows', () => {
    expectBlocked(mirror([row({ player_id: 'a1', season: 2024 })]), 'season_scope');
  });

  it('blocks rows without source_refs', () => {
    expectBlocked(mirror([row({ player_id: 'a1', source_refs: [] })]), 'row_level_source_refs_present');
  });

  it('blocks rows whose identity is not source-backed', () => {
    expectBlocked(mirror([row({ player_id: 'a1', identity_confidence: 'provisional' })]), 'identity_confidence_source_backed');
  });

  it('blocks a mirror whose source artifact is not the pinned candidate', () => {
    expectBlocked(
      mirror([row({ player_id: 'a1' })], {
        governed_source: {
          repo: PINNED_SOURCE_ARTIFACT_REPO,
          sourceArtifactPath: PINNED_SOURCE_ARTIFACT_PATH,
          sha256: PINNED_SOURCE_ARTIFACT_SHA256,
          artifactStatus: 'promoted',
        },
      }),
      'candidate_status_acknowledged',
    );
  });

  it('blocks rows carrying forbidden availability fields', () => {
    const bad = { ...row({ player_id: 'a1' }), ownership_status: 'active_roster' } as PlayerHistoryOutcomeMirrorRow;
    expectBlocked(mirror([bad]), 'no_forbidden_availability_fields');
  });

  it('blocks rows carrying input-feature payloads (outcome rows must stay outcome-layer-only)', () => {
    const bad = { ...row({ player_id: 'a1' }), usage_summary: { targets: 10 } } as unknown as PlayerHistoryOutcomeMirrorRow;
    expectBlocked(mirror([bad]), 'no_input_feature_payloads_on_outcome_rows');
  });

  it('blocks an empty population', () => {
    expectBlocked(mirror([]), 'population_nonempty');
  });
});

describe('target-population gate against the REAL committed outcome mirror', () => {
  const real = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json'), 'utf-8'),
  ) as PlayerHistoryOutcomeMirror;

  it('passes with may_continue_to_overlap_gate and the expected 610-player population', () => {
    const result = evaluatePlayerHistoryTargetPopulationGate(real);
    expect(result.status).toBe('player_history_target_population_gate_passed');
    expect(result.decision).toBe('may_continue_to_overlap_gate');
    expect(result.population_counts.players).toBe(610);
    expect(result.population_counts.by_position).toEqual({ QB: 81, RB: 151, WR: 240, TE: 138 });
  });
});
