import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUN2_OUTCOME_RECORD_VERSION,
  buildRun2TeamstateComparisonOutcome,
  fixtureGovernedTeamstateBindingArtifact,
  operatorDecisionForComparison,
  renderRun2TeamstateComparisonOutcomeMarkdown,
  runRun2TeamstateComparison,
} from '../src/public/index.js';

const GENERATED_AT = '2026-06-29';

const completedReport = () => {
  const result = runRun2TeamstateComparison(fixtureGovernedTeamstateBindingArtifact);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  expect(result.data.comparison_status).toBe('completed');
  return result.data;
};

const failClosedReport = () => {
  const { forecastCutoff: _cutoff, ...noCutoff } = fixtureGovernedTeamstateBindingArtifact;
  const result = runRun2TeamstateComparison(noCutoff);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  expect(result.data.comparison_status).toBe('fail_closed');
  return result.data;
};

describe('Run 2 Teamstate comparison outcome record', () => {
  it('is built from the #86 comparison report and copies its identity/refs', () => {
    const report = completedReport();
    const record = buildRun2TeamstateComparisonOutcome(report, { generatedAt: GENERATED_AT });
    expect(record.outcome_record_version).toBe(RUN2_OUTCOME_RECORD_VERSION);
    expect(record.repo).toBe('Prometheus-Frameworks/TIBER-Forecast');
    expect(record.generated_at).toBe(GENERATED_AT);
    expect(record.comparison_status).toBe('completed');
    expect(record.experiment_identity.comparison_version).toBe(report.comparison_version);
    expect(record.experiment_identity.input_season).toBe(2024);
    expect(record.experiment_identity.target_season).toBe(2025);
    expect(record.experiment_identity.ridge_lambda).toBe(report.ridge_lambda);
    expect(record.experiment_identity.recorded_cutoff).toEqual(report.recorded_cutoff);
    expect(record.experiment_identity.source_artifact_refs).toEqual(report.source_artifact_refs);
    expect(record.experiment_identity.validation_refs).toEqual(report.validation_refs);
    expect(record.experiment_identity.lineage_refs).toEqual(report.lineage_refs);
    expect(record.experiment_identity.linked_issues).toEqual(['#82', '#84', '#86']);
  });

  it('represents all three arms', () => {
    const record = buildRun2TeamstateComparisonOutcome(completedReport(), { generatedAt: GENERATED_AT });
    expect(record.arms).not.toBeNull();
    expect(record.arms!.map((a) => a.arm)).toEqual([
      'run1_baseline',
      'real_teamstate_run2',
      'shuffled_teamstate_control',
    ]);
  });

  it('copies deltas correctly and annotates MAE directionality', () => {
    const report = completedReport();
    const record = buildRun2TeamstateComparisonOutcome(report, { generatedAt: GENERATED_AT });
    expect(record.deltas).not.toBeNull();
    expect(record.deltas!.map((d) => d.comparison)).toEqual(report.deltas!.map((d) => d.comparison));
    record.deltas!.forEach((delta, index) => {
      const source = report.deltas![index]!;
      expect(delta.mae_delta).toBe(source.mae_delta);
      expect(delta.rmse_delta).toBe(source.rmse_delta);
      const expectedDirection = source.mae_delta < -1e-9 ? 'improvement' : source.mae_delta > 1e-9 ? 'worse' : 'no_change';
      expect(delta.mae_direction).toBe(expectedDirection);
    });
  });

  it('copies the conservative interpretation verbatim', () => {
    const report = completedReport();
    const record = buildRun2TeamstateComparisonOutcome(report, { generatedAt: GENERATED_AT });
    expect(record.interpretation).toEqual(report.interpretation);
  });

  it('summarizes the TTS impact: columns, matched/unmatched rows, null handling', () => {
    const report = completedReport();
    const record = buildRun2TeamstateComparisonOutcome(report, { generatedAt: GENERATED_AT });
    expect(record.tts_impact).not.toBeNull();
    expect(record.tts_impact!.teamstate_feature_columns).toEqual(report.teamstate_feature_columns);
    expect(record.tts_impact!.matched_rows).toBe(report.coverage!.teamstate_matched_rows);
    expect(record.tts_impact!.unmatched_rows).toBe(report.coverage!.teamstate_unmatched_rows);
    expect(record.tts_impact!.null_handling_method).toBe(report.null_handling!.method);
    expect(record.tts_impact!.signal_interpretation).toBe(report.interpretation.signal_interpretation);
    // Coverage counts are scope-consistent: matched + unmatched == observation_count (not scored).
    expect(record.tts_impact!.matched_rows + record.tts_impact!.unmatched_rows).toBe(record.tts_impact!.observation_count);
    expect(record.tts_impact!.scored_row_count).toBe(report.coverage!.scored_row_count);
    expect(record.tts_impact!.summary.join(' ').toLowerCase()).toContain('not evidence of general predictive value');
  });

  it('records a no-metric-claim decision when the comparison failed closed', () => {
    const record = buildRun2TeamstateComparisonOutcome(failClosedReport(), { generatedAt: GENERATED_AT });
    expect(record.comparison_status).toBe('fail_closed');
    expect(record.arms).toBeNull();
    expect(record.deltas).toBeNull();
    expect(record.tts_impact).toBeNull();
    expect(record.operator_decision.status).toBe('no_metric_claim_comparison_failed_closed');
    expect(record.operator_decision.no_metric_claim).toBe(true);
  });

  it('emits no fantasy-advice / product keys in the structured record', () => {
    const record = buildRun2TeamstateComparisonOutcome(completedReport(), { generatedAt: GENERATED_AT });
    const collectKeys = (value: unknown, acc: string[] = []): string[] => {
      if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, acc));
      else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          acc.push(key);
          collectKeys(nested, acc);
        }
      }
      return acc;
    };
    const keys = collectKeys(record).map((key) => key.toLowerCase());
    for (const forbidden of ['ranking', 'startsit', 'start_sit', 'advice', 'trade', 'draft', 'product']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});

describe('operatorDecisionForComparison mapping', () => {
  it('maps possible_teamstate_signal to cautious replication', () => {
    const decision = operatorDecisionForComparison('completed', 'possible_teamstate_signal');
    expect(decision.status).toBe('replicate_with_more_coverage_or_seasons');
    expect(decision.no_metric_claim).toBe(false);
  });

  it('maps both-improve and failed-control to inspect before next run', () => {
    expect(operatorDecisionForComparison('completed', 'suspicious_shuffle_also_improves').status).toBe(
      'inspect_join_or_leakage_before_next_run',
    );
    expect(operatorDecisionForComparison('completed', 'failed_sanity_control').status).toBe(
      'inspect_join_or_leakage_before_next_run',
    );
  });

  it('maps no measured lift to record-null-and-pause', () => {
    expect(operatorDecisionForComparison('completed', 'no_measured_teamstate_lift_in_this_setup').status).toBe(
      'record_null_result_and_pause',
    );
  });

  it('maps a fail-closed comparison to the no-metric-claim status', () => {
    const decision = operatorDecisionForComparison('fail_closed', 'no_metric_claim_fail_closed');
    expect(decision.status).toBe('no_metric_claim_comparison_failed_closed');
    expect(decision.no_metric_claim).toBe(true);
  });
});

describe('Run 2 outcome Markdown renderer', () => {
  it('renders the required sections with the three arms and the decision', () => {
    const record = buildRun2TeamstateComparisonOutcome(completedReport(), { generatedAt: GENERATED_AT });
    const md = renderRun2TeamstateComparisonOutcomeMarkdown(record);
    expect(md).toContain('# Run 2 Teamstate comparison outcome');
    expect(md).toContain('How the TTS artifact changed Run 1');
    expect(md).toContain('run1_baseline');
    expect(md).toContain('real_teamstate_run2');
    expect(md).toContain('shuffled_teamstate_control');
    expect(md).toContain(record.interpretation.signal_interpretation);
    expect(md).toContain(record.operator_decision.status);
    expect(md).toContain('#82, #84, #86');
  });
});

describe('committed Run 2 outcome record artifacts', () => {
  const base = path.resolve(process.cwd(), 'docs/reports/run2-teamstate-comparison-outcome-2026-06-29');
  it('the committed JSON matches a freshly-built record (doc stays in sync with #86)', () => {
    const committed = JSON.parse(readFileSync(`${base}.json`, 'utf-8'));
    const fresh = buildRun2TeamstateComparisonOutcome(completedReport(), { generatedAt: GENERATED_AT });
    expect(committed).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('the committed Markdown matches the rendered record', () => {
    const committedMd = readFileSync(`${base}.md`, 'utf-8');
    const fresh = buildRun2TeamstateComparisonOutcome(completedReport(), { generatedAt: GENERATED_AT });
    expect(committedMd).toBe(renderRun2TeamstateComparisonOutcomeMarkdown(fresh));
  });
});
