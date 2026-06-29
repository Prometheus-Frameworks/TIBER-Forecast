import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import { SEASONAL_PPR_INPUT_SEASON, SEASONAL_PPR_TARGET_SEASON } from '../contracts/seasonalPprBacktest.js';
import {
  TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
  TEAMSTATE_GOVERNED_READINESS_ARTIFACT,
  TEAMSTATE_GOVERNED_READINESS_KIND,
  TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS,
} from '../contracts/teamstateInput.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../services/result.js';
import type { Run2FeatureExclusion } from './runRun2FeatureInclusionPreflight.js';
import {
  buildRun2FeatureMatrixCandidate,
  type BuildRun2FeatureMatrixCandidateInput,
  type Run2FeatureMatrixCandidateReport,
} from './runRun2FeatureMatrixCandidate.js';

export const RUN2_TEAMSTATE_VALUE_BINDING_READINESS_VERSION = 'run2-teamstate-value-binding-readiness-v1' as const;

export type Run2ValueBindingReadinessStatus = 'ready_for_value_binding' | 'not_ready_for_value_binding';

export interface Run2ValueBindingGate {
  gate: string;
  satisfied: boolean;
  detail: string;
}

export interface Run2ExpectedTeamstateArtifact {
  kind: typeof TEAMSTATE_GOVERNED_READINESS_KIND;
  artifact: typeof TEAMSTATE_GOVERNED_READINESS_ARTIFACT;
  boundary_version: typeof TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION;
  readiness_status: typeof TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS;
}

export interface Run2RequiredGovernance {
  governanceStatus: 'governed';
  governanceSource: 'explicit_marker';
  provenanceStatus: 'governed_real_data';
  note: string;
}

export interface Run2RequiredCutoff {
  must_record_forecast_cutoff: true;
  required_input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  must_not_use_target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  /** The input-season cutoff actually found on the supplied artifact (null when absent/malformed). */
  recorded_cutoff_input_season: number | null;
  /** Optional recorded as-of stamp found on the artifact. */
  recorded_cutoff_as_of: string | null;
}

export interface Run2RowGrainAlignment {
  teamstate_grain: 'team_week';
  run1_grain: 'player_season (SeasonalPlayerObservation)';
  candidate_grain: string;
  joinable: boolean;
}

export interface Run2TeamstateValueBindingReadinessReport {
  readiness_version: typeof RUN2_TEAMSTATE_VALUE_BINDING_READINESS_VERSION;
  readiness_status: Run2ValueBindingReadinessStatus;
  execution_status: 'not_trained';
  evaluation_status: 'not_evaluated';
  run_2_executed: false;
  /** This check never binds values; it only assesses readiness. */
  binding_status: 'not_bound_readiness_only';
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  expected_teamstate_artifact: Run2ExpectedTeamstateArtifact;
  required_governance: Run2RequiredGovernance;
  required_cutoff: Run2RequiredCutoff;
  required_join_keys: string[];
  row_grain_alignment: Run2RowGrainAlignment;
  /** Teamstate columns that would be eligible to bind (preflight-included). */
  allowed_columns: string[];
  /** Partial-null Teamstate columns (carried null-aware, never zero-filled). */
  partial_null_columns: string[];
  /** Columns blocked from binding, with reasons. */
  excluded_columns: Run2FeatureExclusion[];
  pressure_status: 'unavailable_insufficient_data_deferred_excluded';
  target_leakage_status: string;
  gates: Run2ValueBindingGate[];
  missing_requirements: string[];
  blocking_reasons: string[];
  teamstate_governance: Run2FeatureMatrixCandidateReport['teamstate_governance'] | null;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  /** Linkage to the pre-train candidate chain (present only when the governed chain succeeds). */
  candidate: Run2FeatureMatrixCandidateReport | null;
  notes: string[];
}

export type AssessRun2TeamstateValueBindingReadinessInput = BuildRun2FeatureMatrixCandidateInput;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface ExtractedCutoff {
  inputSeason: number | null;
  asOf: string | null;
  /** True when a forecastCutoff was supplied at all (even if malformed). */
  present: boolean;
}

// The forecast cutoff must be recorded on the governed Teamstate artifact itself — never inferred
// from a path, build success, or downstream need. Accept a few honest aliases; require an integer season.
const extractForecastCutoff = (input: unknown): ExtractedCutoff => {
  if (!isRecord(input)) return { inputSeason: null, asOf: null, present: false };
  const raw = isRecord(input.forecastCutoff) ? input.forecastCutoff : undefined;
  const seasonCandidate = raw ? raw.inputSeason ?? raw.season ?? raw.cutoffSeason : input.forecastCutoffInputSeason;
  const asOfCandidate = raw ? raw.asOf ?? raw.asOfDate ?? raw.recordedAt : input.forecastCutoffAsOf;
  const inputSeason =
    typeof seasonCandidate === 'number' && Number.isInteger(seasonCandidate) ? seasonCandidate : null;
  const asOf = typeof asOfCandidate === 'string' && asOfCandidate.trim() !== '' ? asOfCandidate : null;
  const present = raw !== undefined || typeof input.forecastCutoffInputSeason === 'number';
  return { inputSeason, asOf, present };
};

/**
 * Fail-closed readiness gate for moving the Run 2 candidate matrix from "schema shell" to
 * "real governed Teamstate values bound." It answers, without binding anything, whether the
 * required conditions are present to bind real Teamstate values without future leakage, fake
 * pressure, fantasy-split contamination, ungoverned data, or ambiguous join semantics.
 *
 * Grounded in the candidate chain (readGovernedTeamstateInput → … → buildRun2FeatureMatrixCandidate),
 * it never binds values, never trains, never evaluates, and never runs Run 2. When any required gate
 * is unmet it reports `not_ready_for_value_binding` with explicit missing requirements / blocking
 * reasons rather than silently passing.
 */
export const assessRun2TeamstateValueBindingReadiness = (
  input: unknown,
  options: AssessRun2TeamstateValueBindingReadinessInput = {},
): ServiceResult<Run2TeamstateValueBindingReadinessReport> => {
  if (!isRecord(input)) {
    return serviceFailure({
      code: 'RUN2_VALUE_BINDING_READINESS_INPUT_INVALID',
      message: 'Teamstate value-binding readiness input must be an object.',
    });
  }

  // Ground the governed chain. A failure here means the artifact is absent/ungoverned/fabricated:
  // we surface it as a not-ready report (fail-closed), never a permissive pass.
  const candidateResult = buildRun2FeatureMatrixCandidate(input, options);
  const candidate = candidateResult.ok ? candidateResult.data : null;
  const chainErrors = candidateResult.ok ? [] : candidateResult.errors;

  const cutoff = extractForecastCutoff(input);
  const inputSeason = SEASONAL_PPR_INPUT_SEASON;
  const targetSeason = SEASONAL_PPR_TARGET_SEASON;

  const allowedColumns = candidate?.teamstate_feature_columns ?? [];
  const partialNullColumns = candidate?.partial_null_columns ?? [];
  const excludedColumns = candidate?.excluded_columns ?? [];
  const requiredJoinKeys = candidate?.teamstate_join_posture.join_keys_required ?? [
    'player_input_season_team (team_2024)',
    'input_season',
  ];
  const hasFantasyAllowed = allowedColumns.some((column) => column.toLowerCase().includes('fantasy'));
  const pressureExcluded =
    excludedColumns.some((column) => column.field === 'pressureRateAllowed') &&
    !allowedColumns.includes('pressureRateAllowed');

  const gates: Run2ValueBindingGate[] = [
    {
      gate: 'governed_teamstate_artifact_present',
      satisfied: candidate !== null,
      detail: candidate
        ? 'Governed Teamstate artifact passed the input boundary and candidate chain.'
        : `Governed Teamstate boundary/candidate chain failed: ${chainErrors.map((error) => `[${error.code}] ${error.message}`).join('; ')}`,
    },
    {
      gate: 'explicit_marker_governance',
      satisfied:
        candidate !== null &&
        candidate.teamstate_governance.status === 'governed' &&
        candidate.teamstate_governance.marker === 'explicit_marker',
      detail:
        candidate !== null
          ? 'Governance is explicit-marker governed (never inferred from path/name/build success).'
          : 'Governance could not be confirmed because the governed chain failed.',
    },
    {
      gate: 'forecast_cutoff_recorded',
      satisfied: cutoff.inputSeason !== null,
      detail:
        cutoff.inputSeason !== null
          ? `Recorded forecast cutoff input season = ${cutoff.inputSeason}.`
          : cutoff.present
            ? 'A forecastCutoff was supplied but its input season is missing/non-integer.'
            : 'No recorded forecast cutoff on the supplied artifact.',
    },
    {
      gate: 'forecast_cutoff_matches_input_season',
      satisfied: cutoff.inputSeason === inputSeason,
      detail:
        cutoff.inputSeason === inputSeason
          ? `Cutoff input season matches Run 1 input season ${inputSeason}.`
          : `Cutoff input season (${cutoff.inputSeason ?? 'none'}) must equal Run 1 input season ${inputSeason}.`,
    },
    {
      gate: 'no_target_or_future_season_cutoff',
      satisfied: cutoff.inputSeason !== null && cutoff.inputSeason < targetSeason,
      detail:
        cutoff.inputSeason !== null && cutoff.inputSeason < targetSeason
          ? `Cutoff stays before target season ${targetSeason}; no target-season Teamstate values can enter input features.`
          : `Cutoff (${cutoff.inputSeason ?? 'none'}) is target-season/future-looking; target-season Teamstate values could leak. Blocked.`,
    },
    {
      gate: 'row_grain_joinable_team_week_to_player_season',
      satisfied: candidate !== null,
      detail:
        'Teamstate team-week data aggregates to player-season via the player input-season team; alignment is established by the candidate chain.',
    },
    {
      gate: 'explicit_deterministic_join_keys',
      satisfied: requiredJoinKeys.length > 0,
      detail: `Required join keys: ${requiredJoinKeys.join(', ')}.`,
    },
    {
      gate: 'allowed_columns_from_preflight_only',
      satisfied: candidate !== null,
      detail: candidate
        ? 'Only preflight-included and partial-null Teamstate columns are eligible to bind.'
        : 'Allowed columns unavailable because the governed chain failed.',
    },
    {
      gate: 'partial_null_carry_forward_null_aware',
      satisfied: candidate !== null,
      detail: 'Partial-null columns remain null-aware and are never zero-filled when bound.',
    },
    {
      gate: 'pressure_excluded',
      satisfied: candidate !== null && pressureExcluded,
      detail: pressureExcluded
        ? 'pressureRateAllowed and any pressure feature remain excluded (unavailable/insufficient_data/deferred).'
        : 'Pressure exclusion could not be confirmed.',
    },
    {
      gate: 'fantasy_split_excluded',
      satisfied: candidate !== null && !hasFantasyAllowed,
      detail: hasFantasyAllowed
        ? 'A fantasy-split column appeared in the allowed set; blocked.'
        : 'No fantasy-split fields are eligible to bind.',
    },
    {
      gate: 'target_and_leakage_fields_blocked',
      satisfied: candidate !== null && candidate.target_leakage_status === 'no_target_derived_fields_included',
      detail:
        candidate !== null
          ? 'Target/future/leakage-named fields are excluded; the Run 1 target stays label-only.'
          : 'Target/leakage exclusion could not be confirmed.',
    },
  ];

  const unsatisfied = gates.filter((gate) => !gate.satisfied);
  const readinessStatus: Run2ValueBindingReadinessStatus =
    unsatisfied.length === 0 ? 'ready_for_value_binding' : 'not_ready_for_value_binding';

  return serviceSuccess({
    readiness_version: RUN2_TEAMSTATE_VALUE_BINDING_READINESS_VERSION,
    readiness_status: readinessStatus,
    execution_status: 'not_trained',
    evaluation_status: 'not_evaluated',
    run_2_executed: false,
    binding_status: 'not_bound_readiness_only',
    input_season: inputSeason,
    target_season: targetSeason,
    expected_teamstate_artifact: {
      kind: TEAMSTATE_GOVERNED_READINESS_KIND,
      artifact: TEAMSTATE_GOVERNED_READINESS_ARTIFACT,
      boundary_version: TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
      readiness_status: TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS,
    },
    required_governance: {
      governanceStatus: 'governed',
      governanceSource: 'explicit_marker',
      provenanceStatus: 'governed_real_data',
      note: 'Governance must be explicit-marker governed real data; never inferred from path, name, build success, or downstream need.',
    },
    required_cutoff: {
      must_record_forecast_cutoff: true,
      required_input_season: inputSeason,
      must_not_use_target_season: targetSeason,
      recorded_cutoff_input_season: cutoff.inputSeason,
      recorded_cutoff_as_of: cutoff.asOf,
    },
    required_join_keys: requiredJoinKeys,
    row_grain_alignment: {
      teamstate_grain: 'team_week',
      run1_grain: 'player_season (SeasonalPlayerObservation)',
      candidate_grain: candidate?.row_grain ?? 'player_season_forecast',
      joinable: candidate !== null,
    },
    allowed_columns: allowedColumns,
    partial_null_columns: partialNullColumns,
    excluded_columns: excludedColumns,
    pressure_status: 'unavailable_insufficient_data_deferred_excluded',
    target_leakage_status: candidate?.target_leakage_status ?? 'not_verified_chain_incomplete',
    gates,
    missing_requirements: unsatisfied.map((gate) => gate.gate),
    blocking_reasons: unsatisfied.map((gate) => gate.detail),
    teamstate_governance: candidate?.teamstate_governance ?? null,
    source_artifact_refs: candidate?.source_artifact_refs ?? [],
    validation_refs: candidate?.validation_refs ?? [],
    lineage_refs: candidate?.lineage_refs ?? [],
    candidate,
    notes: [
      'Readiness gate only: this does NOT bind Teamstate values, train, evaluate, run Run 2, or compare Run 1 vs Run 2.',
      'A not_ready_for_value_binding result must be honored fail-closed; values must never be bound from fixtures or nulls as if real.',
      'pressureRateAllowed stays unavailable/insufficient_data/deferred and excluded; partial-null columns stay null-aware (never zero-filled).',
    ],
  });
};
