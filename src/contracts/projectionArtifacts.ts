import type { ConfidenceBand, FragilityTag, ScoringPosition, VolatilityTag } from './scoring.js';
import type {
  TiberDataIdentityRef,
  TiberDataProjectionMissingField,
  TiberDataSourceDatasetRef,
} from './tiberDataProjectionInput.js';
import { tiberDataScoringPositions } from './tiberDataProjectionInput.js';
import type { ForecastTeamstateInputMetadata, RunComparisonMetadataScaffold } from './teamstateInput.js';
import { serviceFailure, serviceSuccess, type ServiceError, type ServiceResult, type ServiceWarning } from '../services/result.js';

export const PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION = 'projection-run-manifest-v1' as const;
export const WEEKLY_PLAYER_PROJECTION_ARTIFACT_VERSION = 'weekly-player-projection-v1' as const;
export const ROS_PLAYER_PROJECTION_ARTIFACT_VERSION = 'ros-player-projection-v1' as const;
export const REPLACEMENT_BASELINES_ARTIFACT_VERSION = 'replacement-baselines-v1' as const;
export const PROJECTION_INPUT_COVERAGE_ARTIFACT_VERSION = 'projection-input-coverage-v1' as const;

export type ProjectionArtifactType =
  | 'projection_run_manifest'
  | 'weekly_player_projection'
  | 'ros_player_projection'
  | 'replacement_baselines'
  | 'projection_input_coverage';

export interface ProjectionArtifactRef {
  artifact_id: string;
  artifact_type?: ProjectionArtifactType | string;
  artifact_version?: string;
  uri?: string;
}

export interface ProjectionModelRef {
  model_id: string;
  version: string;
  uri?: string;
}

export interface ProjectionRunOutputRef extends ProjectionArtifactRef {
  artifact_type: ProjectionArtifactType | string;
  artifact_version: string;
  row_count?: number;
}

export interface ProjectionRowInputRefs {
  source_dataset_refs?: TiberDataSourceDatasetRef[];
  identity_ref?: TiberDataIdentityRef;
  model_refs?: ProjectionModelRef[];
  league_context_ref?: ProjectionArtifactRef;
  scoring_output_ref?: ProjectionArtifactRef;
}

export interface ProjectionRunManifestArtifact {
  artifact_type: 'projection_run_manifest';
  artifact_version: typeof PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION;
  generated_at: string;
  run_id: string;
  input_contract_version: string;
  scoring_contract_version: string;
  tiber_data_schema_version: string;
  source_dataset_refs: TiberDataSourceDatasetRef[];
  identity_ref: TiberDataIdentityRef;
  model_refs: ProjectionModelRef[];
  outputs: ProjectionRunOutputRef[];
  warnings: ServiceWarning[];
  missing_fields: TiberDataProjectionMissingField[];
  teamstate_input?: ForecastTeamstateInputMetadata;
  run_comparison?: RunComparisonMetadataScaffold;
}

export interface WeeklyPlayerProjectionArtifactRow {
  artifact_type: 'weekly_player_projection';
  artifact_version: typeof WEEKLY_PLAYER_PROJECTION_ARTIFACT_VERSION;
  run_id: string;
  player_id: string;
  team: string;
  position: ScoringPosition;
  season?: number;
  week?: number;
  expected_points: number;
  replacement_points: number;
  vorp: number;
  floor: number;
  median: number;
  ceiling: number;
  confidence_band: ConfidenceBand;
  volatility_tag: VolatilityTag;
  fragility_tag: FragilityTag;
  role_notes: string[];
  input_refs: ProjectionRowInputRefs;
}

export interface RosPlayerProjectionArtifactRow {
  artifact_type: 'ros_player_projection';
  artifact_version: typeof ROS_PLAYER_PROJECTION_ARTIFACT_VERSION;
  run_id: string;
  player_id: string;
  team: string;
  position: ScoringPosition;
  remaining_weeks: number;
  ros_expected_points: number;
  ros_vorp: number;
  floor: number;
  median: number;
  ceiling: number;
  confidence_band: ConfidenceBand;
  volatility_tag: VolatilityTag;
  fragility_tag: FragilityTag;
  role_notes: string[];
  input_refs: ProjectionRowInputRefs;
}

export interface ReplacementBaselineArtifactPositionBaseline {
  replacement_points: number;
  replacement_rank: number;
  sample_size: number;
}

export type ReplacementBaselineArtifactBaselines = Record<ScoringPosition, ReplacementBaselineArtifactPositionBaseline>;

export interface ReplacementBaselinesArtifact {
  artifact_type: 'replacement_baselines';
  artifact_version: typeof REPLACEMENT_BASELINES_ARTIFACT_VERSION;
  run_id: string;
  league_context_ref?: ProjectionArtifactRef;
  baselines: ReplacementBaselineArtifactBaselines;
}

export interface ProjectionInputCoverageArtifact {
  artifact_type: 'projection_input_coverage';
  artifact_version: typeof PROJECTION_INPUT_COVERAGE_ARTIFACT_VERSION;
  run_id: string;
  total_players: number;
  mapped_players: number;
  skipped_players: number;
  missing_fields: TiberDataProjectionMissingField[];
  adapter_warnings: ServiceWarning[];
}

const confidenceBands = ['LOW', 'MEDIUM', 'HIGH'] as const satisfies readonly ConfidenceBand[];
const volatilityTags = ['STABLE', 'MODERATE', 'VOLATILE'] as const satisfies readonly VolatilityTag[];
const fragilityTags = ['LOW', 'MEDIUM', 'HIGH'] as const satisfies readonly FragilityTag[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isScoringPosition = (value: unknown): value is ScoringPosition =>
  typeof value === 'string' && (tiberDataScoringPositions as readonly string[]).includes(value);

const requireArtifactIdentity = (
  artifact: Record<string, unknown>,
  expectedType: ProjectionArtifactType,
  expectedVersion: string,
  errors: ServiceError[],
): void => {
  if (artifact.artifact_type !== expectedType) {
    errors.push({
      code: 'PROJECTION_ARTIFACT_IDENTITY_INVALID',
      message: `artifact_type must be '${expectedType}'.`,
    });
  }

  if (artifact.artifact_version !== expectedVersion) {
    errors.push({
      code: 'PROJECTION_ARTIFACT_VERSION_INVALID',
      message: `artifact_version must be '${expectedVersion}'.`,
    });
  }

  if (!isNonEmptyString(artifact.run_id)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_RUN_ID_MISSING', message: 'run_id is required.' });
  }
};

const requireFiniteNumber = (artifact: Record<string, unknown>, field: string, errors: ServiceError[]): void => {
  if (!isFiniteNumber(artifact[field])) {
    errors.push({
      code: 'PROJECTION_ARTIFACT_NUMERIC_FIELD_INVALID',
      message: `${field} must be a finite number.`,
      details: { field },
    });
  }
};

const requireOptionalFiniteNumber = (artifact: Record<string, unknown>, field: string, errors: ServiceError[]): void => {
  if (artifact[field] !== undefined) requireFiniteNumber(artifact, field, errors);
};

const requireStringArray = (value: unknown, field: string, errors: ServiceError[]): void => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    errors.push({
      code: 'PROJECTION_ARTIFACT_FIELD_INVALID',
      message: `${field} must be an array of strings.`,
      details: { field },
    });
  }
};

const requireObjectArray = (value: unknown, field: string, errors: ServiceError[]): void => {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    errors.push({
      code: 'PROJECTION_ARTIFACT_FIELD_INVALID',
      message: `${field} must be an array of objects.`,
      details: { field },
    });
  }
};

const requirePlayerIdentity = (artifact: Record<string, unknown>, errors: ServiceError[]): void => {
  for (const field of ['player_id', 'team']) {
    if (!isNonEmptyString(artifact[field])) {
      errors.push({
        code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_MISSING',
        message: `${field} is required.`,
        details: { field },
      });
    }
  }

  if (!isScoringPosition(artifact.position)) {
    errors.push({
      code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_INVALID',
      message: 'position must be one of QB, RB, WR, or TE.',
      details: { field: 'position' },
    });
  }
};

const requireRangeAndTags = (artifact: Record<string, unknown>, errors: ServiceError[]): void => {
  for (const field of ['floor', 'median', 'ceiling']) requireFiniteNumber(artifact, field, errors);

  if (!confidenceBands.includes(artifact.confidence_band as ConfidenceBand)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_FIELD_INVALID', message: 'confidence_band is invalid.', details: { field: 'confidence_band' } });
  }
  if (!volatilityTags.includes(artifact.volatility_tag as VolatilityTag)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_FIELD_INVALID', message: 'volatility_tag is invalid.', details: { field: 'volatility_tag' } });
  }
  if (!fragilityTags.includes(artifact.fragility_tag as FragilityTag)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_FIELD_INVALID', message: 'fragility_tag is invalid.', details: { field: 'fragility_tag' } });
  }

  requireStringArray(artifact.role_notes, 'role_notes', errors);
  if (!isRecord(artifact.input_refs)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_MISSING', message: 'input_refs is required.', details: { field: 'input_refs' } });
  }
};

const finishValidation = <T>(artifact: unknown, errors: ServiceError[]): ServiceResult<T> => {
  if (errors.length > 0) return serviceFailure(errors);
  return serviceSuccess(artifact as T);
};

export const validateProjectionRunManifest = (artifact: unknown): ServiceResult<ProjectionRunManifestArtifact> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'PROJECTION_ARTIFACT_INVALID', message: 'Projection run manifest must be an object.' });
  }

  requireArtifactIdentity(artifact, 'projection_run_manifest', PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION, errors);
  for (const field of ['generated_at', 'input_contract_version', 'scoring_contract_version', 'tiber_data_schema_version']) {
    if (!isNonEmptyString(artifact[field])) {
      errors.push({ code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_MISSING', message: `${field} is required.`, details: { field } });
    }
  }
  requireObjectArray(artifact.source_dataset_refs, 'source_dataset_refs', errors);
  if (!isRecord(artifact.identity_ref)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_MISSING', message: 'identity_ref is required.', details: { field: 'identity_ref' } });
  }
  requireObjectArray(artifact.model_refs, 'model_refs', errors);
  requireObjectArray(artifact.outputs, 'outputs', errors);
  requireObjectArray(artifact.warnings, 'warnings', errors);
  requireObjectArray(artifact.missing_fields, 'missing_fields', errors);
  if (artifact.teamstate_input !== undefined && !isRecord(artifact.teamstate_input)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_FIELD_INVALID', message: 'teamstate_input must be an object when provided.', details: { field: 'teamstate_input' } });
  }
  if (artifact.run_comparison !== undefined && !isRecord(artifact.run_comparison)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_FIELD_INVALID', message: 'run_comparison must be an object when provided.', details: { field: 'run_comparison' } });
  }

  return finishValidation<ProjectionRunManifestArtifact>(artifact, errors);
};

export const validateWeeklyPlayerProjectionArtifactRow = (artifact: unknown): ServiceResult<WeeklyPlayerProjectionArtifactRow> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'PROJECTION_ARTIFACT_INVALID', message: 'Weekly player projection artifact row must be an object.' });
  }

  requireArtifactIdentity(artifact, 'weekly_player_projection', WEEKLY_PLAYER_PROJECTION_ARTIFACT_VERSION, errors);
  requirePlayerIdentity(artifact, errors);
  requireOptionalFiniteNumber(artifact, 'season', errors);
  requireOptionalFiniteNumber(artifact, 'week', errors);
  for (const field of ['expected_points', 'replacement_points', 'vorp']) requireFiniteNumber(artifact, field, errors);
  requireRangeAndTags(artifact, errors);

  return finishValidation<WeeklyPlayerProjectionArtifactRow>(artifact, errors);
};

export const validateRosPlayerProjectionArtifactRow = (artifact: unknown): ServiceResult<RosPlayerProjectionArtifactRow> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'PROJECTION_ARTIFACT_INVALID', message: 'ROS player projection artifact row must be an object.' });
  }

  requireArtifactIdentity(artifact, 'ros_player_projection', ROS_PLAYER_PROJECTION_ARTIFACT_VERSION, errors);
  requirePlayerIdentity(artifact, errors);
  for (const field of ['remaining_weeks', 'ros_expected_points', 'ros_vorp']) requireFiniteNumber(artifact, field, errors);
  requireRangeAndTags(artifact, errors);

  return finishValidation<RosPlayerProjectionArtifactRow>(artifact, errors);
};

export const validateReplacementBaselinesArtifact = (artifact: unknown): ServiceResult<ReplacementBaselinesArtifact> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'PROJECTION_ARTIFACT_INVALID', message: 'Replacement baselines artifact must be an object.' });
  }

  requireArtifactIdentity(artifact, 'replacement_baselines', REPLACEMENT_BASELINES_ARTIFACT_VERSION, errors);
  if (artifact.league_context_ref !== undefined && !isRecord(artifact.league_context_ref)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_FIELD_INVALID', message: 'league_context_ref must be an object when provided.', details: { field: 'league_context_ref' } });
  }

  if (!isRecord(artifact.baselines)) {
    errors.push({ code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_MISSING', message: 'baselines is required.', details: { field: 'baselines' } });
    return finishValidation<ReplacementBaselinesArtifact>(artifact, errors);
  }

  for (const position of tiberDataScoringPositions) {
    const baseline = artifact.baselines[position];
    if (!isRecord(baseline)) {
      errors.push({
        code: 'PROJECTION_ARTIFACT_REQUIRED_FIELD_MISSING',
        message: `baselines.${position} is required.`,
        details: { field: `baselines.${position}` },
      });
      continue;
    }
    for (const field of ['replacement_points', 'replacement_rank', 'sample_size']) {
      requireFiniteNumber(baseline, field, errors);
    }
  }

  return finishValidation<ReplacementBaselinesArtifact>(artifact, errors);
};

export const validateProjectionInputCoverageArtifact = (artifact: unknown): ServiceResult<ProjectionInputCoverageArtifact> => {
  const errors: ServiceError[] = [];
  if (!isRecord(artifact)) {
    return serviceFailure({ code: 'PROJECTION_ARTIFACT_INVALID', message: 'Projection input coverage artifact must be an object.' });
  }

  requireArtifactIdentity(artifact, 'projection_input_coverage', PROJECTION_INPUT_COVERAGE_ARTIFACT_VERSION, errors);
  for (const field of ['total_players', 'mapped_players', 'skipped_players']) requireFiniteNumber(artifact, field, errors);
  requireObjectArray(artifact.missing_fields, 'missing_fields', errors);
  requireObjectArray(artifact.adapter_warnings, 'adapter_warnings', errors);

  return finishValidation<ProjectionInputCoverageArtifact>(artifact, errors);
};
