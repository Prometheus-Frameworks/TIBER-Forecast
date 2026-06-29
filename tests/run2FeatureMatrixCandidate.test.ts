import { describe, expect, it } from 'vitest';
import {
  RUN2_FEATURE_MATRIX_CANDIDATE_VERSION,
  RUN2_FEATURE_MATRIX_ROW_GRAIN,
  SEASONAL_PPR_TARGET_DEFINITION,
  buildRun2FeatureMatrixCandidate,
  buildRun2FeatureTableRehearsal,
  fixtureGovernedTeamstateReadinessReport,
  tiberDataSeasonalPprDataset,
  type SeasonalPprDatasetDescriptor,
} from '../src/public/index.js';

const toyDataset: SeasonalPprDatasetDescriptor = {
  dataset_id: 'toy-run1-seasonal',
  dataset_version: 'toy-v1',
  governance_status: 'fixture',
  data_source: 'bundled-scaffold',
  source_dataset_refs: [],
  provenance: 'toy fixture for candidate tests',
  observations: [
    {
      player_id: 'p-0001',
      player_name: 'Toy One',
      position: 'WR',
      team_2024: 'AAA',
      games_2024: 17,
      ppr_2024: 240.5,
      receptions_2024: 95,
      targets_2024: 140,
      rush_attempts_2024: 2,
      ppr_2025_actual: 251.2,
    },
    {
      player_id: 'p-0002',
      player_name: 'Toy Two',
      position: 'RB',
      team_2024: 'BBB',
      games_2024: 15,
      ppr_2024: 180.0,
      receptions_2024: 40,
      targets_2024: 55,
      rush_attempts_2024: 240,
      ppr_2025_actual: null,
    },
  ],
};

describe('Run 2 pre-train feature matrix candidate builder', () => {
  it('is grounded in the Run 2 rehearsal/preflight chain and links back through it', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.candidate_version).toBe(RUN2_FEATURE_MATRIX_CANDIDATE_VERSION);
    expect(result.data.candidate_status).toBe('pre_train_feature_matrix_candidate');
    expect(result.data.feature_table_rehearsal.rehearsal_status).toBe('feature_table_shape_only');
    expect(result.data.feature_table_rehearsal.preflight.preflight_version).toBeDefined();
    expect(result.data.feature_table_rehearsal.manifest_rehearsal_ref.run_id).toBeDefined();
  });

  it('fails closed when the Teamstate input is ungoverned', () => {
    const { governance: _governance, ...ungoverned } = fixtureGovernedTeamstateReadinessReport;
    const result = buildRun2FeatureMatrixCandidate(ungoverned);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_GOVERNANCE_INVALID' })]),
    );
  });

  it('fails closed when a fabricated numeric pressure feature is present', () => {
    const result = buildRun2FeatureMatrixCandidate({
      ...fixtureGovernedTeamstateReadinessReport,
      pressureRateAllowed: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TEAMSTATE_INPUT_PRESSURE_NUMERIC_REJECTED' })]),
    );
  });

  it('excludes pressureRateAllowed and never emits it as a feature column or row key', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).not.toContain('pressureRateAllowed');
    expect(result.data.teamstate_feature_columns).not.toContain('pressureRateAllowed');
    expect(result.data.partial_null_columns).not.toContain('pressureRateAllowed');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['pressureRateAllowed']));
    expect(result.data.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
    for (const row of result.data.candidate_rows) {
      expect(Object.keys(row.teamstate_feature_values)).not.toContain('pressureRateAllowed');
      expect(Object.keys(row.teamstate_partial_null_values)).not.toContain('pressureRateAllowed');
    }
  });

  it('appends only preflight-included and partial-null Teamstate columns', () => {
    const candidate = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    const featureTable = buildRun2FeatureTableRehearsal(fixtureGovernedTeamstateReadinessReport, {
      target_columns: ['ppr_2025_actual'],
    });
    expect(candidate.ok && featureTable.ok).toBe(true);
    if (!candidate.ok || !featureTable.ok) return;

    expect(candidate.data.teamstate_feature_columns).toEqual(featureTable.data.feature_columns);
    expect(candidate.data.partial_null_columns).toEqual(featureTable.data.partial_null_columns);
    // The appended Teamstate columns must be exactly included ∪ partial-null.
    const appended = candidate.data.teamstate_join_posture.appended_columns;
    expect(appended).toEqual([...featureTable.data.feature_columns, ...featureTable.data.partial_null_columns]);
  });

  it('preserves partial-null Teamstate columns as null in candidate rows, never zero-filled', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.partial_null_columns).toEqual(['redZoneTdRate']);
    for (const row of result.data.candidate_rows) {
      expect(row.teamstate_partial_null_values.redZoneTdRate).toBeNull();
      expect(row.teamstate_partial_null_values.redZoneTdRate).not.toBe(0);
      // Included Teamstate columns are also unbound (fixture posture): null, not fabricated.
      for (const value of Object.values(row.teamstate_feature_values)) expect(value).toBeNull();
    }
    expect(result.data.teamstate_join_posture.join_status).toBe('fixture_rehearsal_only');
    expect(result.data.teamstate_join_posture.unbound_reason).toBeTruthy();
  });

  it('keeps the Run 1 target label-only and out of every feature group', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).not.toContain('ppr_2025_actual');
    expect(result.data.teamstate_feature_columns).not.toContain('ppr_2025_actual');
    expect(result.data.partial_null_columns).not.toContain('ppr_2025_actual');
    expect(result.data.target_columns).toEqual([
      expect.objectContaining({ name: 'ppr_2025_actual', role: 'label_only', available_during_forecast: false, joined: false }),
    ]);
    expect(result.data.target_definition).toBe(SEASONAL_PPR_TARGET_DEFINITION);

    // The target value is carried label-only per row, never inside a feature group.
    const first = result.data.candidate_rows[0];
    expect(first.target).toEqual({ column: 'ppr_2025_actual', role: 'label_only', value: 251.2 });
    expect(Object.keys(first.teamstate_feature_values)).not.toContain('ppr_2025_actual');
  });

  it('blocks target/future/leakage-named Teamstate fields from feature columns', () => {
    const withLeak = {
      ...fixtureGovernedTeamstateReadinessReport,
      fieldReadiness: [
        ...fixtureGovernedTeamstateReadinessReport.fieldReadiness,
        { field: 'nextSeasonTargetShare', finiteCount: 544, nullCount: 0, status: 'available' },
      ],
    };

    const result = buildRun2FeatureMatrixCandidate(withLeak, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feature_columns).not.toContain('nextSeasonTargetShare');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['nextSeasonTargetShare']));
  });

  it('excludes fantasy split fields and keeps them absent in the standard fixture', () => {
    const withFantasy = {
      ...fixtureGovernedTeamstateReadinessReport,
      fieldReadiness: [
        ...fixtureGovernedTeamstateReadinessReport.fieldReadiness,
        { field: 'fantasyPprSplit', finiteCount: 0, nullCount: 544, status: 'available' },
      ],
    };

    const withFantasyResult = buildRun2FeatureMatrixCandidate(withFantasy, { dataset: toyDataset });
    expect(withFantasyResult.ok).toBe(true);
    if (!withFantasyResult.ok) return;
    expect(withFantasyResult.data.feature_columns).not.toContain('fantasyPprSplit');
    expect(withFantasyResult.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['fantasyPprSplit']));

    const baseline = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.data.feature_columns.some((column) => column.toLowerCase().includes('fantasy'))).toBe(false);
  });

  it('aligns row grain with the existing Run 1 seasonal player observations', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.row_grain).toBe(RUN2_FEATURE_MATRIX_ROW_GRAIN);
    expect(result.data.row_count).toBe(toyDataset.observations.length);
    expect(result.data.candidate_rows.map((row) => row.player_id)).toEqual(
      toyDataset.observations.map((observation) => observation.player_id),
    );
    expect(result.data.run1_feature_columns).toEqual(expect.arrayContaining(['ppr_2024', 'targets_2024']));
    for (const row of result.data.candidate_rows) {
      expect(row.row_kind).toBe('pre_train_candidate_row_not_model_ready');
      expect(row.input_season).toBe(2024);
      expect(row.target_season).toBe(2025);
    }
  });

  it('preserves the same input/target season contract', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.input_season).toBe(2024);
    expect(result.data.target_season).toBe(2025);
  });

  it('records not trained / not evaluated / Run 2 not executed and preserves governance + refs', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.execution_status).toBe('not_trained');
    expect(result.data.evaluation_status).toBe('not_evaluated');
    expect(result.data.run_2_executed).toBe(false);
    expect(result.data.target_leakage_status).toBe('no_target_derived_fields_included');
    expect(result.data.teamstate_governance).toEqual({ status: 'governed', marker: 'explicit_marker' });
    expect(result.data.source_artifact_refs).toEqual(result.data.feature_table_rehearsal.source_artifact_refs);
    expect(result.data.validation_refs).toEqual(result.data.feature_table_rehearsal.validation_refs);
    expect(result.data.lineage_refs).toEqual(result.data.feature_table_rehearsal.lineage_refs);
  });

  it('produces no predictions, metrics, model refs, evaluation results, or Run 1 vs Run 2 comparison', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport, { dataset: toyDataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const key of ['predictions', 'metrics', 'model_refs', 'evaluation', 'run_comparison', 'comparison']) {
      expect(result.data).not.toHaveProperty(key);
    }
    for (const row of result.data.candidate_rows) {
      expect(row).not.toHaveProperty('predicted_ppr');
      expect(row).not.toHaveProperty('prediction');
    }
    // The grounding manifest carries no produced outputs or model refs.
    expect(result.data.feature_table_rehearsal.preflight.rehearsal.manifest.outputs).toEqual([]);
    expect(result.data.feature_table_rehearsal.preflight.rehearsal.manifest.model_refs).toEqual([]);
  });

  it('defaults to the scaffold Run 1 seasonal dataset when none is supplied', () => {
    const result = buildRun2FeatureMatrixCandidate(fixtureGovernedTeamstateReadinessReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.row_count).toBe(tiberDataSeasonalPprDataset.observations.length);
  });
});
