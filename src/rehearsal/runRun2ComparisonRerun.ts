/**
 * Unchanged Run 2 three-arm comparison rerun with full-coverage Teamstate evidence (Forecast #96).
 *
 * This is the AUTHORIZED unchanged rerun after the Teamstate coverage gate passed (#94/#95). It changes
 * ONLY the source binding: the team-week values fed to the existing, frozen comparison are the full
 * 32-team gate-passed governed set instead of the original 3-team fixture. It does NOT change the
 * population, target, folds, model class, ridge lambda, standardization, train-fold mean imputation,
 * prediction clipping, Run 1 feature set, Teamstate feature set, aggregation method, null handling,
 * shuffled-control method, metrics, or interpretation labels — all of those come from the unchanged
 * {@link runRun2TeamstateComparison} harness. The goal is to measure what the same experiment says now
 * that the coverage defect is removed, not to obtain a better result.
 */

import type { ServiceResult } from '../services/result.js';
import { fixtureGovernedTeamstateBindingArtifact } from './fixtures/governedTeamstateBindingFixture.js';
import type { TeamstateTeamWeekValueRow } from './runRun2GovernedTeamstateValueBinding.js';
import {
  runRun2TeamstateComparison,
  type Run2SignalInterpretation,
  type Run2TeamstateComparisonReport,
  type RunRun2TeamstateComparisonInput,
} from './runRun2TeamstateComparison.js';

/**
 * Field readiness of the full-mode governed source (mirrors the #94 evidence full.json): two available
 * columns, one partial-null (`redZoneTdRate`, 11 legitimate zero-red-zone-trip nulls), pressure deferred.
 * This is source metadata only; the bound values come from the supplied team-week values.
 */
export const FULL_MODE_TEAMSTATE_FIELD_READINESS = [
  { field: 'epaPerPlay', finiteCount: 544, nullCount: 0, status: 'available' },
  { field: 'successRate', finiteCount: 544, nullCount: 0, status: 'available' },
  { field: 'redZoneTdRate', finiteCount: 533, nullCount: 11, status: 'partial_nulls' },
  { field: 'pressureRateAllowed', finiteCount: 0, nullCount: 544, status: 'deferred_insufficient_data' },
] as const;

/** The governed TIBER-Data source sha256 the full-mode team-week values are derived from (#181/#182). */
export const FULL_MODE_GOVERNED_SOURCE_SHA256 =
  '2aed00e68c1620af10d2ea4350104f7e183ff6ee050f5d385a503ef027281de9';

/**
 * Build the rerun input: the SAME governed binding envelope (governance / explicit-marker / recorded
 * cutoff / source-validation-lineage refs / readiness chain) the original comparison used, with ONLY
 * the team-week values replaced by the full 32-team gate-passed set and field readiness updated to the
 * full-source counts. This is a source-binding update, not a model/design change.
 */
export const buildFullModeTeamstateBindingArtifact = (
  teamWeekValues: TeamstateTeamWeekValueRow[],
): Record<string, unknown> => ({
  ...fixtureGovernedTeamstateBindingArtifact,
  fieldReadiness: FULL_MODE_TEAMSTATE_FIELD_READINESS.map((entry) => ({ ...entry })),
  teamWeekValues,
});

/**
 * Map the harness's conservative signal interpretation to the issue's next-step recommendation codes.
 * No favorable spin: a failed sanity control or fail-closed run never maps to a signal/replication step.
 */
export const RUN2_RERUN_NEXT_STEP_BY_SIGNAL: Record<Run2SignalInterpretation, string> = {
  possible_teamstate_signal: 'record_possible_teamstate_signal_and_replicate',
  suspicious_shuffle_also_improves: 'audit_if_shuffled_also_improves',
  no_measured_teamstate_lift_in_this_setup: 'replicate_with_more_seasons_before_claim',
  failed_sanity_control: 'audit_failed_sanity_control_again',
  no_metric_claim_fail_closed: 'pause_teamstate_run2_path',
};

/** Run the unchanged three-arm comparison against the full-coverage team-week values. */
export const runRun2ComparisonRerunFromValues = (
  teamWeekValues: TeamstateTeamWeekValueRow[],
  options: RunRun2TeamstateComparisonInput = {},
): ServiceResult<Run2TeamstateComparisonReport> =>
  runRun2TeamstateComparison(buildFullModeTeamstateBindingArtifact(teamWeekValues), options);

/** The next-step recommendation code for a completed/failed-closed comparison report. */
export const nextStepForRerun = (report: Run2TeamstateComparisonReport): string =>
  RUN2_RERUN_NEXT_STEP_BY_SIGNAL[report.interpretation.signal_interpretation];
