import { describe, expect, it } from 'vitest';
import {
  RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION,
  buildRun2FeatureInclusionPreflight,
  buildRun2ManifestRehearsal,
  fixtureGovernedTeamstateReadinessReport,
} from '../src/public/index.js';

describe('Run 2 feature inclusion preflight', () => {
  it('classifies available governed Teamstate fields as included features', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.preflight_version).toBe(RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION);
    expect(result.data.included_features).toEqual(expect.arrayContaining(['teamWeekId']));
    expect(result.data.included_features).not.toContain('pressureRateAllowed');
  });

  it('classifies red-zone partial-null fields as partial-null preserved, not zero-filled', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.partial_null_features).toEqual(['redZoneTdRate']);
    expect(result.data.included_features).not.toContain('redZoneTdRate');
    // Partial-null preserved means it is not zero-filled or promoted to a fabricated value.
    expect(result.data.rehearsal.teamstate_input.red_zone).toMatchObject({
      partial_nulls_preserved: true,
      posture: 'partial_nulls_allowed',
      partial_null_field: 'redZoneTdRate',
    });
  });

  it('excludes pressureRateAllowed with an unavailable / insufficient_data / deferred reason', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.excluded_features).toEqual(expect.arrayContaining(['pressureRateAllowed']));
    const pressureExclusion = result.data.exclusion_reasons.find((entry) => entry.field === 'pressureRateAllowed');
    expect(pressureExclusion?.disposition).toBe('pressure_unavailable_insufficient_data_deferred');
    expect(pressureExclusion?.reason).toContain('unavailable');
    expect(pressureExclusion?.reason).toContain('insufficient_data');
    expect(pressureExclusion?.reason).toContain('deferred');

    expect(result.data.pressure).toMatchObject({
      availability: 'unavailable',
      reason: 'insufficient_data',
      timing: 'deferred',
      deferred_field: 'pressureRateAllowed',
    });
  });

  it('does not introduce any numeric pressure feature into the preflight output', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
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
    expect(result.data.included_features).not.toContain('pressureRateAllowed');
    expect(result.data.partial_null_features).not.toContain('pressureRateAllowed');
  });

  it('excludes fantasy split fields and keeps them out of included/partial-null features', () => {
    const withFantasySplit = {
      ...fixtureGovernedTeamstateReadinessReport,
      fieldReadiness: [
        ...fixtureGovernedTeamstateReadinessReport.fieldReadiness,
        { field: 'fantasyPprSplit', finiteCount: 0, nullCount: 544, status: 'available' },
      ],
    };

    const result = buildRun2FeatureInclusionPreflight(withFantasySplit);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.included_features).not.toContain('fantasyPprSplit');
    expect(result.data.partial_null_features).not.toContain('fantasyPprSplit');
    expect(result.data.excluded_features).toEqual(expect.arrayContaining(['fantasyPprSplit']));
    expect(result.data.exclusion_reasons.find((entry) => entry.field === 'fantasyPprSplit')?.disposition).toBe('fantasy_split_field');

    // In the standard fixture there are no fantasy split fields, so they are simply absent.
    const baseline = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.data.included_features.some((field) => field.toLowerCase().includes('fantasy'))).toBe(false);
  });

  it('fails closed when the Teamstate input is ungoverned (via the existing boundary)', () => {
    const { governance: _governance, ...ungoverned } = fixtureGovernedTeamstateReadinessReport;
    const result = buildRun2FeatureInclusionPreflight(ungoverned);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]),
    );
  });

  it('fails closed when a fabricated numeric pressure feature is present', () => {
    const result = buildRun2FeatureInclusionPreflight({
      ...fixtureGovernedTeamstateReadinessReport,
      pressureRateAllowed: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED' })]),
    );
  });

  it('records run status as not trained / not evaluated / not executed', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.execution_status).toBe('not_trained');
    expect(result.data.evaluation_status).toBe('not_evaluated');
    expect(result.data.run_2_executed).toBe(false);
    expect(result.data.rehearsal.model_execution).toBe('not_run');
    expect(result.data.rehearsal.run_2_executed).toBe(false);
  });

  it('records an explicit, non-leaking leakage posture', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.leakage_posture.status).toBe('no_future_season_target_leakage');
    expect(result.data.leakage_posture.target_derived_fields).toEqual([]);
    expect(result.data.leakage_posture.notes.length).toBeGreaterThan(0);
  });

  it('blocks target-derived / future-season field names as leakage risks', () => {
    const withLeakyField = {
      ...fixtureGovernedTeamstateReadinessReport,
      fieldReadiness: [
        ...fixtureGovernedTeamstateReadinessReport.fieldReadiness,
        { field: 'nextSeasonFantasyTarget', finiteCount: 544, nullCount: 0, status: 'available' },
      ],
    };

    const result = buildRun2FeatureInclusionPreflight(withLeakyField);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Fantasy signal is checked first; either way the field must be excluded and never included.
    expect(result.data.included_features).not.toContain('nextSeasonFantasyTarget');
    expect(result.data.excluded_features).toEqual(expect.arrayContaining(['nextSeasonFantasyTarget']));
  });

  it('produces no model outputs, predictions, metrics, or evaluation results', () => {
    const result = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The grounding rehearsal manifest has no produced outputs or model refs.
    expect(result.data.rehearsal.manifest.outputs).toEqual([]);
    expect(result.data.rehearsal.manifest.model_refs).toEqual([]);
    // The preflight surface carries only field-eligibility metadata — no metrics/predictions keys.
    expect(result.data).not.toHaveProperty('predictions');
    expect(result.data).not.toHaveProperty('metrics');
    expect(result.data).not.toHaveProperty('evaluation');
  });

  it('fails closed on a forged rehearsal-shaped object with the right version but ungoverned metadata', () => {
    const forged = {
      rehearsal_version: 'run2-teamstate-manifest-rehearsal-v1',
      rehearsal_status: 'dry_run_manifest_only',
      model_execution: 'not_run',
      run_2_executed: false,
      // Fabricated, ungoverned Teamstate metadata that never passed the real boundary.
      teamstate_input: {
        posture: 'ungoverned',
        provenance_status: 'fabricated',
        governance: { status: 'ungoverned', marker: 'none' },
        field_readiness: [{ field: 'pressureRateAllowed', value: 0.42 }],
        pressure: { availability: 'available', reason: 'computed', timing: 'now' },
        omitted_fields: [],
        source_artifact_refs: [],
        validation_refs: [],
        lineage_refs: [],
      },
      field_disposition: { included: [], omitted_deferred: [] },
      manifest: { outputs: [], model_refs: [] },
      notes: [],
    };

    const result = buildRun2FeatureInclusionPreflight(forged);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RUN2_PREFLIGHT_REHEARSAL_INPUT_INVALID' })]),
    );
  });

  it('fails closed on a rehearsal-shaped object whose pressure posture has been tampered with', () => {
    const tampered = {
      rehearsal_version: 'run2-teamstate-manifest-rehearsal-v1',
      rehearsal_status: 'dry_run_manifest_only',
      model_execution: 'not_run',
      run_2_executed: false,
      teamstate_input: {
        posture: 'governed',
        provenance_status: 'governed_real_data',
        governance: { status: 'governed', marker: 'explicit_marker' },
        field_readiness: [{ field: 'pressureRateAllowed', finiteCount: 544, nullCount: 0, status: 'available' }],
        // Pressure flipped to available — must be rejected even though governance looks valid.
        pressure: { availability: 'available', reason: 'computed', timing: 'now', deferred_field: 'pressureRateAllowed' },
        omitted_fields: [],
        source_artifact_refs: [],
        validation_refs: [],
        lineage_refs: [],
      },
      field_disposition: { included: [], omitted_deferred: [] },
      manifest: { outputs: [], model_refs: [] },
      notes: [],
    };

    const result = buildRun2FeatureInclusionPreflight(tampered);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RUN2_PREFLIGHT_REHEARSAL_INPUT_INVALID' })]),
    );
  });

  it('accepts an already-built Run 2 manifest rehearsal result to keep the boundary chain explicit', () => {
    const rehearsal = buildRun2ManifestRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(rehearsal.ok).toBe(true);
    if (!rehearsal.ok) return;

    const result = buildRun2FeatureInclusionPreflight(rehearsal.data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rehearsal).toBe(rehearsal.data);
    expect(result.data.included_features).toEqual(expect.arrayContaining(['teamWeekId']));
    expect(result.data.excluded_features).toEqual(expect.arrayContaining(['pressureRateAllowed']));
    // Governance and refs are preserved from the source Teamstate boundary.
    expect(result.data.teamstate_governance).toEqual({ status: 'governed', marker: 'explicit_marker' });
    expect(result.data.source_artifact_refs).toEqual(rehearsal.data.teamstate_input.source_artifact_refs);
    expect(result.data.validation_refs).toEqual(rehearsal.data.teamstate_input.validation_refs);
    expect(result.data.lineage_refs).toEqual(rehearsal.data.teamstate_input.lineage_refs);
  });
});
