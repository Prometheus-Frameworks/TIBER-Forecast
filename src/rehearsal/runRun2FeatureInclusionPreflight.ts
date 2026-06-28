import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import type { ForecastTeamstateInputMetadata, TeamstatePressureReadinessMetadata } from '../contracts/teamstateInput.js';
import { serviceSuccess, type ServiceResult } from '../services/result.js';
import {
  RUN2_MANIFEST_REHEARSAL_VERSION,
  buildRun2ManifestRehearsal,
  type BuildRun2ManifestRehearsalInput,
  type Run2ManifestRehearsalResult,
} from './runRun2ManifestRehearsal.js';

export const RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION = 'run2-feature-inclusion-preflight-v1' as const;

// Keys that directly name a pressure feature value; pressure is always blocked from the feature table.
const PRESSURE_FEATURE_KEYS = new Set(['pressure', 'pressurerateallowed']);
// Teamstate readiness statuses that keep a field out of the feature table (deferred / unavailable).
const DEFERRED_READINESS_STATUSES = new Set(['deferred_insufficient_data', 'deferred', 'unavailable']);
// Statuses that admit a field but with preserved upstream nulls (never zero-filled).
const PARTIAL_NULL_READINESS_STATUSES = new Set(['partial_nulls', 'partial_null']);
const AVAILABLE_READINESS_STATUS = 'available';
// Conservative name signals for fields Forecast must never pull into the Run 2 feature table.
const FANTASY_SPLIT_NAME_SIGNAL = 'fantasy';
const TARGET_LEAKAGE_NAME_SIGNALS = ['target', 'label', 'outcome', 'future', 'nextseason'];

export type Run2FeatureExclusionDisposition =
  | 'pressure_unavailable_insufficient_data_deferred'
  | 'deferred_insufficient_data'
  | 'fantasy_split_field'
  | 'target_leakage_risk'
  | 'ungoverned_or_unknown_status';

export interface Run2FeatureExclusion {
  field: string;
  disposition: Run2FeatureExclusionDisposition;
  reason: string;
}

export interface Run2FeatureLeakagePosture {
  status: 'no_future_season_target_leakage';
  /** Fields rejected because their name signals a target-derived / future-season value (expected empty). */
  target_derived_fields: string[];
  notes: string[];
}

export interface Run2FeatureInclusionPreflightReport {
  preflight_version: typeof RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION;
  /** No model training has occurred. */
  execution_status: 'not_trained';
  /** No model evaluation has occurred. */
  evaluation_status: 'not_evaluated';
  run_2_executed: false;
  /** Governed, available Teamstate fields eligible for the future Run 2 feature table. */
  included_features: string[];
  /** Governed fields admitted with preserved partial-null posture (e.g. redZoneTdRate); never zero-filled. */
  partial_null_features: string[];
  /** Fields blocked from the feature table. */
  excluded_features: string[];
  /** Explicit per-field exclusion reasons. */
  exclusion_reasons: Run2FeatureExclusion[];
  /** Pressure posture carried through from the governed Teamstate boundary (unavailable / insufficient_data / deferred). */
  pressure: TeamstatePressureReadinessMetadata;
  leakage_posture: Run2FeatureLeakagePosture;
  teamstate_governance: ForecastTeamstateInputMetadata['governance'];
  source_governance: unknown;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  /** The Run 2 dry-run manifest rehearsal this preflight is grounded in (keeps the boundary chain explicit). */
  rehearsal: Run2ManifestRehearsalResult;
  notes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readinessFieldName = (entry: Record<string, unknown>): string | undefined => {
  const field = entry.field ?? entry.name ?? entry.fieldName;
  return typeof field === 'string' ? field : undefined;
};

const isRehearsalResult = (value: unknown): value is Run2ManifestRehearsalResult =>
  isRecord(value) && value.rehearsal_version === RUN2_MANIFEST_REHEARSAL_VERSION;

interface ClassifiedFeatures {
  included: string[];
  partial_null: string[];
  excluded: string[];
  exclusion_reasons: Run2FeatureExclusion[];
  target_derived: string[];
}

// Classifies the governed Teamstate field-readiness into feature-table dispositions. Pressure,
// fantasy-split, and target-leakage signals are always blocked; remaining fields are driven by
// Teamstate's own readiness `status`. Forecast never promotes a deferred field or fabricates a value.
const classifyFeatures = (metadata: ForecastTeamstateInputMetadata): ClassifiedFeatures => {
  const included: string[] = [];
  const partialNull: string[] = [];
  const excluded: string[] = [];
  const exclusionReasons: Run2FeatureExclusion[] = [];
  const targetDerived: string[] = [];

  const exclude = (field: string, disposition: Run2FeatureExclusionDisposition, reason: string): void => {
    if (excluded.includes(field)) return;
    excluded.push(field);
    exclusionReasons.push({ field, disposition, reason });
  };

  const pressureReason = `pressure feature blocked: ${metadata.pressure.availability} / ${metadata.pressure.reason} / ${metadata.pressure.timing}`;
  const isPressureField = (field: string): boolean =>
    PRESSURE_FEATURE_KEYS.has(field.toLowerCase()) || field === metadata.pressure.deferred_field;

  const entries = Array.isArray(metadata.field_readiness) ? metadata.field_readiness : [];
  for (const entry of entries) {
    const field = typeof entry === 'string' ? entry : isRecord(entry) ? readinessFieldName(entry) : undefined;
    if (field === undefined) continue;
    const status = isRecord(entry) && typeof entry.status === 'string' ? entry.status : undefined;
    const lower = field.toLowerCase();

    if (isPressureField(field)) {
      exclude(field, 'pressure_unavailable_insufficient_data_deferred', pressureReason);
      continue;
    }
    if (lower.includes(FANTASY_SPLIT_NAME_SIGNAL)) {
      exclude(field, 'fantasy_split_field', 'fantasy split field is not consumed by the Forecast Run 2 feature table');
      continue;
    }
    if (TARGET_LEAKAGE_NAME_SIGNALS.some((signal) => lower.includes(signal))) {
      if (!targetDerived.includes(field)) targetDerived.push(field);
      exclude(field, 'target_leakage_risk', 'field name signals a target-derived / future-season value and is blocked to avoid leakage');
      continue;
    }

    if (status !== undefined && DEFERRED_READINESS_STATUSES.has(status)) {
      exclude(field, 'deferred_insufficient_data', `excluded: Teamstate readiness status '${status}'`);
    } else if (status !== undefined && PARTIAL_NULL_READINESS_STATUSES.has(status)) {
      if (!partialNull.includes(field)) partialNull.push(field);
    } else if (status === AVAILABLE_READINESS_STATUS) {
      if (!included.includes(field)) included.push(field);
    } else if (status === undefined) {
      // Bare string entry with no per-entry status: governed-and-available unless the boundary omitted it.
      if (metadata.omitted_fields.some((omitted) => omitted.field === field)) {
        exclude(field, 'deferred_insufficient_data', 'excluded: flagged omitted/deferred by the governed Teamstate boundary');
      } else if (!included.includes(field)) {
        included.push(field);
      }
    } else {
      exclude(field, 'ungoverned_or_unknown_status', `excluded: unrecognized Teamstate readiness status '${status}'`);
    }
  }

  // The boundary's omitted_fields are authoritative (e.g. `pressure`, which need not appear in
  // fieldReadiness): anything it flags is excluded and must never remain included/partial-null.
  for (const { field, reason } of metadata.omitted_fields) {
    const includedIndex = included.indexOf(field);
    if (includedIndex !== -1) included.splice(includedIndex, 1);
    const partialIndex = partialNull.indexOf(field);
    if (partialIndex !== -1) partialNull.splice(partialIndex, 1);
    const disposition: Run2FeatureExclusionDisposition = isPressureField(field)
      ? 'pressure_unavailable_insufficient_data_deferred'
      : 'deferred_insufficient_data';
    exclude(field, disposition, reason);
  }

  return { included, partial_null: partialNull, excluded, exclusion_reasons: exclusionReasons, target_derived: targetDerived };
};

/**
 * Builds a Run 2 feature inclusion preflight report: what governed Teamstate fields would be
 * allowed into a future Run 2 feature table, what must be blocked, and why.
 *
 * It is grounded in the governed Teamstate boundary via the PR #71 dry-run manifest rehearsal:
 * pass a governed Teamstate readiness report (it is run through `buildRun2ManifestRehearsal`,
 * failing closed on ungoverned input) or an already-built rehearsal result. The report performs
 * no model training, evaluation, or Run 2 execution; it only classifies field names and carries
 * through the governed pressure-unavailable posture — it never constructs or imputes pressure and
 * never builds model-ready rows.
 */
export const buildRun2FeatureInclusionPreflight = (
  input: unknown,
  options: BuildRun2ManifestRehearsalInput = {},
): ServiceResult<Run2FeatureInclusionPreflightReport> => {
  let rehearsal: Run2ManifestRehearsalResult;
  if (isRehearsalResult(input)) {
    rehearsal = input;
  } else {
    const rehearsalResult = buildRun2ManifestRehearsal(input, options);
    if (!rehearsalResult.ok) return rehearsalResult;
    rehearsal = rehearsalResult.data;
  }

  const metadata = rehearsal.teamstate_input;
  const classified = classifyFeatures(metadata);

  return serviceSuccess({
    preflight_version: RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION,
    execution_status: 'not_trained',
    evaluation_status: 'not_evaluated',
    run_2_executed: false,
    included_features: classified.included,
    partial_null_features: classified.partial_null,
    excluded_features: classified.excluded,
    exclusion_reasons: classified.exclusion_reasons,
    pressure: metadata.pressure,
    leakage_posture: {
      status: 'no_future_season_target_leakage',
      target_derived_fields: classified.target_derived,
      notes: [
        'Preflight admits governed Teamstate input-season team-environment fields only; no target-derived or future-season fields are included.',
        'No model target is read or joined; this is a field-eligibility classification, not a feature matrix.',
      ],
    },
    teamstate_governance: metadata.governance,
    source_governance: metadata.source_governance,
    source_artifact_refs: metadata.source_artifact_refs,
    validation_refs: metadata.validation_refs,
    lineage_refs: metadata.lineage_refs,
    rehearsal,
    notes: [
      'Run 2 feature inclusion preflight: classifies which governed Teamstate fields would be eligible for a future Run 2 feature table.',
      'No model training, evaluation, or Run 2 execution occurred; pressureRateAllowed remains unavailable / insufficient_data / deferred and is blocked.',
    ],
  });
};
