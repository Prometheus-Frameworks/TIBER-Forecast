import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  FULL_MODE_GOVERNED_SOURCE_SHA256,
  nextStepForRerun,
  runRun2ComparisonRerunFromValues,
} from '../src/public/index.js';
import type { TeamstateTeamWeekValueRow } from '../src/rehearsal/runRun2GovernedTeamstateValueBinding.js';

const VALUES_REL = 'data/fixtures/teamstate/teamstate_team_week_values_2024.json';
const valuesFile = JSON.parse(readFileSync(path.resolve(process.cwd(), VALUES_REL), 'utf-8')) as {
  provenance: { governedSourceSha256: string };
  teamWeekValues: TeamstateTeamWeekValueRow[];
};

const runRerun = () => {
  const result = runRun2ComparisonRerunFromValues(valuesFile.teamWeekValues);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  return result.data;
};

const armByName = (report: ReturnType<typeof runRerun>, name: string) =>
  report.arms?.find((arm) => arm.arm === name);

describe('Run 2 comparison rerun with full-coverage Teamstate evidence (#96)', () => {
  it('uses the gate-passed full-mode evidence, not the older 3-team evidence', () => {
    expect(valuesFile.provenance.governedSourceSha256).toBe(FULL_MODE_GOVERNED_SOURCE_SHA256);
    expect(valuesFile.teamWeekValues).toHaveLength(544);
    const report = runRerun();
    expect(report.comparison_status).toBe('completed');
    // Full coverage: every candidate row binds a governed team-season aggregate (vs 8/38 before),
    // and zero Teamstate cells need imputation (vs ~93/114 in the original sparse run).
    expect(report.coverage?.teamstate_unmatched_rows).toBe(0);
    expect(report.coverage?.teamstate_matched_rows).toBe(report.coverage?.observation_count);
    expect(report.coverage?.teamstate_matched_rows ?? 0).toBeGreaterThan(8);
    expect(report.null_handling?.real_run2_imputed_null_cells).toBe(0);
    expect(report.null_handling?.shuffled_control_imputed_null_cells).toBe(0);
  });

  it('keeps the Run 1 baseline arm unchanged from the original baseline', () => {
    const report = runRerun();
    // The Run 1 box-score baseline is independent of Teamstate values, so its MAE must be the original.
    expect(armByName(report, 'run1_baseline')?.overall.mae).toBeCloseTo(35.1477, 3);
  });

  it('real and shuffled arms share the same Teamstate feature set and null policy; no pressure/fantasy', () => {
    const report = runRerun();
    const real = armByName(report, 'real_teamstate_run2');
    const shuffled = armByName(report, 'shuffled_teamstate_control');
    expect(real?.teamstate_feature_columns).toEqual(shuffled?.teamstate_feature_columns);
    expect(real?.teamstate_feature_columns).toEqual(['epaPerPlay', 'successRate', 'redZoneTdRate']);
    expect(report.null_handling?.method).toBe('train_fold_mean_imputation');
    for (const column of report.teamstate_feature_columns) {
      expect(column.toLowerCase()).not.toContain('pressure');
      expect(column.toLowerCase()).not.toContain('fantasy');
    }
    expect(report.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
  });

  it('keeps the shuffled-Teamstate sanity control intact', () => {
    const report = runRerun();
    expect(report.shuffled_ref).not.toBeNull();
    expect(report.coverage?.shuffled_rows ?? 0).toBeGreaterThan(0);
  });

  it('records the honest result without favorable spin (shuffled beat real → failed sanity control)', () => {
    const report = runRerun();
    expect(report.interpretation.signal_interpretation).toBe('failed_sanity_control');
    expect(report.interpretation.real_teamstate_improved_vs_run1).toBe(false);
    expect(report.interpretation.real_improved_vs_shuffled).toBe(false);
    expect(nextStepForRerun(report)).toBe('audit_failed_sanity_control_again');
  });

  it('is deterministic / reproducible', () => {
    expect(JSON.stringify(runRerun())).toBe(JSON.stringify(runRerun()));
  });

  it('the committed durable report matches a fresh rerun', () => {
    const committed = JSON.parse(
      readFileSync(
        path.resolve(process.cwd(), 'docs/reports/run2-teamstate-comparison-rerun-full-coverage-2026-06-29.json'),
        'utf-8',
      ),
    ) as { final_signal_interpretation: string; next_step: string; arms: unknown; deltas: unknown };
    const report = runRerun();
    expect(committed.final_signal_interpretation).toBe(report.interpretation.signal_interpretation);
    expect(committed.next_step).toBe(nextStepForRerun(report));
    expect(committed.arms).toEqual(JSON.parse(JSON.stringify(report.arms)));
    expect(committed.deltas).toEqual(JSON.parse(JSON.stringify(report.deltas)));
  });
});
