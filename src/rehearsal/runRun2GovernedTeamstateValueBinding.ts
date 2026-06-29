import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import { SEASONAL_PPR_INPUT_SEASON, SEASONAL_PPR_TARGET_SEASON } from '../contracts/seasonalPprBacktest.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../services/result.js';
import type { Run2FeatureExclusion } from './runRun2FeatureInclusionPreflight.js';
import type {
  Run2FeatureMatrixCandidateReport,
  Run2FeatureMatrixCandidateRow,
} from './runRun2FeatureMatrixCandidate.js';
import {
  assessRun2TeamstateValueBindingReadiness,
  type AssessRun2TeamstateValueBindingReadinessInput,
  type Run2TeamstateValueBindingReadinessReport,
} from './runRun2TeamstateValueBindingReadiness.js';

export const RUN2_GOVERNED_VALUE_BINDING_VERSION = 'run2-governed-teamstate-value-binding-v1' as const;

/**
 * The only aggregation used in this first binding step: an unweighted mean across the available
 * (finite) input-season team-week values for a team. Deterministic and documented; nulls are
 * preserved (a column with no finite value for a team binds `null`, never zero-filled).
 */
export const RUN2_TEAMSTATE_AGGREGATION_METHOD = 'mean_of_available_input_season_team_week_values' as const;

/** Explicit Teamstate → Forecast join keys used to bind team-week aggregates to player-season rows. */
export const RUN2_BINDING_JOIN_KEYS = [
  'team_2024 (player input-season team) = teamstate teamCode',
  'input_season = teamstate season',
] as const;

export type Run2ValueBindingStatus =
  | 'governed_teamstate_values_bound'
  | 'not_bound_readiness_not_met'
  | 'not_bound_no_team_week_values';

/**
 * One governed Teamstate team-week values row. The grain keys (`teamCode`/`season`/`week`) plus
 * numeric/null metric columns. Pressure / fantasy / target columns are never read even if present —
 * only the chain's preflight-allowed columns are aggregated.
 */
export interface TeamstateTeamWeekValueRow {
  teamCode: string;
  season: number;
  week: number;
  [column: string]: number | string | null;
}

export interface Run2BoundTeamstateAggregate {
  team: string;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  /** Number of input-season team-week rows that contributed to this team's aggregate. */
  contributing_team_week_rows: number;
  /** Per-column count of finite values that contributed; 0 means the bound value is null. */
  contributing_value_counts: Record<string, number>;
  /** The bound (mean) value per allowed column; null when no finite value was available. */
  values: Record<string, number | null>;
}

export interface Run2BoundCandidateRow
  extends Omit<Run2FeatureMatrixCandidateRow, 'teamstate_feature_values' | 'teamstate_partial_null_values'> {
  /** Bound governed Teamstate feature values (mean of available input-season team-week values); null when unmatched/unavailable. */
  teamstate_feature_values: Record<string, number | null>;
  /** Bound partial-null Teamstate values; nulls preserved (never zero-filled) when no finite value existed. */
  teamstate_partial_null_values: Record<string, number | null>;
  /** True when a governed Teamstate team-season aggregate matched this row's team_2024 + input_season. */
  teamstate_binding_matched: boolean;
}

export interface Run2BindingCoverage {
  candidate_row_count: number;
  /** Rows whose team_2024 matched a governed team-season aggregate. */
  bound_row_count: number;
  /** Rows with no matching governed team-season aggregate (Teamstate values stay null). */
  unbound_row_count: number;
  matched_teams: string[];
  unmatched_teams: string[];
  team_week_rows_supplied: number;
  team_week_rows_used: number;
  /** Team-week rows skipped because their season was not the 2024 input season (never bound). */
  ignored_non_input_season_rows: number;
  aggregates: Run2BoundTeamstateAggregate[];
}

export interface Run2RecordedCutoff {
  input_season: number | null;
  as_of: string | null;
  target_season: number | null;
  target_season_start: string | null;
  source_generated_at: string | null;
  cutoff_before_target_season: boolean | null;
}

export interface Run2BoundFeatureMatrixReport {
  binding_version: typeof RUN2_GOVERNED_VALUE_BINDING_VERSION;
  candidate_status: 'pre_train_bound_feature_matrix_candidate';
  binding_status: Run2ValueBindingStatus;
  execution_status: 'not_trained';
  evaluation_status: 'not_evaluated';
  run_2_executed: false;
  row_grain: Run2FeatureMatrixCandidateReport['row_grain'];
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  aggregation_method: typeof RUN2_TEAMSTATE_AGGREGATION_METHOD;
  join_keys_used: string[];
  run1_feature_columns: string[];
  teamstate_feature_columns: string[];
  partial_null_columns: string[];
  excluded_columns: Run2FeatureExclusion[];
  pressure_status: 'unavailable_insufficient_data_deferred_excluded';
  target_leakage_status: 'no_target_derived_fields_included';
  /** Recorded forecast cutoff carried from the governed artifact (timezone-explicit as-of preserved). */
  recorded_cutoff: Run2RecordedCutoff;
  cutoff_validation: Run2TeamstateValueBindingReadinessReport['required_cutoff'];
  teamstate_governance: Run2FeatureMatrixCandidateReport['teamstate_governance'] | null;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  binding_coverage: Run2BindingCoverage;
  row_count: number;
  bound_rows: Run2BoundCandidateRow[];
  /** Compact linkage to the upstream reports. */
  candidate_ref: { candidate_version: string; candidate_status: string; row_count: number } | null;
  readiness_ref: { readiness_version: string; readiness_status: string };
  /** Full linkage to the value-binding readiness report this binding is grounded in. */
  readiness: Run2TeamstateValueBindingReadinessReport;
  notes: string[];
}

/**
 * Binding options. There is deliberately NO side-channel for team-week values: the values to bind are
 * read only from the governed artifact's own `teamWeekValues` field, so bound data always shares the
 * governance / source / validation / lineage / cutoff provenance of the artifact that passed readiness.
 * An arbitrary external value set can never be bound as if it were governed.
 */
export type BindRun2GovernedTeamstateValuesInput = AssessRun2TeamstateValueBindingReadinessInput;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Defensive: never bind a pressure / fantasy / target-leakage column even if the chain ever surfaced
// one. The preflight already excludes these; this is belt-and-suspenders at the value boundary.
const PRESSURE_FEATURE_KEYS = new Set(['pressure', 'pressurerateallowed']);
const FORBIDDEN_BIND_SIGNALS = ['fantasy', 'target', 'label', 'outcome', 'future', 'nextseason'];
const isBindableColumn = (column: string): boolean => {
  const lower = column.toLowerCase();
  if (PRESSURE_FEATURE_KEYS.has(lower)) return false;
  return !FORBIDDEN_BIND_SIGNALS.some((signal) => lower.includes(signal));
};

// Values are read ONLY from the governed artifact that passed readiness — never from a caller-supplied
// side-channel — so bound values always carry the artifact's governance/cutoff/refs provenance.
const readTeamWeekValues = (input: unknown): TeamstateTeamWeekValueRow[] => {
  if (isRecord(input) && Array.isArray(input.teamWeekValues)) return input.teamWeekValues as TeamstateTeamWeekValueRow[];
  return [];
};

// The authoritative input_season / as_of come from the readiness gate's own (alias-aware) extraction
// — the gate accepts forecastCutoff.season/cutoffSeason and top-level forecastCutoffInputSeason/
// forecastCutoffAsOf, so reading only forecastCutoff.inputSeason/asOf here would drop the cutoff
// metadata that authorized binding. The remaining fields are provenance extras read directly.
const readRecordedCutoff = (
  input: unknown,
  requiredCutoff: Run2TeamstateValueBindingReadinessReport['required_cutoff'],
): Run2RecordedCutoff => {
  const cutoff = isRecord(input) && isRecord(input.forecastCutoff) ? input.forecastCutoff : undefined;
  const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
  const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
  return {
    input_season: requiredCutoff.recorded_cutoff_input_season ?? num(cutoff?.inputSeason),
    as_of: requiredCutoff.recorded_cutoff_as_of ?? str(cutoff?.asOf),
    target_season: num(cutoff?.targetSeason),
    target_season_start: str(cutoff?.targetSeasonStart),
    source_generated_at: str(cutoff?.sourceGeneratedAt),
    cutoff_before_target_season: bool(cutoff?.cutoffBeforeTargetSeason),
  };
};

interface TeamAccumulator {
  rows: number;
  sums: Map<string, { sum: number; count: number }>;
}

/**
 * Binds real governed Teamstate values into the existing Run 2 candidate matrix — value binding only,
 * no training, evaluation, Run 2 execution, or Run 1 vs Run 2 comparison.
 *
 * It is grounded in (and never bypasses) the full chain: readGovernedTeamstateInput →
 * buildRun2ManifestRehearsal → buildRun2FeatureInclusionPreflight → buildRun2FeatureTableRehearsal →
 * buildRun2FeatureMatrixCandidate → assessRun2TeamstateValueBindingReadiness. Binding proceeds only
 * when the readiness gate returns `ready_for_value_binding`; otherwise it emits a not-bound report.
 *
 * Teamstate team-week values are aggregated deterministically (mean of available input-season values)
 * to team-season summaries and bound to candidate rows by team_2024 + input season. Partial-null
 * columns stay null-aware (never zero-filled); pressure and fantasy-split fields are never read; the
 * Run 1 target stays label-only; Run 1 feature values and row/population identity are preserved.
 */
export const bindRun2GovernedTeamstateValues = (
  input: unknown,
  options: BindRun2GovernedTeamstateValuesInput = {},
): ServiceResult<Run2BoundFeatureMatrixReport> => {
  if (!isRecord(input)) {
    return serviceFailure({
      code: 'RUN2_VALUE_BINDING_INPUT_INVALID',
      message: 'Teamstate value-binding input must be an object.',
    });
  }

  // Ground the binding in the readiness gate; never bind without it.
  const readinessResult = assessRun2TeamstateValueBindingReadiness(input, options);
  if (!readinessResult.ok) return readinessResult;
  const readiness = readinessResult.data;

  const recordedCutoff = readRecordedCutoff(input, readiness.required_cutoff);
  const readinessRef = { readiness_version: readiness.readiness_version, readiness_status: readiness.readiness_status };

  const baseReport = (
    bindingStatus: Run2ValueBindingStatus,
    bindingCoverage: Run2BindingCoverage,
    boundRows: Run2BoundCandidateRow[],
    extraNotes: string[],
  ): Run2BoundFeatureMatrixReport => ({
    binding_version: RUN2_GOVERNED_VALUE_BINDING_VERSION,
    candidate_status: 'pre_train_bound_feature_matrix_candidate',
    binding_status: bindingStatus,
    execution_status: 'not_trained',
    evaluation_status: 'not_evaluated',
    run_2_executed: false,
    row_grain: readiness.candidate?.row_grain ?? 'player_season_forecast',
    input_season: SEASONAL_PPR_INPUT_SEASON,
    target_season: SEASONAL_PPR_TARGET_SEASON,
    aggregation_method: RUN2_TEAMSTATE_AGGREGATION_METHOD,
    join_keys_used: [...RUN2_BINDING_JOIN_KEYS],
    run1_feature_columns: readiness.candidate?.run1_feature_columns ?? [],
    teamstate_feature_columns: readiness.candidate?.teamstate_feature_columns ?? readiness.allowed_columns,
    partial_null_columns: readiness.candidate?.partial_null_columns ?? readiness.partial_null_columns,
    excluded_columns: readiness.candidate?.excluded_columns ?? readiness.excluded_columns,
    pressure_status: 'unavailable_insufficient_data_deferred_excluded',
    target_leakage_status: 'no_target_derived_fields_included',
    recorded_cutoff: recordedCutoff,
    cutoff_validation: readiness.required_cutoff,
    teamstate_governance: readiness.teamstate_governance,
    source_artifact_refs: readiness.source_artifact_refs,
    validation_refs: readiness.validation_refs,
    lineage_refs: readiness.lineage_refs,
    binding_coverage: bindingCoverage,
    row_count: boundRows.length,
    bound_rows: boundRows,
    candidate_ref: readiness.candidate
      ? {
          candidate_version: readiness.candidate.candidate_version,
          candidate_status: readiness.candidate.candidate_status,
          row_count: readiness.candidate.row_count,
        }
      : null,
    readiness_ref: readinessRef,
    readiness,
    notes: [
      'Pre-train value binding only: no model training, evaluation, Run 2 execution, Run 1 vs Run 2 comparison, or shuffled-Teamstate sanity arm.',
      'Binding proceeds only when the readiness gate returns ready_for_value_binding; otherwise no values are bound.',
      'Teamstate team-week values are aggregated by mean over available 2024 input-season rows; partial-null columns stay null-aware and are never zero-filled.',
      'Pressure stays unavailable/insufficient_data/deferred and is never read or bound; fantasy split and target/future/leakage fields are never bound; the Run 1 target stays label-only.',
      ...extraNotes,
    ],
  });

  const emptyCoverage = (suppliedRows: number, ignored: number): Run2BindingCoverage => ({
    candidate_row_count: readiness.candidate?.row_count ?? 0,
    bound_row_count: 0,
    unbound_row_count: readiness.candidate?.row_count ?? 0,
    matched_teams: [],
    unmatched_teams: [],
    team_week_rows_supplied: suppliedRows,
    team_week_rows_used: 0,
    ignored_non_input_season_rows: ignored,
    aggregates: [],
  });

  // Fail closed: a not-ready readiness result binds nothing.
  if (readiness.readiness_status !== 'ready_for_value_binding') {
    return serviceSuccess(
      baseReport('not_bound_readiness_not_met', emptyCoverage(0, 0), [], [
        `Readiness gate returned not_ready_for_value_binding; missing: ${readiness.missing_requirements.join(', ') || '(none reported)'}.`,
      ]),
    );
  }

  const candidate = readiness.candidate;
  // Ready implies the candidate chain succeeded, but guard defensively.
  if (candidate === null) {
    return serviceSuccess(
      baseReport('not_bound_readiness_not_met', emptyCoverage(0, 0), [], [
        'Readiness reported ready but no candidate matrix was available; nothing bound.',
      ]),
    );
  }

  const featureColumns = candidate.teamstate_feature_columns.filter(isBindableColumn);
  const partialNullColumns = candidate.partial_null_columns.filter(isBindableColumn);
  const allowedColumns = [...new Set([...featureColumns, ...partialNullColumns])];

  const teamWeekValues = readTeamWeekValues(input);

  // Aggregate available input-season team-week values to team-season means.
  const accumulators = new Map<string, TeamAccumulator>();
  let usedRows = 0;
  let ignoredNonInputSeason = 0;
  for (const row of teamWeekValues) {
    if (!isRecord(row)) continue;
    const teamCode = row.teamCode;
    if (typeof teamCode !== 'string' || teamCode.trim() === '') continue;
    // Never aggregate non-2024 (e.g. target-season) rows — no target-season leakage.
    if (row.season !== SEASONAL_PPR_INPUT_SEASON) {
      ignoredNonInputSeason += 1;
      continue;
    }
    usedRows += 1;
    let accumulator = accumulators.get(teamCode);
    if (accumulator === undefined) {
      accumulator = { rows: 0, sums: new Map() };
      accumulators.set(teamCode, accumulator);
    }
    accumulator.rows += 1;
    for (const column of allowedColumns) {
      const value = row[column];
      if (typeof value === 'number' && Number.isFinite(value)) {
        const entry = accumulator.sums.get(column) ?? { sum: 0, count: 0 };
        entry.sum += value;
        entry.count += 1;
        accumulator.sums.set(column, entry);
      }
    }
  }

  const aggregateValue = (accumulator: TeamAccumulator, column: string): number | null => {
    const entry = accumulator.sums.get(column);
    return entry !== undefined && entry.count > 0 ? entry.sum / entry.count : null;
  };

  if (usedRows === 0) {
    return serviceSuccess(
      baseReport('not_bound_no_team_week_values', emptyCoverage(teamWeekValues.length, ignoredNonInputSeason), [], [
        'No 2024 input-season governed Teamstate team-week values were supplied; candidate Teamstate values remain null (unbound).',
      ]),
    );
  }

  const matchedTeams = new Set<string>();
  const unmatchedTeams = new Set<string>();

  const boundRows: Run2BoundCandidateRow[] = candidate.candidate_rows.map((row) => {
    const accumulator = accumulators.get(row.team_2024);
    const matched = accumulator !== undefined && row.input_season === SEASONAL_PPR_INPUT_SEASON;
    const featureValues: Record<string, number | null> = { ...row.teamstate_feature_values };
    const partialNullValues: Record<string, number | null> = { ...row.teamstate_partial_null_values };
    if (matched && accumulator !== undefined) {
      matchedTeams.add(row.team_2024);
      for (const column of featureColumns) featureValues[column] = aggregateValue(accumulator, column);
      for (const column of partialNullColumns) partialNullValues[column] = aggregateValue(accumulator, column);
    } else {
      unmatchedTeams.add(row.team_2024);
    }
    return {
      ...row,
      teamstate_feature_values: featureValues,
      teamstate_partial_null_values: partialNullValues,
      teamstate_binding_matched: matched,
    };
  });

  const aggregates: Run2BoundTeamstateAggregate[] = [...accumulators.entries()]
    .filter(([team]) => matchedTeams.has(team))
    .map(([team, accumulator]) => ({
      team,
      input_season: SEASONAL_PPR_INPUT_SEASON,
      contributing_team_week_rows: accumulator.rows,
      contributing_value_counts: Object.fromEntries(allowedColumns.map((column) => [column, accumulator.sums.get(column)?.count ?? 0])),
      values: Object.fromEntries(allowedColumns.map((column) => [column, aggregateValue(accumulator, column)])),
    }))
    .sort((a, b) => a.team.localeCompare(b.team));

  const boundRowCount = boundRows.filter((row) => row.teamstate_binding_matched).length;
  const bindingCoverage: Run2BindingCoverage = {
    candidate_row_count: boundRows.length,
    bound_row_count: boundRowCount,
    unbound_row_count: boundRows.length - boundRowCount,
    matched_teams: [...matchedTeams].sort(),
    unmatched_teams: [...unmatchedTeams].sort(),
    team_week_rows_supplied: teamWeekValues.length,
    team_week_rows_used: usedRows,
    ignored_non_input_season_rows: ignoredNonInputSeason,
    aggregates,
  };

  return serviceSuccess(baseReport('governed_teamstate_values_bound', bindingCoverage, boundRows, []));
};
