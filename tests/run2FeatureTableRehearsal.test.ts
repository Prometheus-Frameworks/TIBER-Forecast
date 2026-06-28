import { describe, expect, it } from 'vitest';
import {
  RUN2_FEATURE_TABLE_REHEARSAL_VERSION,
  RUN2_FEATURE_TABLE_ROW_GRAIN,
  buildRun2FeatureInclusionPreflight,
  buildRun2FeatureTableRehearsal,
  fixtureGovernedTeamstateReadinessReport,
} from '../src/public/index.js';

describe('Run 2 feature table rehearsal', () => {
  it('is grounded in the Run 2 feature inclusion preflight and links back through the chain', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rehearsal_version).toBe(RUN2_FEATURE_TABLE_REHEARSAL_VERSION);
    expect(result.data.rehearsal_status).toBe('feature_table_shape_only');
    expect(result.data.row_grain).toBe(RUN2_FEATURE_TABLE_ROW_GRAIN);
    // Linkage: preflight -> manifest rehearsal.
    expect(result.data.preflight.preflight_version).toBeDefined();
    expect(result.data.manifest_rehearsal_ref.run_id).toBe(result.data.preflight.rehearsal.manifest.run_id);
    expect(result.data.manifest_rehearsal_ref.rehearsal_version).toBe(result.data.preflight.rehearsal.rehearsal_version);
  });

  it('uses only included/partial-null fields from the preflight as candidate feature columns', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).toEqual(result.data.preflight.included_features);
    expect(result.data.partial_null_columns).toEqual(result.data.preflight.partial_null_features);
    expect(result.data.feature_columns).toEqual(expect.arrayContaining(['teamWeekId']));
  });

  it('preserves partial-null columns as null in toy rows, never zero-filled', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.partial_null_columns).toEqual(['redZoneTdRate']);
    expect(result.data.rehearsal_rows.length).toBeGreaterThan(0);
    for (const row of result.data.rehearsal_rows) {
      expect(row.row_kind).toBe('rehearsal_shape_only_not_model_ready');
      expect(row.columns.redZoneTdRate).toBeNull();
      expect(row.columns.redZoneTdRate).not.toBe(0);
      // Feature columns are present but unpopulated (null), not fabricated.
      expect(row.columns.teamWeekId).toBeNull();
    }
  });

  it('excludes pressureRateAllowed and never emits it as a feature column or row key', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).not.toContain('pressureRateAllowed');
    expect(result.data.partial_null_columns).not.toContain('pressureRateAllowed');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['pressureRateAllowed']));
    expect(result.data.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
    for (const row of result.data.rehearsal_rows) {
      expect(Object.keys(row.columns)).not.toContain('pressureRateAllowed');
      expect(Object.keys(row.columns)).not.toContain('pressure');
    }
  });

  it('does not introduce any numeric pressure feature into the rehearsal output', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
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

  it('excludes fantasy split fields from feature columns', () => {
    const withFantasySplit = {
      ...fixtureGovernedTeamstateReadinessReport,
      fieldReadiness: [
        ...fixtureGovernedTeamstateReadinessReport.fieldReadiness,
        { field: 'fantasyPprSplit', finiteCount: 0, nullCount: 544, status: 'available' },
      ],
    };

    const result = buildRun2FeatureTableRehearsal(withFantasySplit);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).not.toContain('fantasyPprSplit');
    expect(result.data.partial_null_columns).not.toContain('fantasyPprSplit');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['fantasyPprSplit']));

    // Absent in the standard fixture.
    const baseline = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.data.feature_columns.some((column) => column.toLowerCase().includes('fantasy'))).toBe(false);
  });

  it('keeps target/label columns separate from feature columns and unjoined', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.target_columns.length).toBeGreaterThan(0);
    const targetNames = result.data.target_columns.map((column) => column.name);
    for (const targetName of targetNames) {
      expect(result.data.feature_columns).not.toContain(targetName);
      expect(result.data.partial_null_columns).not.toContain(targetName);
      for (const row of result.data.rehearsal_rows) {
        expect(Object.keys(row.columns)).not.toContain(targetName);
      }
    }
    for (const target of result.data.target_columns) {
      expect(target.role).toBe('label_only');
      expect(target.available_during_forecast).toBe(false);
      expect(target.joined).toBe(false);
    }
    expect(result.data.target_leakage_status).toBe('no_target_derived_fields_included');
  });

  it('does not let an explicit target column name leak into feature columns', () => {
    // Even if a target-named field were marked available upstream, it must not become a feature.
    const withTargetField = {
      ...fixtureGovernedTeamstateReadinessReport,
      fieldReadiness: [
        ...fixtureGovernedTeamstateReadinessReport.fieldReadiness,
        { field: 'fullSeasonPprActual', finiteCount: 544, nullCount: 0, status: 'available' },
      ],
    };

    const result = buildRun2FeatureTableRehearsal(withTargetField, { target_columns: ['fullSeasonPprActual'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).not.toContain('fullSeasonPprActual');
    for (const row of result.data.rehearsal_rows) {
      expect(Object.keys(row.columns)).not.toContain('fullSeasonPprActual');
    }
  });

  it('fails closed when the Teamstate input is ungoverned (via the existing chain)', () => {
    const { governance: _governance, ...ungoverned } = fixtureGovernedTeamstateReadinessReport;
    const result = buildRun2FeatureTableRehearsal(ungoverned);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]),
    );
  });

  it('fails closed when a fabricated numeric pressure feature is present', () => {
    const result = buildRun2FeatureTableRehearsal({
      ...fixtureGovernedTeamstateReadinessReport,
      pressureRateAllowed: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED' })]),
    );
  });

  it('fails closed on a forged preflight whose embedded rehearsal is ungoverned', () => {
    const forgedPreflight = {
      preflight_version: 'run2-feature-inclusion-preflight-v1',
      included_features: ['pressureRateAllowed'],
      partial_null_features: [],
      // Embedded rehearsal is not a real governed rehearsal, so re-derivation fails closed.
      rehearsal: { not: 'a real rehearsal' },
    };

    const result = buildRun2FeatureTableRehearsal(forgedPreflight);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('records run status as not trained / not evaluated / not executed', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.execution_status).toBe('not_trained');
    expect(result.data.evaluation_status).toBe('not_evaluated');
    expect(result.data.run_2_executed).toBe(false);
    expect(result.data.preflight.rehearsal.model_execution).toBe('not_run');
  });

  it('produces no model outputs, predictions, metrics, or evaluation results', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.preflight.rehearsal.manifest.outputs).toEqual([]);
    expect(result.data.preflight.rehearsal.manifest.model_refs).toEqual([]);
    expect(result.data).not.toHaveProperty('predictions');
    expect(result.data).not.toHaveProperty('metrics');
    expect(result.data).not.toHaveProperty('evaluation');
  });

  it('preserves Teamstate governance and source / validation / lineage refs', () => {
    const result = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.teamstate_governance).toEqual({ status: 'governed', marker: 'explicit_marker' });
    expect(result.data.source_artifact_refs).toEqual(result.data.preflight.source_artifact_refs);
    expect(result.data.validation_refs).toEqual(result.data.preflight.validation_refs);
    expect(result.data.lineage_refs).toEqual(result.data.preflight.lineage_refs);
  });

  it('accepts an already-built preflight report and re-derives the classification', () => {
    const preflight = buildRun2FeatureInclusionPreflight(fixtureGovernedTeamstateReadinessReport);
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;

    const result = buildRun2FeatureTableRehearsal(preflight.data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).toEqual(expect.arrayContaining(['teamWeekId']));
    expect(result.data.partial_null_columns).toEqual(['redZoneTdRate']);
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['pressureRateAllowed']));
  });
});
