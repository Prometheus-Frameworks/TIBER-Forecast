import { describe, expect, it } from 'vitest';
import {
  RUN2_DRY_RUN_MANIFEST_WARNING_CODE,
  RUN2_MANIFEST_REHEARSAL_VERSION,
  buildRun2ManifestRehearsal,
  fixtureGovernedTeamstateReadinessReport,
  validateProjectionRunManifest,
} from '../src/public/index.js';

describe('Run 2 Teamstate dry-run manifest rehearsal', () => {
  it('attaches a valid governed Teamstate readiness report to a Run 2 rehearsal manifest', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rehearsal_version).toBe(RUN2_MANIFEST_REHEARSAL_VERSION);
    expect(result.data.rehearsal_status).toBe('dry_run_manifest_only');
    expect(result.data.manifest.teamstate_input).toBe(result.data.teamstate_input);

    // The assembled manifest is itself a structurally valid projection run manifest.
    const manifestValidation = validateProjectionRunManifest(result.data.manifest);
    expect(manifestValidation.ok).toBe(true);
  });

  it('preserves Teamstate governance metadata', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const teamstate = result.data.manifest.teamstate_input;
    expect(teamstate?.posture).toBe('governed');
    expect(teamstate?.provenance_status).toBe('governed_real_data');
    expect(teamstate?.governance).toEqual({ status: 'governed', marker: 'explicit_marker' });
    expect(teamstate?.source_governance).toMatchObject({
      governanceStatus: 'governed',
      governanceSource: 'explicit_marker',
    });
  });

  it('preserves source / validation / lineage refs', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const teamstate = result.data.manifest.teamstate_input;
    expect(teamstate?.source_artifact_refs).toEqual([
      {
        artifact_id: fixtureGovernedTeamstateReadinessReport.sourceArtifacts[0],
        artifact_type: 'teamstate_source_artifact',
        uri: fixtureGovernedTeamstateReadinessReport.sourceArtifacts[0],
      },
    ]);
    expect(teamstate?.validation_refs).toEqual([
      {
        artifact_id: fixtureGovernedTeamstateReadinessReport.validationReportPath,
        artifact_type: 'teamstate_validation_report',
        uri: fixtureGovernedTeamstateReadinessReport.validationReportPath,
      },
    ]);
    expect(teamstate?.lineage_refs).toEqual([
      {
        artifact_id: fixtureGovernedTeamstateReadinessReport.lineageManifestPath,
        artifact_type: 'teamstate_lineage_manifest',
        uri: fixtureGovernedTeamstateReadinessReport.lineageManifestPath,
      },
    ]);
  });

  it('preserves field-readiness posture and records included vs omitted/deferred fields', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Field readiness array is preserved verbatim from the governed boundary.
    expect(result.data.manifest.teamstate_input?.field_readiness).toBe(fixtureGovernedTeamstateReadinessReport.fieldReadiness);

    // Included = available + partial-null preserved; omitted/deferred = insufficient-data fields.
    expect(result.data.field_disposition.included).toEqual(expect.arrayContaining(['teamWeekId', 'redZoneTdRate']));
    expect(result.data.field_disposition.included).not.toContain('pressureRateAllowed');
    expect(result.data.field_disposition.omitted_deferred).toEqual(expect.arrayContaining(['pressureRateAllowed']));
  });

  it('records pressureRateAllowed as unavailable / insufficient_data / deferred', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.manifest.teamstate_input?.pressure).toMatchObject({
      availability: 'unavailable',
      reason: 'insufficient_data',
      timing: 'deferred',
      deferred_field: 'pressureRateAllowed',
    });
  });

  it('does not introduce a numeric pressure feature anywhere in the rehearsal output', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pressureFeatureKeys = new Set(['pressure', 'pressurerateallowed']);
    const containsNumericPressure = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(containsNumericPressure);
      if (typeof value !== 'object' || value === null) return false;
      return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
        if (pressureFeatureKeys.has(key.toLowerCase()) && typeof nested === 'number' && Number.isFinite(nested)) return true;
        return containsNumericPressure(nested);
      });
    };

    expect(containsNumericPressure(result.data)).toBe(false);
  });

  it('rejects a fabricated numeric pressure feature instead of assembling a manifest', () => {
    const result = buildRun2ManifestRehearsal({
      ...fixtureGovernedTeamstateReadinessReport,
      pressureRateAllowed: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED' })]),
    );
  });

  it('preserves red-zone partial-null posture', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.manifest.teamstate_input?.red_zone).toEqual({
      partial_nulls_preserved: true,
      posture: 'partial_nulls_allowed',
      partial_null_field: 'redZoneTdRate',
    });
  });

  it('keeps the run comparison scaffold metadata-only with metric_comparison_status not_run', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.run_comparison).toMatchObject({
      mode: 'run1_vs_run2_scaffold_only',
      metric_comparison_status: 'not_run',
    });
    expect(result.data.manifest.run_comparison).toMatchObject({ metric_comparison_status: 'not_run' });
  });

  it('produces no model execution output and cannot look like a completed model run', () => {
    const result = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.model_execution).toBe('not_run');
    expect(result.data.run_2_executed).toBe(false);
    // No produced outputs and no model refs: nothing here represents a completed run.
    expect(result.data.manifest.outputs).toEqual([]);
    expect(result.data.manifest.model_refs).toEqual([]);
    expect(result.data.manifest.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: RUN2_DRY_RUN_MANIFEST_WARNING_CODE })]),
    );
  });

  it('fails closed when the Teamstate input is not governed', () => {
    const { governance: _governance, ...withoutGovernance } = fixtureGovernedTeamstateReadinessReport;
    const result = buildRun2ManifestRehearsal(withoutGovernance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]),
    );
  });
});
