import { describe, expect, it } from 'vitest';

import {
  OVERLAP_MIN_JOINED_ROWS_OVERALL,
  OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
  OVERLAP_MIN_JOINED_SHARE,
  evaluatePlayerHistoryMirrorOverlapGate,
  type PlayerHistoryMirrorOverlapEvidence,
} from '../src/public/index.js';

const passingEvidence = (overrides: Partial<PlayerHistoryMirrorOverlapEvidence> = {}): PlayerHistoryMirrorOverlapEvidence => ({
  source_gate_reverification_decision: 'may_continue_mirror_build',
  target_population_gate_decision: 'may_continue_to_overlap_gate',
  scored_target_rows: 610,
  joined_rows: 485,
  joined_rows_by_position: { QB: 66, RB: 115, WR: 189, TE: 115 },
  shuffle_groups: [
    { position: 'QB', feature_bearing_row_count: 66, derangement_possible: true },
    { position: 'RB', feature_bearing_row_count: 115, derangement_possible: true },
    { position: 'WR', feature_bearing_row_count: 189, derangement_possible: true },
    { position: 'TE', feature_bearing_row_count: 115, derangement_possible: true },
  ],
  ...overrides,
});

describe('mirror-overlap gate: pass path and ceiling', () => {
  it('passes fully-passing evidence with may_authorize_run_issue -- and nothing stronger exists', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(passingEvidence());
    expect(result.status).toBe('player_history_mirror_overlap_gate_passed');
    expect(result.decision).toBe('may_authorize_run_issue');
    expect(result.blocking_reasons).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('"may_run"');
    expect(result.decision_ceiling_note).toContain('may_authorize_run_issue is the strongest');
  });

  it('records the pre-registered #107 thresholds verbatim', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(passingEvidence());
    expect(result.thresholds.min_joined_rows_overall).toBe(200);
    expect(result.thresholds.min_joined_rows_per_position).toBe(30);
    expect(result.thresholds.min_joined_share).toBe(0.6);
    expect(OVERLAP_MIN_JOINED_ROWS_OVERALL).toBe(200);
    expect(OVERLAP_MIN_JOINED_ROWS_PER_POSITION).toBe(30);
    expect(OVERLAP_MIN_JOINED_SHARE).toBe(0.6);
  });

  it('emits no metric keys (mae/rmse/pearson/rank_correlation) anywhere in its result', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(passingEvidence());
    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          keys.push(key);
          collect(nested);
        }
      }
    };
    collect(result);
    for (const metric of ['mae', 'rmse', 'pearson', 'rank_correlation']) expect(keys).not.toContain(metric);
  });
});

describe('mirror-overlap gate: fail-closed decision precedence', () => {
  it('blocks 0 joins as needs_input_mirror_fix', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(
      passingEvidence({ joined_rows: 0, joined_rows_by_position: {}, shuffle_groups: [] }),
    );
    expect(result.decision).toBe('needs_input_mirror_fix');
    expect(result.status).toBe('player_history_mirror_overlap_gate_blocked');
  });

  it('blocks below-threshold overall joins as needs_overlap_fix', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(
      passingEvidence({
        scored_target_rows: 240,
        joined_rows: 199,
        joined_rows_by_position: { QB: 40, RB: 53, WR: 53, TE: 53 },
      }),
    );
    expect(result.decision).toBe('needs_overlap_fix');
  });

  it('blocks a below-threshold position even when the overall floor passes', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(
      passingEvidence({ joined_rows_by_position: { QB: 29, RB: 152, WR: 189, TE: 115 } }),
    );
    expect(result.decision).toBe('needs_overlap_fix');
    expect(result.checks.find((c) => c.dimension === 'min_joined_rows_position_QB')?.passed).toBe(false);
  });

  it('blocks below-threshold joined share even with high absolute counts', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(passingEvidence({ scored_target_rows: 1000, joined_rows: 485 }));
    expect(result.decision).toBe('needs_overlap_fix');
    expect(result.observed.joined_share).toBeCloseTo(0.485, 6);
  });

  it('blocks an infeasible derangement group as needs_overlap_fix', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(
      passingEvidence({
        shuffle_groups: [
          { position: 'QB', feature_bearing_row_count: 1, derangement_possible: false },
          { position: 'RB', feature_bearing_row_count: 115, derangement_possible: true },
          { position: 'WR', feature_bearing_row_count: 189, derangement_possible: true },
          { position: 'TE', feature_bearing_row_count: 115, derangement_possible: true },
        ],
      }),
    );
    expect(result.decision).toBe('needs_overlap_fix');
  });

  it('a failed source-gate re-verification takes precedence over everything else', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(
      passingEvidence({ source_gate_reverification_decision: 'blocked_source_artifact', joined_rows: 0 }),
    );
    expect(result.decision).toBe('needs_gate_reverification');
  });

  it('a failed target-population gate takes precedence over overlap problems', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(
      passingEvidence({ target_population_gate_decision: 'blocked_target_population', joined_rows: 10 }),
    );
    expect(result.decision).toBe('needs_target_population_fix');
  });

  it('internally-contradictory evidence (joined > scored) yields must_not_authorize_run_issue', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(passingEvidence({ scored_target_rows: 100, joined_rows: 485 }));
    expect(result.decision).toBe('must_not_authorize_run_issue');
  });
});

describe('mirror-overlap gate against the REAL generated evidence values', () => {
  it('passes the actual #109 numbers (485/610, per-position >= 66) with may_authorize_run_issue', () => {
    const result = evaluatePlayerHistoryMirrorOverlapGate(passingEvidence());
    expect(result.decision).toBe('may_authorize_run_issue');
    expect(result.observed.joined_share).toBeCloseTo(485 / 610, 6);
  });
});
