/**
 * Mirror-overlap gate for the player-history run path (Forecast #109).
 *
 * Pure, fail-closed evaluator of the regenerated dry-run matrix evidence against the pre-registered
 * #107/PR #108 overlap floors. It decides whether a SEPARATE run-authorizing issue may be opened --
 * nothing more.
 *
 * Decision ceiling: `may_authorize_run_issue`. The decision type has NO `may_run` value: even a fully
 * passing gate only authorizes opening the next issue, which must itself pass review before any arm
 * is run or any metric is computed.
 */

export const PLAYER_HISTORY_MIRROR_OVERLAP_GATE_VERSION = 'player-history-mirror-overlap-gate-v1' as const;

/** Pre-registered floors from #107/PR #108. Lowering any of these requires explicit review. */
export const OVERLAP_MIN_JOINED_ROWS_OVERALL = 200;
export const OVERLAP_MIN_JOINED_ROWS_PER_POSITION = 30;
export const OVERLAP_MIN_JOINED_SHARE = 0.6;
export const OVERLAP_REQUIRED_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE'];

export type PlayerHistoryMirrorOverlapGateDecision =
  | 'may_authorize_run_issue'
  | 'needs_target_population_fix'
  | 'needs_input_mirror_fix'
  | 'needs_overlap_fix'
  | 'needs_gate_reverification'
  | 'must_not_authorize_run_issue';

export type PlayerHistoryMirrorOverlapGateStatus =
  | 'player_history_mirror_overlap_gate_passed'
  | 'player_history_mirror_overlap_gate_blocked';

export interface PlayerHistoryShuffleGroupEvidence {
  position: string;
  feature_bearing_row_count: number;
  derangement_possible: boolean;
}

/** Evidence assembled by the orchestrator from the prior gates + the regenerated dry-run matrix. */
export interface PlayerHistoryMirrorOverlapEvidence {
  /** Decision string from the #99/#100 source-gate re-verification (expected: may_continue_mirror_build). */
  source_gate_reverification_decision: string;
  /** Decision string from the target-population gate (expected: may_continue_to_overlap_gate). */
  target_population_gate_decision: string;
  scored_target_rows: number;
  joined_rows: number;
  joined_rows_by_position: Record<string, number>;
  shuffle_groups: PlayerHistoryShuffleGroupEvidence[];
}

export interface PlayerHistoryMirrorOverlapGateCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface PlayerHistoryMirrorOverlapGateResult {
  gate_version: typeof PLAYER_HISTORY_MIRROR_OVERLAP_GATE_VERSION;
  status: PlayerHistoryMirrorOverlapGateStatus;
  decision: PlayerHistoryMirrorOverlapGateDecision;
  decision_ceiling_note: 'may_authorize_run_issue is the strongest decision this gate can return; it has no may_run value';
  thresholds: {
    min_joined_rows_overall: number;
    min_joined_rows_per_position: number;
    min_joined_share: number;
    required_positions: readonly string[];
  };
  observed: {
    scored_target_rows: number;
    joined_rows: number;
    joined_share: number | null;
    joined_rows_by_position: Record<string, number>;
  };
  checks: PlayerHistoryMirrorOverlapGateCheck[];
  blocking_reasons: string[];
  notes: string[];
}

/**
 * Evaluate the overlap evidence. Pure, deterministic, no I/O. Fail-closed precedence: gate
 * re-verification problems, then target-population problems, then internally-contradictory evidence,
 * then zero overlap (an input-mirror problem), then below-floor overlap.
 */
export const evaluatePlayerHistoryMirrorOverlapGate = (
  evidence: PlayerHistoryMirrorOverlapEvidence,
): PlayerHistoryMirrorOverlapGateResult => {
  const checks: PlayerHistoryMirrorOverlapGateCheck[] = [];
  const blocking: string[] = [];
  const check = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ dimension, expected, observed, passed });
    if (!passed) blocking.push(`${dimension}: expected ${expected}; observed ${observed}`);
  };

  const sourceGateOk = evidence.source_gate_reverification_decision === 'may_continue_mirror_build';
  check('source_gate_reverified', 'may_continue_mirror_build', evidence.source_gate_reverification_decision, sourceGateOk);

  const targetGateOk = evidence.target_population_gate_decision === 'may_continue_to_overlap_gate';
  check('target_population_gate_passed', 'may_continue_to_overlap_gate', evidence.target_population_gate_decision, targetGateOk);

  const countsSane =
    Number.isFinite(evidence.scored_target_rows) &&
    Number.isFinite(evidence.joined_rows) &&
    evidence.scored_target_rows >= 0 &&
    evidence.joined_rows >= 0 &&
    evidence.joined_rows <= evidence.scored_target_rows;
  check(
    'evidence_counts_sane',
    '0 <= joined_rows <= scored_target_rows, both finite',
    `scored=${evidence.scored_target_rows}, joined=${evidence.joined_rows}`,
    countsSane,
  );

  const joinedShare = countsSane && evidence.scored_target_rows > 0 ? evidence.joined_rows / evidence.scored_target_rows : null;

  const zeroOverlap = evidence.joined_rows === 0;
  check('nonzero_overlap', '> 0 joined rows', `${evidence.joined_rows}`, !zeroOverlap);

  const overallOk = evidence.joined_rows >= OVERLAP_MIN_JOINED_ROWS_OVERALL;
  check('min_joined_rows_overall', `>= ${OVERLAP_MIN_JOINED_ROWS_OVERALL}`, `${evidence.joined_rows}`, overallOk);

  let perPositionOk = true;
  for (const position of OVERLAP_REQUIRED_POSITIONS) {
    const joined = evidence.joined_rows_by_position[position] ?? 0;
    const ok = joined >= OVERLAP_MIN_JOINED_ROWS_PER_POSITION;
    if (!ok) perPositionOk = false;
    check(`min_joined_rows_position_${position}`, `>= ${OVERLAP_MIN_JOINED_ROWS_PER_POSITION}`, `${joined}`, ok);
  }

  const shareOk = joinedShare !== null && joinedShare >= OVERLAP_MIN_JOINED_SHARE;
  check(
    'min_joined_share',
    `>= ${OVERLAP_MIN_JOINED_SHARE}`,
    joinedShare === null ? 'undefined (no scored rows)' : joinedShare.toFixed(4),
    shareOk,
  );

  let derangementOk = true;
  for (const group of evidence.shuffle_groups) {
    if (group.feature_bearing_row_count > 0 && !group.derangement_possible) derangementOk = false;
  }
  check(
    'derangement_feasible_for_included_groups',
    'every position group with feature-bearing rows supports a derangement',
    evidence.shuffle_groups
      .map((g) => `${g.position}:${g.feature_bearing_row_count}${g.derangement_possible ? '' : '(!)'}`)
      .join(', ') || 'no groups',
    derangementOk,
  );

  // Fail-closed decision precedence.
  let decision: PlayerHistoryMirrorOverlapGateDecision;
  if (!sourceGateOk) decision = 'needs_gate_reverification';
  else if (!targetGateOk) decision = 'needs_target_population_fix';
  else if (!countsSane) decision = 'must_not_authorize_run_issue';
  else if (zeroOverlap) decision = 'needs_input_mirror_fix';
  else if (!overallOk || !perPositionOk || !shareOk || !derangementOk) decision = 'needs_overlap_fix';
  else decision = 'may_authorize_run_issue';

  return {
    gate_version: PLAYER_HISTORY_MIRROR_OVERLAP_GATE_VERSION,
    status: decision === 'may_authorize_run_issue' ? 'player_history_mirror_overlap_gate_passed' : 'player_history_mirror_overlap_gate_blocked',
    decision,
    decision_ceiling_note: 'may_authorize_run_issue is the strongest decision this gate can return; it has no may_run value',
    thresholds: {
      min_joined_rows_overall: OVERLAP_MIN_JOINED_ROWS_OVERALL,
      min_joined_rows_per_position: OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
      min_joined_share: OVERLAP_MIN_JOINED_SHARE,
      required_positions: OVERLAP_REQUIRED_POSITIONS,
    },
    observed: {
      scored_target_rows: evidence.scored_target_rows,
      joined_rows: evidence.joined_rows,
      joined_share: joinedShare,
      joined_rows_by_position: { ...evidence.joined_rows_by_position },
    },
    checks,
    blocking_reasons: blocking,
    notes: [
      'Gate evaluation only: passing authorizes opening a SEPARATE run-authorizing issue and nothing else. No Forecast run, no Run 3, no model training/tuning/evaluation, no MAE/RMSE/Pearson/rank-correlation, no feature binding, no promotion, no signal claim.',
      'Thresholds are the pre-registered #107/PR #108 floors; lowering any requires explicit review in the run-authorizing issue before any metric is computed.',
    ],
  };
};
