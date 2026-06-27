import { serviceFailure, serviceSuccess, type ServiceError, type ServiceResult } from '../services/result.js';
import type { ProjectionArtifactRef } from './projectionArtifacts.js';

export const TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION = 'teamstate-forecast-input-boundary-v1' as const;

export type TeamstatePressureAvailability = 'unavailable';
export type TeamstatePressureReason = 'insufficient_data';
export type TeamstatePressureTiming = 'deferred';
export type TeamstateRunComparisonMode = 'run1_vs_run2_scaffold_only';

export interface TeamstatePressureReadinessMetadata {
  availability: TeamstatePressureAvailability;
  reason: TeamstatePressureReason;
  timing: TeamstatePressureTiming;
}

export interface TeamstateRedZoneReadinessMetadata {
  partial_nulls_preserved: boolean;
  posture: 'partial_nulls_allowed';
}

export interface ForecastTeamstateInputMetadata {
  boundary_version: typeof TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION;
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
  field_readiness: Record<string, unknown>;
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

const isProjectionArtifactRef = (value: unknown): value is ProjectionArtifactRef =>
  isRecord(value) && typeof value.artifact_id === 'string' && value.artifact_id.trim().length > 0;

const asObjectArray = (value: unknown): ProjectionArtifactRef[] => (Array.isArray(value) ? value.filter(isProjectionArtifactRef) : []);

const get = (record: Record<string, unknown>, path: string[]): unknown =>
  path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), record);

const hasNumericPressure = (value: unknown): boolean => {
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (isRecord(value)) return Object.values(value).some(hasNumericPressure);
  if (Array.isArray(value)) return value.some(hasNumericPressure);
  return false;
};

export const readGovernedTeamstateInput = (artifact: unknown): ServiceResult<ForecastTeamstateInputMetadata> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'TEAMSTATE_INPUT_INVALID', message: 'Teamstate input must be an object.' });
  }

  const provenanceStatus = artifact.provenanceStatus ?? artifact.provenance_status;
  const governance = isRecord(artifact.governance) ? artifact.governance : undefined;
  const governanceStatus = governance?.status ?? governance?.posture;
  const governanceMarker = governance?.marker ?? governance?.mode ?? governance?.type;

  if (provenanceStatus !== 'governed_real_data') {
    errors.push({ code: 'TEAMSTATE_INPUT_PROVENANCE_INVALID', message: 'Teamstate input must declare provenanceStatus governed_real_data.' });
  }
  if (governanceStatus !== 'governed' || governanceMarker !== 'explicit_marker') {
    errors.push({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID', message: 'Teamstate input must be governed through explicit_marker governance.' });
  }

  const pressureValue = artifact.pressure ?? get(artifact, ['field_readiness', 'pressure']) ?? get(artifact, ['fieldReadiness', 'pressure']);
  if (hasNumericPressure(pressureValue)) {
    errors.push({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED', message: 'Teamstate pressure must remain unavailable / insufficient_data / deferred, never numeric or zero.' });
  }

  const readiness = (isRecord(artifact.field_readiness) ? artifact.field_readiness : isRecord(artifact.fieldReadiness) ? artifact.fieldReadiness : {}) as Record<string, unknown>;
  const pressureReadiness = isRecord(readiness.pressure) ? readiness.pressure : {};
  const availability = pressureReadiness.availability ?? pressureReadiness.status ?? artifact.pressureStatus;
  const reason = pressureReadiness.reason ?? artifact.pressureReason;
  const timing = pressureReadiness.timing ?? pressureReadiness.posture ?? artifact.pressureTiming;

  if (availability !== 'unavailable' || reason !== 'insufficient_data' || timing !== 'deferred') {
    errors.push({ code: 'TEAMSTATE_INPUT_PRESSURE_READINESS_INVALID', message: 'Teamstate pressure readiness must be unavailable / insufficient_data / deferred.' });
  }

  if (errors.length > 0) return serviceFailure(errors);

  const omitted = [
    { field: 'pressure', reason: 'unavailable / insufficient_data / deferred from governed Teamstate boundary' },
    { field: 'fantasy_split_fields', reason: 'upstream null-only fields are not consumed by Forecast boundary' },
  ];

  return serviceSuccess({
    boundary_version: TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
    used: true,
    posture: 'governed',
    provenance_status: 'governed_real_data',
    governance: { status: 'governed', marker: 'explicit_marker' },
    source_governance: governance,
    source_artifact_refs: asObjectArray(artifact.source_artifact_refs ?? artifact.sourceArtifactRefs),
    validation_refs: asObjectArray(artifact.validation_refs ?? artifact.validationRefs),
    lineage_refs: asObjectArray(artifact.lineage_refs ?? artifact.lineageRefs),
    field_readiness: readiness,
    pressure: { availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred' },
    red_zone: { partial_nulls_preserved: true, posture: 'partial_nulls_allowed' },
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
