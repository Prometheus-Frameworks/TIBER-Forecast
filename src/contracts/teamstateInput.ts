import { serviceFailure, serviceSuccess, type ServiceError, type ServiceResult } from '../services/result.js';
import type { ProjectionArtifactRef } from './projectionArtifacts.js';

export const TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION = 'teamstate-forecast-input-boundary-v1' as const;
export const TEAMSTATE_GOVERNED_READINESS_KIND = 'team_week_raw_v0_governed_readiness' as const;
export const TEAMSTATE_GOVERNED_READINESS_ARTIFACT = 'team_week_raw_v0' as const;
export const TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS = 'ready_minimal_boundary' as const;
export const TEAMSTATE_PRESSURE_POSTURE = 'unavailable_insufficient_data_deferred' as const;

export type TeamstatePressureAvailability = 'unavailable';
export type TeamstatePressureReason = 'insufficient_data';
export type TeamstatePressureTiming = 'deferred';
export type TeamstateRunComparisonMode = 'run1_vs_run2_scaffold_only';

export interface TeamstatePressureReadinessMetadata {
  availability: TeamstatePressureAvailability;
  reason: TeamstatePressureReason;
  timing: TeamstatePressureTiming;
  source_posture: typeof TEAMSTATE_PRESSURE_POSTURE;
  deferred_field: 'pressureRateAllowed';
}

export interface TeamstateRedZoneReadinessMetadata {
  partial_nulls_preserved: boolean;
  posture: 'partial_nulls_allowed';
  partial_null_field: 'redZoneTdRate';
}

export interface ForecastTeamstateInputMetadata {
  boundary_version: typeof TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION;
  source_kind: typeof TEAMSTATE_GOVERNED_READINESS_KIND;
  source_artifact: typeof TEAMSTATE_GOVERNED_READINESS_ARTIFACT;
  readiness_status: typeof TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS;
  used: boolean;
  posture: 'governed';
  provenance_status: 'governed_real_data';
  governance: {
    status: 'governed';
    marker: 'explicit_marker';
  };
  source_governance: unknown;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  upstream_field_readiness: unknown;
  field_readiness: unknown;
  pressure: TeamstatePressureReadinessMetadata;
  red_zone: TeamstateRedZoneReadinessMetadata;
  omitted_fields: Array<{ field: string; reason: string }>;
}

export interface RunComparisonMetadataScaffold {
  mode: TeamstateRunComparisonMode;
  run_1_ref?: ProjectionArtifactRef;
  run_2_ref?: ProjectionArtifactRef;
  metric_comparison_status: 'not_run';
  notes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const stringRef = (artifactId: string, artifactType: string): ProjectionArtifactRef => ({
  artifact_id: artifactId,
  artifact_type: artifactType,
  uri: artifactId,
});

const sourceArtifactRefs = (sourceArtifacts: unknown): ProjectionArtifactRef[] =>
  Array.isArray(sourceArtifacts) && sourceArtifacts.every(isNonEmptyString)
    ? sourceArtifacts.map((artifactId) => stringRef(artifactId, 'teamstate_source_artifact'))
    : [];

const pathRef = (path: unknown, artifactType: string): ProjectionArtifactRef | undefined =>
  isNonEmptyString(path) ? stringRef(path, artifactType) : undefined;

const arrayIncludes = (value: unknown, expected: string): boolean => Array.isArray(value) && value.includes(expected);

const fieldReadinessIncludes = (fieldReadiness: unknown, field: string): boolean =>
  Array.isArray(fieldReadiness) &&
  fieldReadiness.some((entry) => {
    if (typeof entry === 'string') return entry === field;
    if (!isRecord(entry)) return false;
    return entry.field === field || entry.name === field || entry.fieldName === field;
  });

// Keys that directly name an actual pressure feature value. A finite number (or an
// array of numbers) held directly by one of these keys is a fabricated/real pressure
// feature value and must be rejected.
const PRESSURE_FEATURE_KEYS = new Set(['pressure', 'pressurerateallowed']);

const isPressureFeatureKey = (key: string): boolean => PRESSURE_FEATURE_KEYS.has(key.toLowerCase());

// A pressure feature is "numeric" when the value held directly by a pressure-feature key
// is a finite number, or an array that contains a finite number. Objects are treated as
// readiness/diagnostic metadata (e.g. { finiteCount, nullCount, status }) and are walked
// further rather than rejected outright.
const isNumericPressureValue = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(isNumericPressureValue);
  return false;
};

// Rejects actual pressure feature values (top-level or nested `pressure` / `pressureRateAllowed`
// holding a number) while preserving valid numeric readiness/count metadata such as
// `finiteCount`, `nullCount`, and `rowCount` that Teamstate emits inside fieldReadiness entries.
const hasNumericPressureFeature = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasNumericPressureFeature);
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, nestedValue]) => {
    if (isPressureFeatureKey(key) && isNumericPressureValue(nestedValue)) return true;
    return hasNumericPressureFeature(nestedValue);
  });
};

export const readGovernedTeamstateInput = (artifact: unknown): ServiceResult<ForecastTeamstateInputMetadata> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'TEAMSTATE_INPUT_INVALID', message: 'Teamstate input must be an object.' });
  }

  const governance = isRecord(artifact.governance) ? artifact.governance : undefined;
  const fieldReadiness = artifact.fieldReadiness;
  const validationRef = pathRef(artifact.validationReportPath, 'teamstate_validation_report');
  const lineageRef = pathRef(artifact.lineageManifestPath, 'teamstate_lineage_manifest');
  const sourceRefs = sourceArtifactRefs(artifact.sourceArtifacts);

  if (artifact.kind !== TEAMSTATE_GOVERNED_READINESS_KIND) {
    errors.push({ code: 'TEAMSTATE_INPUT_KIND_INVALID', message: `Teamstate input kind must be ${TEAMSTATE_GOVERNED_READINESS_KIND}.` });
  }
  if (artifact.artifact !== TEAMSTATE_GOVERNED_READINESS_ARTIFACT) {
    errors.push({ code: 'TEAMSTATE_INPUT_ARTIFACT_INVALID', message: `Teamstate input artifact must be ${TEAMSTATE_GOVERNED_READINESS_ARTIFACT}.` });
  }
  if (artifact.teamstateGovernedArtifact !== true) {
    errors.push({ code: 'TEAMSTATE_INPUT_GOVERNED_ARTIFACT_INVALID', message: 'Teamstate input must declare teamstateGovernedArtifact true.' });
  }
  if (artifact.provenanceStatus !== 'governed_real_data') {
    errors.push({ code: 'TEAMSTATE_INPUT_PROVENANCE_INVALID', message: 'Teamstate input must declare provenanceStatus governed_real_data.' });
  }
  if (governance?.governanceStatus !== 'governed' || governance.governanceSource !== 'explicit_marker') {
    errors.push({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID', message: 'Teamstate input must be governed through explicit_marker governance.' });
  }
  if (artifact.readinessStatus !== TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS) {
    errors.push({ code: 'TEAMSTATE_INPUT_READINESS_INVALID', message: `Teamstate input readinessStatus must be ${TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS}.` });
  }
  if (artifact.pressurePosture !== TEAMSTATE_PRESSURE_POSTURE) {
    errors.push({ code: 'TEAMSTATE_INPUT_PRESSURE_READINESS_INVALID', message: `Teamstate pressurePosture must be ${TEAMSTATE_PRESSURE_POSTURE}.` });
  }
  if (!arrayIncludes(artifact.deferredInsufficientFields, 'pressureRateAllowed')) {
    errors.push({ code: 'TEAMSTATE_INPUT_PRESSURE_FIELD_MISSING', message: 'Teamstate deferredInsufficientFields must include pressureRateAllowed.' });
  }
  if (!arrayIncludes(artifact.partialNullFields, 'redZoneTdRate')) {
    errors.push({ code: 'TEAMSTATE_INPUT_RED_ZONE_FIELD_MISSING', message: 'Teamstate partialNullFields must include redZoneTdRate.' });
  }
  const fieldReadinessHasPressure = fieldReadinessIncludes(fieldReadiness, 'pressureRateAllowed') || fieldReadinessIncludes(fieldReadiness, 'pressure');
  if (!Array.isArray(fieldReadiness) || !fieldReadinessHasPressure || !fieldReadinessIncludes(fieldReadiness, 'redZoneTdRate')) {
    errors.push({ code: 'TEAMSTATE_INPUT_FIELD_READINESS_MISSING', message: 'Teamstate fieldReadiness must include pressure/pressureRateAllowed and redZoneTdRate metadata.' });
  }
  if (sourceRefs.length === 0) {
    errors.push({ code: 'TEAMSTATE_INPUT_SOURCE_REFS_MISSING', message: 'Teamstate sourceArtifacts must include at least one source artifact reference.' });
  }
  if (validationRef === undefined) {
    errors.push({ code: 'TEAMSTATE_INPUT_VALIDATION_REF_MISSING', message: 'Teamstate validationReportPath is required.' });
  }
  if (lineageRef === undefined) {
    errors.push({ code: 'TEAMSTATE_INPUT_LINEAGE_REF_MISSING', message: 'Teamstate lineageManifestPath is required.' });
  }
  if (hasNumericPressureFeature(artifact)) {
    errors.push({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED', message: 'Teamstate pressureRateAllowed / pressure must remain unavailable / insufficient_data / deferred, never numeric or zero.' });
  }

  if (errors.length > 0) return serviceFailure(errors);

  const validationRefs = [validationRef as ProjectionArtifactRef];
  const lineageRefs = [lineageRef as ProjectionArtifactRef];

  const omitted = [
    { field: 'pressureRateAllowed', reason: 'unavailable / insufficient_data / deferred from governed Teamstate readiness report' },
    { field: 'pressure', reason: 'pressure feature is not constructed by the Forecast boundary' },
  ];

  return serviceSuccess({
    boundary_version: TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
    source_kind: TEAMSTATE_GOVERNED_READINESS_KIND,
    source_artifact: TEAMSTATE_GOVERNED_READINESS_ARTIFACT,
    readiness_status: TEAMSTATE_READY_MINIMAL_BOUNDARY_STATUS,
    used: true,
    posture: 'governed',
    provenance_status: 'governed_real_data',
    governance: { status: 'governed', marker: 'explicit_marker' },
    source_governance: governance,
    source_artifact_refs: sourceRefs,
    validation_refs: validationRefs,
    lineage_refs: lineageRefs,
    upstream_field_readiness: artifact.upstreamFieldReadiness,
    field_readiness: fieldReadiness,
    pressure: {
      availability: 'unavailable',
      reason: 'insufficient_data',
      timing: 'deferred',
      source_posture: TEAMSTATE_PRESSURE_POSTURE,
      deferred_field: 'pressureRateAllowed',
    },
    red_zone: { partial_nulls_preserved: true, posture: 'partial_nulls_allowed', partial_null_field: 'redZoneTdRate' },
    omitted_fields: omitted,
  });
};

export const buildRunComparisonMetadataScaffold = (input: {
  run_1_ref?: ProjectionArtifactRef;
  run_2_ref?: ProjectionArtifactRef;
  notes?: string[];
} = {}): RunComparisonMetadataScaffold => ({
  mode: 'run1_vs_run2_scaffold_only',
  run_1_ref: input.run_1_ref,
  run_2_ref: input.run_2_ref,
  metric_comparison_status: 'not_run',
  notes: input.notes ?? ['Run 1 vs Run 2 comparison metadata only; no metric comparison has been executed.'],
});
