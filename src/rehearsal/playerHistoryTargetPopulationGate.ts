/**
 * Target-population gate for the player-history run path (Forecast #109).
 *
 * Pure, fail-closed evaluator over the generated 2025 outcome mirror
 * (`buildPlayerHistoryOutcomeMirror`). It verifies the outcome mirror is source-backed and scoped
 * exactly as #107/PR #108 decided, without running anything.
 *
 * Decision ceiling: `may_continue_to_overlap_gate`. This gate can NEVER emit `may_run` -- its type
 * has no such value. Passing it authorizes only the next gate in the stack (the mirror-overlap gate),
 * never a run, never feature binding, never promotion of the candidate artifact.
 */

import {
  PLAYER_HISTORY_APPROVED_POSITIONS,
  PLAYER_HISTORY_APPROVED_SEASON_TYPE,
} from './playerHistoryFeatureScaffold.js';
import {
  EXPECTED_SOURCE_ARTIFACT_STATUS,
  PINNED_SOURCE_ARTIFACT_SHA256,
  RUN_POPULATION_TARGET_SEASON,
  type PlayerHistoryOutcomeMirror,
} from './playerHistoryRunPopulationMirrors.js';

export const PLAYER_HISTORY_TARGET_POPULATION_GATE_VERSION = 'player-history-target-population-gate-v1' as const;

/** Identity confidences the gate accepts as source-backed. */
export const ACCEPTED_IDENTITY_CONFIDENCES: readonly string[] = ['source_verified'];

/** Source markers that immediately fail the gate: fixture-backed rows are not a real population. */
export const FORBIDDEN_SOURCE_MARKERS: readonly string[] = ['offline_fixture', 'scaffold', 'fixture'];

const FORBIDDEN_AVAILABILITY_KEYS: readonly string[] = [
  'active_status',
  'ownership_status',
  'roster_status',
  'active_roster_status',
];

export type PlayerHistoryTargetPopulationGateDecision = 'may_continue_to_overlap_gate' | 'blocked_target_population';

export type PlayerHistoryTargetPopulationGateStatus =
  | 'player_history_target_population_gate_passed'
  | 'player_history_target_population_gate_blocked';

export interface PlayerHistoryTargetPopulationGateCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface PlayerHistoryTargetPopulationGateResult {
  gate_version: typeof PLAYER_HISTORY_TARGET_POPULATION_GATE_VERSION;
  status: PlayerHistoryTargetPopulationGateStatus;
  decision: PlayerHistoryTargetPopulationGateDecision;
  decision_ceiling_note: 'may_continue_to_overlap_gate is the strongest decision this gate can return; it has no may_run value';
  checks: PlayerHistoryTargetPopulationGateCheck[];
  blocking_reasons: string[];
  population_counts: { rows: number; players: number; by_position: Record<string, number>; null_outcome_rows: number };
  notes: string[];
}

/** Evaluate the outcome mirror. Pure, deterministic, no I/O. */
export const evaluatePlayerHistoryTargetPopulationGate = (
  mirror: PlayerHistoryOutcomeMirror,
): PlayerHistoryTargetPopulationGateResult => {
  const checks: PlayerHistoryTargetPopulationGateCheck[] = [];
  const blocking: string[] = [];
  const check = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ dimension, expected, observed, passed });
    if (!passed) blocking.push(`${dimension}: expected ${expected}; observed ${observed}`);
  };

  check(
    'mirror_kind',
    'player_history_run_population_outcome_mirror',
    mirror.kind,
    mirror.kind === 'player_history_run_population_outcome_mirror',
  );
  check(
    'source_sha256_pin',
    PINNED_SOURCE_ARTIFACT_SHA256,
    mirror.governed_source.sha256,
    mirror.governed_source.sha256 === PINNED_SOURCE_ARTIFACT_SHA256,
  );
  check(
    'candidate_status_acknowledged',
    EXPECTED_SOURCE_ARTIFACT_STATUS,
    mirror.governed_source.artifactStatus,
    mirror.governed_source.artifactStatus === EXPECTED_SOURCE_ARTIFACT_STATUS,
  );
  check(
    'outcome_layer_only_boundary_stated',
    'boundary.outcome_layer_only === true && boundary.rows_carry_no_input_features === true',
    `outcome_layer_only=${mirror.boundary?.outcome_layer_only}, rows_carry_no_input_features=${mirror.boundary?.rows_carry_no_input_features}`,
    mirror.boundary?.outcome_layer_only === true && mirror.boundary?.rows_carry_no_input_features === true,
  );

  const rows = mirror.rows;
  check('population_nonempty', '> 0 rows', `${rows.length} rows`, rows.length > 0);

  const badSeason = rows.filter((row) => row.season !== RUN_POPULATION_TARGET_SEASON);
  check('season_scope', `all rows season === ${RUN_POPULATION_TARGET_SEASON}`, `${badSeason.length} rows outside`, badSeason.length === 0);

  const badType = rows.filter((row) => row.season_type !== PLAYER_HISTORY_APPROVED_SEASON_TYPE);
  check('season_type_scope', `all rows season_type === ${PLAYER_HISTORY_APPROVED_SEASON_TYPE}`, `${badType.length} rows outside`, badType.length === 0);

  const badPosition = rows.filter((row) => !PLAYER_HISTORY_APPROVED_POSITIONS.includes(row.position));
  check('position_scope', `all rows in ${PLAYER_HISTORY_APPROVED_POSITIONS.join('/')}`, `${badPosition.length} rows outside`, badPosition.length === 0);

  const grains = new Set<string>();
  let duplicateGrains = 0;
  for (const row of rows) {
    const key = `${row.player_id}|${row.season}|${row.season_type}`;
    if (grains.has(key)) duplicateGrains += 1;
    grains.add(key);
  }
  check('row_grain_unique', 'one row per player_id + season + season_type', `${duplicateGrains} duplicates`, duplicateGrains === 0);

  const missingOutcomeField = rows.filter((row) => row.season_ppr === undefined || (row.season_ppr !== null && typeof row.season_ppr !== 'number'));
  check(
    'target_outcome_present_and_numeric_or_null',
    'season_ppr present on every row, number where observed, null only for genuinely unobserved',
    `${missingOutcomeField.length} rows with missing/non-numeric outcome field`,
    missingOutcomeField.length === 0,
  );
  const numericOutcomes = rows.filter((row) => typeof row.season_ppr === 'number').length;
  check('at_least_one_numeric_outcome', '>= 1 numeric outcome value', `${numericOutcomes} numeric`, numericOutcomes >= 1);

  const missingRefs = rows.filter((row) => !Array.isArray(row.source_refs) || row.source_refs.length === 0);
  check('row_level_source_refs_present', 'every row carries >= 1 source_ref', `${missingRefs.length} rows without`, missingRefs.length === 0);

  const badConfidence = rows.filter((row) => !ACCEPTED_IDENTITY_CONFIDENCES.includes(row.identity_confidence));
  check(
    'identity_confidence_source_backed',
    `every row in [${ACCEPTED_IDENTITY_CONFIDENCES.join(', ')}]`,
    `${badConfidence.length} rows outside`,
    badConfidence.length === 0,
  );

  const fixtureMarked = rows.filter((row) =>
    row.source_refs.some((ref) => FORBIDDEN_SOURCE_MARKERS.some((marker) => ref.source_name.toLowerCase().includes(marker))),
  );
  check(
    'no_fixture_source_markers',
    `no source_name containing ${FORBIDDEN_SOURCE_MARKERS.join('/')}`,
    `${fixtureMarked.length} rows with fixture-like markers`,
    fixtureMarked.length === 0,
  );

  const forbiddenFieldRows = rows.filter((row) =>
    FORBIDDEN_AVAILABILITY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(row, key)),
  );
  check(
    'no_forbidden_availability_fields',
    `no row carries ${FORBIDDEN_AVAILABILITY_KEYS.join('/')}`,
    `${forbiddenFieldRows.length} rows with forbidden fields`,
    forbiddenFieldRows.length === 0,
  );

  const inputFeatureLeaks = rows.filter((row) =>
    ['usage_summary', 'production_summary', 'weeks_observed', 'coverage_status', 'teams'].some((key) =>
      Object.prototype.hasOwnProperty.call(row, key),
    ),
  );
  check(
    'no_input_feature_payloads_on_outcome_rows',
    'outcome rows carry outcome + identity + provenance only',
    `${inputFeatureLeaks.length} rows carrying input-feature payload keys`,
    inputFeatureLeaks.length === 0,
  );

  const passed = blocking.length === 0;
  return {
    gate_version: PLAYER_HISTORY_TARGET_POPULATION_GATE_VERSION,
    status: passed ? 'player_history_target_population_gate_passed' : 'player_history_target_population_gate_blocked',
    decision: passed ? 'may_continue_to_overlap_gate' : 'blocked_target_population',
    decision_ceiling_note: 'may_continue_to_overlap_gate is the strongest decision this gate can return; it has no may_run value',
    checks,
    blocking_reasons: blocking,
    population_counts: {
      rows: rows.length,
      players: new Set(rows.map((row) => row.player_id)).size,
      by_position: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.position] = (acc[row.position] ?? 0) + 1;
        return acc;
      }, {}),
      null_outcome_rows: rows.filter((row) => row.season_ppr === null).length,
    },
    notes: [
      'Gate evaluation only: no Forecast run, no Run 3, no model training/tuning/evaluation, no metric computation, no feature binding, no promotion of the candidate artifact, no signal claim.',
      'The 2025 outcome values gated here are the experiment TARGET layer; they are never consumed as input features (structural #104 guards + the input mirror carries no 2025 rows).',
    ],
  };
};
