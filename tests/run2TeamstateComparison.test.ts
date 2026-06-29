import { describe, expect, it } from 'vitest';
import {
  RUN2_COMPARISON_NULL_HANDLING,
  fixtureGovernedTeamstateBindingArtifact,
  interpretRun2Comparison,
  runRun2TeamstateComparison,
  runSeasonalPprBacktestService,
  tiberDataSeasonalPprDataset,
  type SeasonalPprDatasetDescriptor,
  type SeasonalPprErrorSummary,
} from '../src/public/index.js';

const readyArtifact = fixtureGovernedTeamstateBindingArtifact;

const runReady = () => {
  const result = runRun2TeamstateComparison(readyArtifact);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  return result.data;
};

const summary = (mae: number): SeasonalPprErrorSummary => ({
  sample_size: 10,
  mae,
  rmse: mae,
  correlation: 0.5,
  rank_correlation: 0.5,
});

describe('Run 2 three-arm Teamstate comparison', () => {
  it('returns a service failure only for non-object input', () => {
    const result = runRun2TeamstateComparison(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RUN2_COMPARISON_INPUT_INVALID' })]),
    );
  });

  it('fails closed (no metric claim) when governed Teamstate binding is not ready', () => {
    const { forecastCutoff: _cutoff, ...noCutoff } = readyArtifact;
    const result = runRun2TeamstateComparison(noCutoff);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparison_status).toBe('fail_closed');
    expect(result.data.arms).toBeNull();
    expect(result.data.deltas).toBeNull();
    expect(result.data.interpretation.signal_interpretation).toBe('no_metric_claim_fail_closed');
    expect(result.data.interpretation.failure_reason_if_any).toMatch(/binding not ready/);
    expect(result.data.models_trained).toBe(false);
  });

  it('fails closed when the shuffled sanity control is not ready (no team intersection)', () => {
    const dataset: SeasonalPprDatasetDescriptor = {
      dataset_id: 'no-intersection',
      dataset_version: 'v0',
      governance_status: 'fixture',
      data_source: 'bundled-scaffold',
      source_dataset_refs: [],
      provenance: 'test dataset whose teams are absent from teamWeekValues',
      observations: Array.from({ length: 6 }, (_, i) => ({
        player_id: `p-${i}`,
        player_name: `P${i}`,
        position: 'WR' as const,
        team_2024: 'ZZZ',
        games_2024: 12,
        ppr_2024: 100 + i,
        receptions_2024: 50,
        targets_2024: 70,
        rush_attempts_2024: 0,
        ppr_2025_actual: 110 + i,
      })),
    };
    const result = runRun2TeamstateComparison(readyArtifact, { dataset });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparison_status).toBe('fail_closed');
    expect(result.data.interpretation.failure_reason_if_any).toMatch(/shuffled Teamstate control not ready/);
    expect(result.data.arms).toBeNull();
  });

  it('fails closed when a Teamstate column shadows a Run 1 feature name', () => {
    // A governed artifact that exposes a Teamstate field named like a Run 1 feature (ppr_2024) would,
    // if allowed, overwrite the Run 1 value in the merged arm rows. The comparison must reject it.
    const shadowing = {
      ...readyArtifact,
      fieldReadiness: [
        ...readyArtifact.fieldReadiness,
        { field: 'ppr_2024', finiteCount: 544, nullCount: 0, status: 'available' },
      ],
      availableFields: [...readyArtifact.availableFields, 'ppr_2024'],
      teamWeekValues: readyArtifact.teamWeekValues.map((row) => ({ ...row, ppr_2024: 123 })),
    };
    const result = runRun2TeamstateComparison(shadowing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparison_status).toBe('fail_closed');
    expect(result.data.interpretation.failure_reason_if_any).toMatch(/shadows a Run 1 feature column: ppr_2024/);
    expect(result.data.arms).toBeNull();
  });

  it('completes with three arms under identical population, target, and folds', () => {
    const data = runReady();
    expect(data.comparison_status).toBe('completed');
    expect(data.models_trained).toBe(true);
    expect(data.arms).toHaveLength(3);
    const arms = data.arms!;
    expect(arms.map((a) => a.arm)).toEqual(['run1_baseline', 'real_teamstate_run2', 'shuffled_teamstate_control']);
    // Same population: every arm scored the same number of rows.
    const sizes = new Set(arms.map((a) => a.overall.sample_size));
    expect(sizes.size).toBe(1);
    expect(data.arm_parity?.population_parity_verified).toBe(true);
    expect(data.arm_parity?.population_player_count).toBe(arms[0]!.overall.sample_size);
    // Same target across arms.
    expect(data.arm_parity?.target_parity_verified).toBe(true);
    expect(data.target_definition).toContain('2025');
    expect(data.arm_parity?.target_definition).toBe(data.target_definition);
    // Same evaluation/folds.
    expect(data.arm_parity?.fold_parity_verified).toBe(true);
    expect(data.evaluation_method).toContain('LOOCV');
    expect(data.input_season).toBe(2024);
    expect(data.target_season).toBe(2025);
  });

  it('reproduces the existing Run 1 backtest metrics exactly in Arm A (faithful baseline)', () => {
    const data = runReady();
    const run1 = runSeasonalPprBacktestService(tiberDataSeasonalPprDataset, { generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(run1.ok).toBe(true);
    if (!run1.ok) return;
    const existing = run1.data.report.model.overall;
    const armA = data.arms!.find((a) => a.arm === 'run1_baseline')!.overall;
    expect(armA.sample_size).toBe(existing.sample_size);
    expect(armA.mae).toBeCloseTo(existing.mae, 9);
    expect(armA.rmse).toBeCloseTo(existing.rmse, 9);
    expect(armA.correlation ?? 0).toBeCloseTo(existing.correlation ?? 0, 9);
    expect(armA.rank_correlation ?? 0).toBeCloseTo(existing.rank_correlation ?? 0, 9);
  });

  it('keeps Run 1 feature columns unchanged and adds only real/shuffled Teamstate columns', () => {
    const data = runReady();
    const arms = data.arms!;
    const run1Arm = arms.find((a) => a.arm === 'run1_baseline')!;
    const realArm = arms.find((a) => a.arm === 'real_teamstate_run2')!;
    const shuffledArm = arms.find((a) => a.arm === 'shuffled_teamstate_control')!;

    // Arm A has no Teamstate columns; B and C share the same appended Teamstate columns.
    expect(run1Arm.teamstate_feature_columns).toEqual([]);
    expect(realArm.teamstate_feature_columns).toEqual(expect.arrayContaining(['epaPerPlay', 'successRate', 'redZoneTdRate']));
    expect(shuffledArm.teamstate_feature_columns).toEqual(realArm.teamstate_feature_columns);
    // Run 1 columns are a prefix of the Run 2 / control feature columns (unchanged + appended).
    expect(realArm.feature_columns.slice(0, run1Arm.feature_columns.length)).toEqual(run1Arm.feature_columns);
    expect(data.arm_parity?.run1_feature_values_unchanged_verified).toBe(true);
  });

  it('uses real governed Teamstate values in Run 2 and shuffled values in the control', () => {
    const data = runReady();
    expect(data.coverage?.teamstate_matched_rows).toBeGreaterThan(0);
    expect(data.coverage?.shuffled_rows).toBeGreaterThan(0);
    expect(data.shuffled_ref?.sanity_arm_status).toBe('shuffled_teamstate_values_ready');
    expect(data.bound_ref?.binding_status).toBe('governed_teamstate_values_bound');
    // Real and shuffled arms differ (different Teamstate values) -> distinct metrics here.
    const realArm = data.arms!.find((a) => a.arm === 'real_teamstate_run2')!;
    const shuffledArm = data.arms!.find((a) => a.arm === 'shuffled_teamstate_control')!;
    expect(realArm.overall.mae).not.toBe(shuffledArm.overall.mae);
  });

  it('computes the three deltas correctly from the arm metrics', () => {
    const data = runReady();
    const byArm = Object.fromEntries(data.arms!.map((a) => [a.arm, a.overall]));
    const round6 = (value: number): number => Number(value.toFixed(6));
    const realVsRun1 = data.deltas!.find((d) => d.comparison === 'real_teamstate_run2_minus_run1_baseline')!;
    expect(realVsRun1.mae_delta).toBe(round6(byArm.real_teamstate_run2!.mae - byArm.run1_baseline!.mae));
    expect(realVsRun1.improved).toBe(byArm.run1_baseline!.mae - byArm.real_teamstate_run2!.mae > 1e-9);
    const shuffledVsRun1 = data.deltas!.find((d) => d.comparison === 'shuffled_teamstate_control_minus_run1_baseline')!;
    expect(shuffledVsRun1.mae_delta).toBe(round6(byArm.shuffled_teamstate_control!.mae - byArm.run1_baseline!.mae));
    const realVsShuffled = data.deltas!.find((d) => d.comparison === 'real_teamstate_run2_minus_shuffled_teamstate_control')!;
    expect(realVsShuffled.mae_delta).toBe(round6(byArm.real_teamstate_run2!.mae - byArm.shuffled_teamstate_control!.mae));
  });

  it('keeps pressure, fantasy, and target/leakage fields out of every arm', () => {
    const data = runReady();
    expect(data.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
    expect(data.target_leakage_status).toBe('no_target_derived_fields_included');
    expect(data.excluded_columns.map((c) => c.field)).toEqual(expect.arrayContaining(['pressureRateAllowed']));
    for (const arm of data.arms!) {
      for (const column of arm.feature_columns) {
        const lower = column.toLowerCase();
        expect(lower).not.toContain('pressure');
        expect(lower).not.toContain('fantasy');
        expect(lower).not.toContain('2025');
        expect(lower === 'ppr_2025_actual').toBe(false);
      }
    }
  });

  it('handles Teamstate nulls with explicit train-fold mean imputation, never silent zero-fill', () => {
    const data = runReady();
    expect(data.null_handling?.method).toBe(RUN2_COMPARISON_NULL_HANDLING);
    expect(data.null_handling?.method).toBe('train_fold_mean_imputation');
    expect(data.null_handling?.note.toLowerCase()).toContain('never');
    // Many unmatched rows + PHI's all-null redZoneTdRate -> imputed cells are present and counted.
    expect(data.null_handling?.real_run2_imputed_null_cells).toBeGreaterThan(0);
  });

  it('emits no fantasy-advice / ranking / product output keys', () => {
    const data = runReady();
    for (const key of ['rankings', 'start_sit', 'startSit', 'advice', 'recommendations', 'trade', 'draft', 'product']) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it('reports a conservative interpretation that disclaims general predictive value', () => {
    const data = runReady();
    expect(data.interpretation.primary_metric).toBe('mae');
    expect(data.interpretation.caveats.join(' ').toLowerCase()).toContain('not proof of general predictive value');
    expect(data.notes.join(' ').toLowerCase()).toContain('no production promotion');
  });
});

describe('interpretRun2Comparison flag logic', () => {
  it('flags possible_teamstate_signal when real improves and shuffled does not', () => {
    const result = interpretRun2Comparison({ run1: summary(10), real: summary(9), shuffled: summary(10) });
    expect(result.real_teamstate_improved_vs_run1).toBe(true);
    expect(result.shuffled_improved_vs_run1).toBe(false);
    expect(result.signal_interpretation).toBe('possible_teamstate_signal');
  });

  it('flags suspicious_shuffle_also_improves when both improve (shuffled not beating real)', () => {
    const result = interpretRun2Comparison({ run1: summary(10), real: summary(9), shuffled: summary(9.5) });
    expect(result.real_teamstate_improved_vs_run1).toBe(true);
    expect(result.shuffled_improved_vs_run1).toBe(true);
    expect(result.signal_interpretation).toBe('suspicious_shuffle_also_improves');
  });

  it('flags no_measured_teamstate_lift_in_this_setup when neither improves', () => {
    const result = interpretRun2Comparison({ run1: summary(10), real: summary(10), shuffled: summary(10) });
    expect(result.signal_interpretation).toBe('no_measured_teamstate_lift_in_this_setup');
  });

  it('flags failed_sanity_control when the shuffled control beats the real arm', () => {
    const result = interpretRun2Comparison({ run1: summary(10), real: summary(10), shuffled: summary(9) });
    expect(result.signal_interpretation).toBe('failed_sanity_control');
  });
});
