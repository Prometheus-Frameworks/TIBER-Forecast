import { describe, expect, it } from 'vitest';
import {
  TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
  buildRunComparisonMetadataScaffold,
  readGovernedTeamstateInput,
  validateProjectionRunManifest,
  PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION,
  type ProjectionRunManifestArtifact,
} from '../src/public/index.js';

const governedTeamstateReadiness = {
  kind: 'team_week_raw_v0_governed_readiness',
  artifact: 'team_week_raw_v0',
  teamstateGovernedArtifact: true,
  productionReady: false,
  provenanceStatus: 'governed_real_data',
  governance: { governanceStatus: 'governed', governanceSource: 'explicit_marker' },
  sourceArtifacts: ['exports/governed/team_week_raw_v0/2024/team_week_raw_v0.jsonl'],
  validationReportPath: 'exports/governed/team_week_raw_v0/2024/validation-report.json',
  lineageManifestPath: 'exports/governed/team_week_raw_v0/2024/lineage-manifest.json',
  upstreamFieldReadiness: {
    source: 'team_week_raw_v0',
    rowCount: 544,
    teamCount: 32,
    weeks: '1-18',
  },
  rowCount: 544,
  pressurePosture: 'unavailable_insufficient_data_deferred',
  deferredFields: ['pressureRateAllowed'],
  deferredInsufficientFields: ['pressureRateAllowed'],
  partialNullFields: ['redZoneTdRate'],
  fieldReadiness: [
    { field: 'pressureRateAllowed', availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred' },
    { field: 'redZoneTdRate', availability: 'partial_null', null_posture: 'preserve_upstream_nulls' },
  ],
  readinessStatus: 'ready_minimal_boundary',
};

describe('governed Teamstate Forecast input boundary', () => {
  it('accepts the real Teamstate governed readiness shape and preserves normalized references', () => {
    const result = readGovernedTeamstateInput(governedTeamstateReadiness);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      boundary_version: TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
      source_kind: 'team_week_raw_v0_governed_readiness',
      source_artifact: 'team_week_raw_v0',
      readiness_status: 'ready_minimal_boundary',
      used: true,
      posture: 'governed',
      provenance_status: 'governed_real_data',
      governance: { status: 'governed', marker: 'explicit_marker' },
      pressure: {
        availability: 'unavailable',
        reason: 'insufficient_data',
        timing: 'deferred',
        source_posture: 'unavailable_insufficient_data_deferred',
        deferred_field: 'pressureRateAllowed',
      },
      red_zone: { partial_nulls_preserved: true, posture: 'partial_nulls_allowed', partial_null_field: 'redZoneTdRate' },
    });
    expect(result.data.source_artifact_refs).toEqual([
      {
        artifact_id: governedTeamstateReadiness.sourceArtifacts[0],
        artifact_type: 'teamstate_source_artifact',
        uri: governedTeamstateReadiness.sourceArtifacts[0],
      },
    ]);
    expect(result.data.validation_refs).toEqual([
      {
        artifact_id: governedTeamstateReadiness.validationReportPath,
        artifact_type: 'teamstate_validation_report',
        uri: governedTeamstateReadiness.validationReportPath,
      },
    ]);
    expect(result.data.lineage_refs).toEqual([
      {
        artifact_id: governedTeamstateReadiness.lineageManifestPath,
        artifact_type: 'teamstate_lineage_manifest',
        uri: governedTeamstateReadiness.lineageManifestPath,
      },
    ]);
    expect(result.data.field_readiness).toBe(governedTeamstateReadiness.fieldReadiness);
    expect(result.data.upstream_field_readiness).toBe(governedTeamstateReadiness.upstreamFieldReadiness);
    expect(result.data.omitted_fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'pressureRateAllowed' })]));
  });

  it('fails closed when the Teamstate readiness kind is missing or wrong', () => {
    const result = readGovernedTeamstateInput({ ...governedTeamstateReadiness, kind: 'invented_shape' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_KIND_INVALID' })]));
  });

  it('fails closed when the Teamstate artifact is missing or wrong', () => {
    const result = readGovernedTeamstateInput({ ...governedTeamstateReadiness, artifact: 'other_artifact' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_ARTIFACT_INVALID' })]));
  });

  it('fails closed when governance is missing or malformed', () => {
    const { governance: _governance, ...withoutGovernance } = governedTeamstateReadiness;
    const result = readGovernedTeamstateInput(withoutGovernance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]));
  });

  it('fails closed when governance is not explicit-marker governed', () => {
    const result = readGovernedTeamstateInput({
      ...governedTeamstateReadiness,
      governance: { governanceStatus: 'governed', governanceSource: 'implicit' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]));
  });

  it('fails closed when field-readiness metadata is missing', () => {
    const result = readGovernedTeamstateInput({ ...governedTeamstateReadiness, fieldReadiness: undefined });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_FIELD_READINESS_MISSING' })]));
  });

  it('fails closed when validation or lineage references are missing', () => {
    const result = readGovernedTeamstateInput({ ...governedTeamstateReadiness, validationReportPath: null, lineageManifestPath: null });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TEAMSTATE_INPUT_VALIDATION_REF_MISSING' }),
        expect.objectContaining({ code: 'TEAMSTATE_INPUT_LINEAGE_REF_MISSING' }),
      ]),
    );
  });

  it('rejects numeric pressure representations, including zero', () => {
    const result = readGovernedTeamstateInput({
      ...governedTeamstateReadiness,
      fieldReadiness: [
        { field: 'pressureRateAllowed', availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred', pressureRateAllowed: 0 },
        { field: 'redZoneTdRate', availability: 'partial_null', null_posture: 'preserve_upstream_nulls' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED' })]));
  });

  it('stores pressure as unavailable/deferred and leaves run comparison scaffold as not_run in manifests', () => {
    const boundary = readGovernedTeamstateInput(governedTeamstateReadiness);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) return;

    const manifest: ProjectionRunManifestArtifact = {
      artifact_type: 'projection_run_manifest',
      artifact_version: PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION,
      generated_at: '2026-06-27T00:00:00.000Z',
      run_id: 'future-run-2-boundary-only',
      input_contract_version: 'tiber-data-projection-input-v1',
      scoring_contract_version: 'weekly-scoring-v1',
      tiber_data_schema_version: 'fixture-schema-v1',
      source_dataset_refs: [],
      identity_ref: { identity_artifact_id: 'fixture-identity', version: 'identity-v1' },
      model_refs: [],
      outputs: [],
      warnings: [],
      missing_fields: [],
      teamstate_input: boundary.data,
      run_comparison: buildRunComparisonMetadataScaffold(),
    };

    const result = validateProjectionRunManifest(manifest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.teamstate_input?.pressure).toMatchObject({ availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred' });
    expect(result.data.run_comparison).toMatchObject({ mode: 'run1_vs_run2_scaffold_only', metric_comparison_status: 'not_run' });
  });
});
