import { describe, expect, it } from 'vitest';
import {
  TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
  buildRunComparisonMetadataScaffold,
  readGovernedTeamstateInput,
  validateProjectionRunManifest,
  PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION,
  type ProjectionRunManifestArtifact,
} from '../src/public/index.js';

const governedTeamstate = {
  artifact_type: 'teamstate_readiness_report',
  provenanceStatus: 'governed_real_data',
  governance: { status: 'governed', marker: 'explicit_marker', source: 'team_week_raw_v0' },
  source_artifact_refs: [{ artifact_id: 'team_week_raw_v0:2024', artifact_type: 'team_week_raw_v0', artifact_version: '2024' }],
  validation_refs: [{ artifact_id: 'teamstate-validation:2024', artifact_type: 'teamstate_validation' }],
  lineage_refs: [{ artifact_id: 'checkpoint-66', artifact_type: 'handoff_checkpoint' }],
  field_readiness: {
    pressure: { availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred' },
    red_zone: { posture: 'partial_nulls_allowed', partial_nulls_preserved: true },
    fantasy_split_fields: { accepted_only_as_upstream_nulls: true, stripped: true },
  },
  pressure: null,
};

describe('governed Teamstate Forecast input boundary', () => {
  it('accepts only governed explicit-marker Teamstate input and preserves governance references', () => {
    const result = readGovernedTeamstateInput(governedTeamstate);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      boundary_version: TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
      used: true,
      posture: 'governed',
      provenance_status: 'governed_real_data',
      governance: { status: 'governed', marker: 'explicit_marker' },
      pressure: { availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred' },
      red_zone: { partial_nulls_preserved: true, posture: 'partial_nulls_allowed' },
    });
    expect(result.data.source_artifact_refs).toEqual(governedTeamstate.source_artifact_refs);
    expect(result.data.validation_refs).toEqual(governedTeamstate.validation_refs);
    expect(result.data.lineage_refs).toEqual(governedTeamstate.lineage_refs);
    expect(result.data.omitted_fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'pressure' }), expect.objectContaining({ field: 'fantasy_split_fields' })]),
    );
  });

  it('fails closed when Teamstate governance is not explicit-marker governed real data', () => {
    const result = readGovernedTeamstateInput({ ...governedTeamstate, governance: { status: 'governed' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]));
  });

  it('rejects numeric pressure, including zero', () => {
    const result = readGovernedTeamstateInput({ ...governedTeamstate, pressure: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED' })]));
  });

  it('adds optional Run 2 Teamstate input and Run 1 vs Run 2 scaffold metadata to run manifests', () => {
    const boundary = readGovernedTeamstateInput(governedTeamstate);
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
    expect(result.data.teamstate_input?.pressure).toEqual({ availability: 'unavailable', reason: 'insufficient_data', timing: 'deferred' });
    expect(result.data.run_comparison).toMatchObject({ mode: 'run1_vs_run2_scaffold_only', metric_comparison_status: 'not_run' });
  });
});
