import {
  PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION,
  validateProjectionRunManifest,
  type ProjectionRunManifestArtifact,
} from '../contracts/projectionArtifacts.js';
import type { TiberDataIdentityRef, TiberDataProjectionMissingField, TiberDataSourceDatasetRef } from '../contracts/tiberDataProjectionInput.js';
import {
  buildRunComparisonMetadataScaffold,
  readGovernedTeamstateInput,
  type ForecastTeamstateInputMetadata,
  type RunComparisonMetadataScaffold,
} from '../contracts/teamstateInput.js';
import { serviceFailure, serviceSuccess, type ServiceResult, type ServiceWarning } from '../services/result.js';

export const RUN2_MANIFEST_REHEARSAL_VERSION = 'run2-teamstate-manifest-rehearsal-v1' as const;

/**
 * The rehearsal only assembles a manifest. It never trains, evaluates, or executes Run 2,
 * so the status is fixed to a value that cannot be mistaken for a completed model run.
 */
export type Run2RehearsalStatus = 'dry_run_manifest_only';

export const RUN2_DRY_RUN_MANIFEST_WARNING_CODE = 'RUN2_DRY_RUN_MANIFEST_ONLY' as const;

const DEFAULT_RUN2_REHEARSAL_RUN_ID = 'run2-teamstate-manifest-rehearsal-dry-run';
const DEFAULT_RUN2_REHEARSAL_GENERATED_AT = '2026-06-28T00:00:00.000Z';
const DEFAULT_RUN2_INPUT_CONTRACT_VERSION = 'tiber-data-projection-input-v1';
const DEFAULT_RUN2_SCORING_CONTRACT_VERSION = 'weekly-scoring-v1';
const DEFAULT_RUN2_TIBER_DATA_SCHEMA_VERSION = 'run2-rehearsal-no-tiber-data-projection';

// Teamstate readiness statuses that mean the field is not consumed by Forecast (deferred / unavailable).
const DEFERRED_READINESS_STATUSES = new Set(['deferred_insufficient_data', 'deferred', 'unavailable']);

export interface Run2FieldDisposition {
  /** Fields Forecast can read from the governed Teamstate boundary (available or partial-null preserved). */
  included: string[];
  /** Fields Forecast deliberately omits/defers (e.g. pressureRateAllowed: insufficient data). */
  omitted_deferred: string[];
}

export interface BuildRun2ManifestRehearsalInput {
  run_id?: string;
  generated_at?: string;
  input_contract_version?: string;
  scoring_contract_version?: string;
  tiber_data_schema_version?: string;
  source_dataset_refs?: TiberDataSourceDatasetRef[];
  identity_ref?: TiberDataIdentityRef;
  missing_fields?: TiberDataProjectionMissingField[];
  notes?: string[];
}

export interface Run2ManifestRehearsalResult {
  rehearsal_version: typeof RUN2_MANIFEST_REHEARSAL_VERSION;
  /** Always `dry_run_manifest_only`: the rehearsal assembles a manifest and stops. */
  rehearsal_status: Run2RehearsalStatus;
  /** No model training/evaluation/Run 2 execution occurred. */
  model_execution: 'not_run';
  run_2_executed: false;
  teamstate_input: ForecastTeamstateInputMetadata;
  field_disposition: Run2FieldDisposition;
  run_comparison: RunComparisonMetadataScaffold;
  manifest: ProjectionRunManifestArtifact;
  notes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readinessFieldName = (entry: Record<string, unknown>): string | undefined => {
  const field = entry.field ?? entry.name ?? entry.fieldName;
  return typeof field === 'string' ? field : undefined;
};

// Splits the preserved Teamstate field-readiness into the fields Forecast includes versus the
// fields it omits/defers, driven solely by Teamstate's own readiness `status` — Forecast never
// promotes a deferred field or fabricates a value for it.
const buildFieldDisposition = (metadata: ForecastTeamstateInputMetadata): Run2FieldDisposition => {
  const included: string[] = [];
  const omittedDeferred: string[] = [];

  if (Array.isArray(metadata.field_readiness)) {
    for (const entry of metadata.field_readiness) {
      // The boundary also accepts bare string field names; those carry no status, so they
      // start as included and are reconciled against omitted_fields below.
      const field = typeof entry === 'string' ? entry : isRecord(entry) ? readinessFieldName(entry) : undefined;
      if (field === undefined) continue;
      const status = isRecord(entry) && typeof entry.status === 'string' ? entry.status : undefined;
      if (status !== undefined && DEFERRED_READINESS_STATUSES.has(status)) {
        if (!omittedDeferred.includes(field)) omittedDeferred.push(field);
      } else if (!included.includes(field)) {
        included.push(field);
      }
    }
  }

  // The boundary's own omitted_fields (e.g. pressure, pressureRateAllowed) are authoritative:
  // anything it flags as omitted must never appear as an included field.
  for (const { field } of metadata.omitted_fields) {
    const includedIndex = included.indexOf(field);
    if (includedIndex !== -1) included.splice(includedIndex, 1);
    if (!omittedDeferred.includes(field)) omittedDeferred.push(field);
  }

  return { included, omitted_deferred: omittedDeferred };
};

/**
 * Assembles a Run 2 dry-run rehearsal manifest from a governed Teamstate readiness report.
 *
 * This proves Forecast can attach governed Teamstate metadata (governance posture, source /
 * validation / lineage refs, field readiness, pressure unavailability, red-zone partial-null
 * posture) to a run manifest without performing any model training, evaluation, or Run 2
 * execution. The returned manifest carries no outputs and no model refs, and is explicitly
 * marked as a dry run so it cannot be mistaken for a completed model run.
 */
export const buildRun2ManifestRehearsal = (
  teamstateReadinessReport: unknown,
  input: BuildRun2ManifestRehearsalInput = {},
): ServiceResult<Run2ManifestRehearsalResult> => {
  const teamstateResult = readGovernedTeamstateInput(teamstateReadinessReport);
  if (!teamstateResult.ok) return teamstateResult;

  const teamstateInput = teamstateResult.data;
  const runId = input.run_id ?? DEFAULT_RUN2_REHEARSAL_RUN_ID;
  const generatedAt = input.generated_at ?? DEFAULT_RUN2_REHEARSAL_GENERATED_AT;
  const fieldDisposition = buildFieldDisposition(teamstateInput);
  const runComparison = buildRunComparisonMetadataScaffold();

  const notes = input.notes ?? [
    'Run 2 dry-run manifest rehearsal: governed Teamstate input attached, no model run performed.',
    'pressureRateAllowed remains unavailable / insufficient_data / deferred; no pressure feature was constructed or imputed.',
  ];

  const dryRunWarning: ServiceWarning = {
    code: RUN2_DRY_RUN_MANIFEST_WARNING_CODE,
    message:
      'Run 2 rehearsal manifest only: no model training, evaluation, or Run 2 execution was performed (dry_run_manifest_only).',
    details: { rehearsal_status: 'dry_run_manifest_only', model_execution: 'not_run' },
  };

  const manifest: ProjectionRunManifestArtifact = {
    artifact_type: 'projection_run_manifest',
    artifact_version: PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION,
    generated_at: generatedAt,
    run_id: runId,
    input_contract_version: input.input_contract_version ?? DEFAULT_RUN2_INPUT_CONTRACT_VERSION,
    scoring_contract_version: input.scoring_contract_version ?? DEFAULT_RUN2_SCORING_CONTRACT_VERSION,
    tiber_data_schema_version: input.tiber_data_schema_version ?? DEFAULT_RUN2_TIBER_DATA_SCHEMA_VERSION,
    source_dataset_refs: input.source_dataset_refs ?? [],
    identity_ref:
      input.identity_ref ?? {
        identity_artifact_id: 'run2-rehearsal-no-tiber-data-identity',
        version: RUN2_MANIFEST_REHEARSAL_VERSION,
      },
    model_refs: [],
    outputs: [],
    warnings: [dryRunWarning],
    missing_fields: input.missing_fields ?? [],
    teamstate_input: teamstateInput,
    run_comparison: runComparison,
  };

  const manifestValidation = validateProjectionRunManifest(manifest);
  if (!manifestValidation.ok) return serviceFailure(manifestValidation.errors);

  return serviceSuccess({
    rehearsal_version: RUN2_MANIFEST_REHEARSAL_VERSION,
    rehearsal_status: 'dry_run_manifest_only',
    model_execution: 'not_run',
    run_2_executed: false,
    teamstate_input: teamstateInput,
    field_disposition: fieldDisposition,
    run_comparison: runComparison,
    manifest: manifestValidation.data,
    notes,
  });
};
