import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import { SEASONAL_PPR_INPUT_SEASON, SEASONAL_PPR_TARGET_SEASON } from '../contracts/seasonalPprBacktest.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../services/result.js';
import type { Run2FeatureExclusion } from './runRun2FeatureInclusionPreflight.js';
import {
  bindRun2GovernedTeamstateValues,
  type BindRun2GovernedTeamstateValuesInput,
  type Run2BoundCandidateRow,
  type Run2BoundFeatureMatrixReport,
  type Run2RecordedCutoff,
} from './runRun2GovernedTeamstateValueBinding.js';
import { isDerangement, seededDerangement } from './util/seededShuffle.js';

export const RUN2_SHUFFLED_SANITY_ARM_VERSION = 'run2-shuffled-teamstate-sanity-arm-v1' as const;
export const RUN2_SHUFFLE_METHOD = 'seeded_fisher_yates_derangement_over_matched_team_value_groups' as const;
/** Fixed default seed so the control arm is reproducible without a caller specifying one. */
export const RUN2_SHUFFLE_DEFAULT_SEED = 0x5eed1337;

export type Run2SanityArmStatus = 'shuffled_teamstate_values_ready' | 'not_built_not_bound';

export interface Run2ShuffleMapEntry {
  /** A matched team whose rows receive a (possibly different) team's bound value group. */
  team: string;
  /** The team whose bound Teamstate value group `team` now receives. */
  receives_values_from_team: string;
  /** True when the assigned source differs from the team's own group (relationship broken). */
  shuffled_away: boolean;
}

export interface Run2ShuffleCoverage {
  total_rows: number;
  /** Distinct matched team value groups available to permute. */
  matched_group_count: number;
  /** Groups whose assignment moved away from their original team. */
  permuted_group_count: number;
  /** Rows that received a value group from a different team. */
  shuffled_row_count: number;
  /** Matched rows that kept their own group (only when a derangement was infeasible). */
  identity_row_count: number;
  /** Unmatched rows whose Teamstate values stay null (never shuffled, never zero-filled). */
  unmatched_row_count: number;
  /** True when every matched group was reassigned away from its own team (no fixed points). */
  identity_avoided: boolean;
}

export interface Run2ShuffledCandidateRow extends Run2BoundCandidateRow {
  /** The team this row's bound Teamstate values originally came from (its own team_2024); null if unmatched. */
  original_teamstate_source_team: string | null;
  /** The team whose bound Teamstate values this row now carries after shuffling; null if unmatched. */
  shuffled_teamstate_source_team: string | null;
  /** True when the assigned source team differs from the original (values permuted away). */
  teamstate_shuffled: boolean;
  /** True when the row was unmatched at binding and its null Teamstate values are preserved. */
  unmatched_null_preserved: boolean;
}

export interface Run2ShuffledTeamstateSanityReport {
  sanity_arm_version: typeof RUN2_SHUFFLED_SANITY_ARM_VERSION;
  candidate_status: 'pre_train_shuffled_teamstate_sanity_candidate';
  sanity_arm_status: Run2SanityArmStatus;
  execution_status: 'not_trained';
  evaluation_status: 'not_evaluated';
  run_2_executed: false;
  comparison_status: 'not_run';
  row_grain: Run2BoundFeatureMatrixReport['row_grain'];
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  shuffle_seed: number;
  shuffle_method: typeof RUN2_SHUFFLE_METHOD;
  shuffle_map: Run2ShuffleMapEntry[];
  shuffle_coverage: Run2ShuffleCoverage;
  run1_feature_columns: string[];
  teamstate_shuffled_feature_columns: string[];
  partial_null_columns: string[];
  excluded_columns: Run2FeatureExclusion[];
  pressure_status: 'unavailable_insufficient_data_deferred_excluded';
  target_leakage_status: 'no_target_derived_fields_included';
  recorded_cutoff: Run2RecordedCutoff;
  teamstate_governance: Run2BoundFeatureMatrixReport['teamstate_governance'];
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  row_count: number;
  shuffled_rows: Run2ShuffledCandidateRow[];
  /** Compact linkage to the #82 bound candidate matrix report. */
  bound_ref: { binding_version: string; binding_status: string; row_count: number };
  /** Compact linkage to the value-binding readiness report (via the bound report). */
  readiness_ref: { readiness_version: string; readiness_status: string };
  /** Full linkage to the bound report this control arm is grounded in. */
  bound: Run2BoundFeatureMatrixReport;
  notes: string[];
}

export interface BuildRun2ShuffledTeamstateSanityArmInput extends BindRun2GovernedTeamstateValuesInput {
  /** Deterministic shuffle seed; defaults to {@link RUN2_SHUFFLE_DEFAULT_SEED}. */
  shuffle_seed?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pick = (values: Record<string, number | null>, columns: readonly string[]): Record<string, number | null> =>
  Object.fromEntries(columns.map((column) => [column, values[column] ?? null]));

/**
 * Builds the Run 2 shuffled-Teamstate **sanity / control** arm: a deterministic seeded permutation of
 * the bound Teamstate value groups across teams, breaking the real team→player relationship while
 * preserving the marginal set of value groups. It is a pre-train control scaffold — no training,
 * evaluation, Run 2 execution, Run 1 vs Run 2 comparison, predictions, or metrics.
 *
 * It is grounded in (and never bypasses) the #82 governed value binding: it runs
 * `bindRun2GovernedTeamstateValues` and only builds when the result is
 * `binding_status: governed_teamstate_values_bound`; otherwise it emits a not-built report.
 *
 * Only the bound Teamstate value payloads are shuffled. Run 1 feature values, the label-only target,
 * player identity / position / team_2024 / seasons / fold identity, governance/source/validation/
 * lineage/cutoff refs, and the column groups are all preserved unchanged. Unmatched rows keep their
 * null Teamstate values (never zero-filled); pressure / fantasy / target-leakage fields are never
 * introduced.
 */
export const buildRun2ShuffledTeamstateSanityArm = (
  input: unknown,
  options: BuildRun2ShuffledTeamstateSanityArmInput = {},
): ServiceResult<Run2ShuffledTeamstateSanityReport> => {
  if (!isRecord(input)) {
    return serviceFailure({
      code: 'RUN2_SHUFFLED_SANITY_ARM_INPUT_INVALID',
      message: 'Shuffled Teamstate sanity arm input must be an object.',
    });
  }

  // Ground in the #82 bound report; never bypass value binding.
  const boundResult = bindRun2GovernedTeamstateValues(input, options);
  if (!boundResult.ok) return boundResult;
  const bound = boundResult.data;

  const seed = options.shuffle_seed ?? RUN2_SHUFFLE_DEFAULT_SEED;
  const featureColumns = bound.teamstate_feature_columns;
  const partialNullColumns = bound.partial_null_columns;
  const boundRef = {
    binding_version: bound.binding_version,
    binding_status: bound.binding_status,
    row_count: bound.row_count,
  };
  const readinessRef = bound.readiness_ref;

  const baseReport = (
    status: Run2SanityArmStatus,
    shuffleMap: Run2ShuffleMapEntry[],
    coverage: Run2ShuffleCoverage,
    shuffledRows: Run2ShuffledCandidateRow[],
    extraNotes: string[],
  ): Run2ShuffledTeamstateSanityReport => ({
    sanity_arm_version: RUN2_SHUFFLED_SANITY_ARM_VERSION,
    candidate_status: 'pre_train_shuffled_teamstate_sanity_candidate',
    sanity_arm_status: status,
    execution_status: 'not_trained',
    evaluation_status: 'not_evaluated',
    run_2_executed: false,
    comparison_status: 'not_run',
    row_grain: bound.row_grain,
    input_season: SEASONAL_PPR_INPUT_SEASON,
    target_season: SEASONAL_PPR_TARGET_SEASON,
    shuffle_seed: seed,
    shuffle_method: RUN2_SHUFFLE_METHOD,
    shuffle_map: shuffleMap,
    shuffle_coverage: coverage,
    run1_feature_columns: bound.run1_feature_columns,
    teamstate_shuffled_feature_columns: featureColumns,
    partial_null_columns: partialNullColumns,
    excluded_columns: bound.excluded_columns,
    pressure_status: 'unavailable_insufficient_data_deferred_excluded',
    target_leakage_status: 'no_target_derived_fields_included',
    recorded_cutoff: bound.recorded_cutoff,
    teamstate_governance: bound.teamstate_governance,
    source_artifact_refs: bound.source_artifact_refs,
    validation_refs: bound.validation_refs,
    lineage_refs: bound.lineage_refs,
    row_count: shuffledRows.length,
    shuffled_rows: shuffledRows,
    bound_ref: boundRef,
    readiness_ref: readinessRef,
    bound,
    notes: [
      'Pre-train shuffled-Teamstate sanity / control arm — NOT a result: no training, evaluation, Run 2 execution, Run 1 vs Run 2 comparison, predictions, or metrics.',
      'Only bound Teamstate value payloads are permuted (deterministic seeded derangement over matched team value groups); Run 1 features, labels, identity, and fold assignment are never shuffled.',
      'The shuffle preserves the marginal set of Teamstate value groups while breaking the real team→player relationship, so a later evaluation can compare against a destroyed-signal control.',
      'Unmatched rows keep null Teamstate values (never zero-filled); pressure stays unavailable/insufficient_data/deferred and excluded; fantasy split and target/future/leakage fields are never introduced.',
      ...extraNotes,
    ],
  });

  // Fail closed: only a successful governed bind may be shuffled.
  if (bound.binding_status !== 'governed_teamstate_values_bound') {
    const coverage: Run2ShuffleCoverage = {
      total_rows: 0,
      matched_group_count: 0,
      permuted_group_count: 0,
      shuffled_row_count: 0,
      identity_row_count: 0,
      unmatched_row_count: 0,
      identity_avoided: false,
    };
    return serviceSuccess(
      baseReport('not_built_not_bound', [], coverage, [], [
        `Input is not a successful governed bind (binding_status: ${bound.binding_status}); nothing shuffled.`,
      ]),
    );
  }

  // Matched team value groups, in a stable order, are the units we permute.
  const matchedTeams = [...bound.binding_coverage.matched_teams].sort();
  const aggregateByTeam = new Map(bound.binding_coverage.aggregates.map((aggregate) => [aggregate.team, aggregate.values]));

  // Seeded derangement assigns each team the value group of another team where feasible.
  const permutation =
    matchedTeams.length >= 2 ? seededDerangement(matchedTeams.length, seed) : matchedTeams.map((_, index) => index);
  const sourceForTeam = new Map<string, string>();
  matchedTeams.forEach((team, index) => {
    sourceForTeam.set(team, matchedTeams[permutation[index]!]!);
  });
  const identityAvoided = matchedTeams.length >= 2 && isDerangement(permutation);

  const shuffleMap: Run2ShuffleMapEntry[] = matchedTeams.map((team) => {
    const source = sourceForTeam.get(team)!;
    return { team, receives_values_from_team: source, shuffled_away: source !== team };
  });

  let shuffledRowCount = 0;
  let identityRowCount = 0;
  let unmatchedRowCount = 0;

  const shuffledRows: Run2ShuffledCandidateRow[] = bound.bound_rows.map((row: Run2BoundCandidateRow) => {
    if (!row.teamstate_binding_matched) {
      unmatchedRowCount += 1;
      return {
        ...row,
        original_teamstate_source_team: null,
        shuffled_teamstate_source_team: null,
        teamstate_shuffled: false,
        unmatched_null_preserved: true,
      };
    }
    const sourceTeam = sourceForTeam.get(row.team_2024) ?? row.team_2024;
    const sourceValues = aggregateByTeam.get(sourceTeam) ?? {};
    const shuffled = sourceTeam !== row.team_2024;
    if (shuffled) shuffledRowCount += 1;
    else identityRowCount += 1;
    return {
      ...row,
      // Assign the (possibly other) team's bound value group, split back into the column groups.
      teamstate_feature_values: pick(sourceValues, featureColumns),
      teamstate_partial_null_values: pick(sourceValues, partialNullColumns),
      original_teamstate_source_team: row.team_2024,
      shuffled_teamstate_source_team: sourceTeam,
      teamstate_shuffled: shuffled,
      unmatched_null_preserved: false,
    };
  });

  const coverage: Run2ShuffleCoverage = {
    total_rows: shuffledRows.length,
    matched_group_count: matchedTeams.length,
    permuted_group_count: shuffleMap.filter((entry) => entry.shuffled_away).length,
    shuffled_row_count: shuffledRowCount,
    identity_row_count: identityRowCount,
    unmatched_row_count: unmatchedRowCount,
    identity_avoided: identityAvoided,
  };

  const singleGroupNote =
    matchedTeams.length < 2
      ? ['Only one matched Teamstate value group exists, so a non-identity permutation is infeasible; values are unchanged but the control arm is still recorded honestly.']
      : [];

  return serviceSuccess(baseReport('shuffled_teamstate_values_ready', shuffleMap, coverage, shuffledRows, singleGroupNote));
};
