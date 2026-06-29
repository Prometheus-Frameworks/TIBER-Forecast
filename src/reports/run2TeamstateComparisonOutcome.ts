import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import type { Run2RecordedCutoff } from '../rehearsal/runRun2GovernedTeamstateValueBinding.js';
import type {
  Run2ArmMetrics,
  Run2ComparisonInterpretation,
  Run2MetricDelta,
  Run2SignalInterpretation,
  Run2TeamstateComparisonReport,
} from '../rehearsal/runRun2TeamstateComparison.js';

export const RUN2_OUTCOME_RECORD_VERSION = 'run2-teamstate-comparison-outcome-v1' as const;
export const RUN2_OUTCOME_REPO = 'Prometheus-Frameworks/TIBER-Forecast' as const;
const DELTA_EPSILON = 1e-9;

/**
 * Operator decision statuses. The first five are the issue's allowed next-step statuses for a
 * completed comparison; the last is reserved for a fail-closed comparison where no metric claim is
 * possible (so the record never forces a metric-based decision onto a no-claim result).
 */
export type Run2OperatorDecisionStatus =
  | 'replicate_with_more_coverage_or_seasons'
  | 'expand_teamstate_feature_coverage'
  | 'inspect_join_or_leakage_before_next_run'
  | 'record_null_result_and_pause'
  | 'ready_for_next_controlled_experiment'
  | 'no_metric_claim_comparison_failed_closed';

export const RUN2_OPERATOR_DECISION_STATUSES: readonly Run2OperatorDecisionStatus[] = [
  'replicate_with_more_coverage_or_seasons',
  'expand_teamstate_feature_coverage',
  'inspect_join_or_leakage_before_next_run',
  'record_null_result_and_pause',
  'ready_for_next_controlled_experiment',
  'no_metric_claim_comparison_failed_closed',
];

export type Run2MaeDirection = 'improvement' | 'worse' | 'no_change';

export interface Run2OutcomeDelta extends Run2MetricDelta {
  /** Plain directionality for MAE: negative delta = improvement (lower error), positive = worse. */
  mae_direction: Run2MaeDirection;
}

export interface Run2OutcomeExperimentIdentity {
  repo: typeof RUN2_OUTCOME_REPO;
  comparison_version: string;
  input_season: number;
  target_season: number;
  target_definition: string;
  evaluation_method: string;
  model_family: 'seasonal-ppr-ridge';
  ridge_lambda: number;
  null_handling_method: string | null;
  recorded_cutoff: Run2RecordedCutoff | null;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  teamstate_governance: unknown;
  linked_issues: readonly string[];
}

export interface Run2OutcomeTtsImpact {
  teamstate_feature_columns: string[];
  /** Observation-scoped counts (matched + unmatched = observation_count). */
  observation_count: number;
  matched_rows: number;
  unmatched_rows: number;
  /** Rows with a usable 2025 actual that formed the scored metric population. */
  scored_row_count: number;
  null_handling_method: string;
  real_vs_run1_mae_direction: Run2MaeDirection;
  shuffled_vs_run1_mae_direction: Run2MaeDirection;
  real_vs_shuffled_mae_direction: Run2MaeDirection;
  signal_interpretation: Run2SignalInterpretation;
  summary: string[];
}

export interface Run2OperatorDecision {
  status: Run2OperatorDecisionStatus;
  rationale: string;
  no_metric_claim: boolean;
  allowed_statuses: readonly Run2OperatorDecisionStatus[];
}

export interface Run2OutcomeRecord {
  outcome_record_version: typeof RUN2_OUTCOME_RECORD_VERSION;
  repo: typeof RUN2_OUTCOME_REPO;
  generated_at: string;
  comparison_status: Run2TeamstateComparisonReport['comparison_status'];
  experiment_identity: Run2OutcomeExperimentIdentity;
  arms: Run2ArmMetrics[] | null;
  deltas: Run2OutcomeDelta[] | null;
  tts_impact: Run2OutcomeTtsImpact | null;
  interpretation: Run2ComparisonInterpretation;
  operator_decision: Run2OperatorDecision;
  notes: string[];
}

const maeDirection = (maeDelta: number): Run2MaeDirection => {
  if (maeDelta < -DELTA_EPSILON) return 'improvement';
  if (maeDelta > DELTA_EPSILON) return 'worse';
  return 'no_change';
};

/**
 * Maps a completed comparison's signal interpretation to a conservative operator next step, per the
 * issue's decision rules. A fail-closed comparison yields the no-metric-claim status. Pure and exported
 * for testing; this never tunes the model or makes a predictive claim.
 */
export const operatorDecisionForComparison = (
  comparisonStatus: Run2TeamstateComparisonReport['comparison_status'],
  signal: Run2SignalInterpretation,
): Run2OperatorDecision => {
  if (comparisonStatus === 'fail_closed' || signal === 'no_metric_claim_fail_closed') {
    return {
      status: 'no_metric_claim_comparison_failed_closed',
      rationale: 'The comparison failed closed (readiness/parity/leakage guardrail). No metric claim can be made; resolve the fail-closed condition before any follow-up.',
      no_metric_claim: true,
      allowed_statuses: RUN2_OPERATOR_DECISION_STATUSES,
    };
  }
  switch (signal) {
    case 'possible_teamstate_signal':
      return {
        status: 'replicate_with_more_coverage_or_seasons',
        rationale: 'Real Teamstate improved while the shuffled control did not. Treat as a single-experiment hint only and replicate with more coverage/seasons; make no product or general predictive claim.',
        no_metric_claim: false,
        allowed_statuses: RUN2_OPERATOR_DECISION_STATUSES,
      };
    case 'suspicious_shuffle_also_improves':
      return {
        status: 'inspect_join_or_leakage_before_next_run',
        rationale: 'Both real and shuffled arms improved vs Run 1, so any lift is likely structural/spurious. Inspect join logic, leakage, and model behavior before adding features or running again.',
        no_metric_claim: false,
        allowed_statuses: RUN2_OPERATOR_DECISION_STATUSES,
      };
    case 'failed_sanity_control':
      return {
        status: 'inspect_join_or_leakage_before_next_run',
        rationale: 'The shuffled control beat the real arm: the sanity control failed. Do not attribute anything to Teamstate; investigate join/leakage/variance before any follow-up.',
        no_metric_claim: false,
        allowed_statuses: RUN2_OPERATOR_DECISION_STATUSES,
      };
    case 'no_measured_teamstate_lift_in_this_setup':
    default:
      return {
        status: 'record_null_result_and_pause',
        rationale: 'No measured Teamstate lift over Run 1 in this controlled setup. Record the null result and pause; separately decide whether broader Teamstate feature coverage or more seasons are warranted before another run.',
        no_metric_claim: false,
        allowed_statuses: RUN2_OPERATOR_DECISION_STATUSES,
      };
  }
};

const findDelta = (deltas: Run2MetricDelta[], comparison: string): Run2MetricDelta | undefined =>
  deltas.find((delta) => delta.comparison === comparison);

const buildTtsImpact = (report: Run2TeamstateComparisonReport): Run2OutcomeTtsImpact | null => {
  if (report.comparison_status !== 'completed' || report.arms === null || report.deltas === null || report.coverage === null) {
    return null;
  }
  const realVsRun1 = findDelta(report.deltas, 'real_teamstate_run2_minus_run1_baseline');
  const shuffledVsRun1 = findDelta(report.deltas, 'shuffled_teamstate_control_minus_run1_baseline');
  const realVsShuffled = findDelta(report.deltas, 'real_teamstate_run2_minus_shuffled_teamstate_control');
  const realDir = realVsRun1 ? maeDirection(realVsRun1.mae_delta) : 'no_change';
  const shuffledDir = shuffledVsRun1 ? maeDirection(shuffledVsRun1.mae_delta) : 'no_change';
  const realVsShuffledDir = realVsShuffled ? maeDirection(realVsShuffled.mae_delta) : 'no_change';

  const directionWord = (direction: Run2MaeDirection): string =>
    direction === 'improvement' ? 'lowered error (improved)' : direction === 'worse' ? 'raised error (worsened)' : 'did not change error';

  return {
    teamstate_feature_columns: report.teamstate_feature_columns,
    observation_count: report.coverage.observation_count,
    matched_rows: report.coverage.teamstate_matched_rows,
    unmatched_rows: report.coverage.teamstate_unmatched_rows,
    scored_row_count: report.coverage.scored_row_count,
    null_handling_method: report.null_handling?.method ?? 'unknown',
    real_vs_run1_mae_direction: realDir,
    shuffled_vs_run1_mae_direction: shuffledDir,
    real_vs_shuffled_mae_direction: realVsShuffledDir,
    signal_interpretation: report.interpretation.signal_interpretation,
    summary: [
      `Added Teamstate/TTS feature columns: ${report.teamstate_feature_columns.join(', ') || '(none)'}.`,
      `Of ${report.coverage.observation_count} observations, ${report.coverage.teamstate_matched_rows} had matched governed Teamstate values and ${report.coverage.teamstate_unmatched_rows} were unmatched and kept null (null-preserved); ${report.coverage.scored_row_count} rows had a usable 2025 actual and formed the scored metric population.`,
      `Null/partial-null Teamstate values were handled by ${report.null_handling?.method ?? 'the documented method'} (non-leaky; never silent raw zero-fill).`,
      `Under the primary MAE metric, real governed Teamstate ${directionWord(realDir)} vs Run 1; the shuffled control ${directionWord(shuffledDir)} vs Run 1.`,
      `Conservative reading: ${report.interpretation.signal_interpretation}. This is one controlled experiment on the current (fixture/scaffold-scale) coverage and is NOT evidence of general predictive value.`,
    ],
  };
};

/**
 * Builds the durable Run 2 outcome/decision record from a #86 comparison report. Pure: it copies the
 * three-arm metrics, deltas (with explicit MAE directionality), the conservative interpretation, and
 * the governance/cutoff/provenance refs verbatim, then derives a conservative operator next step. It
 * does NOT re-run, tune, or re-interpret the model — it only records what the comparison reported.
 */
export const buildRun2TeamstateComparisonOutcome = (
  report: Run2TeamstateComparisonReport,
  options: { generatedAt: string },
): Run2OutcomeRecord => {
  const deltas: Run2OutcomeDelta[] | null =
    report.deltas === null ? null : report.deltas.map((delta) => ({ ...delta, mae_direction: maeDirection(delta.mae_delta) }));

  return {
    outcome_record_version: RUN2_OUTCOME_RECORD_VERSION,
    repo: RUN2_OUTCOME_REPO,
    generated_at: options.generatedAt,
    comparison_status: report.comparison_status,
    experiment_identity: {
      repo: RUN2_OUTCOME_REPO,
      comparison_version: report.comparison_version,
      input_season: report.input_season,
      target_season: report.target_season,
      target_definition: report.target_definition,
      evaluation_method: report.evaluation_method,
      model_family: 'seasonal-ppr-ridge',
      ridge_lambda: report.ridge_lambda,
      null_handling_method: report.null_handling?.method ?? null,
      recorded_cutoff: report.recorded_cutoff,
      source_artifact_refs: report.source_artifact_refs,
      validation_refs: report.validation_refs,
      lineage_refs: report.lineage_refs,
      teamstate_governance: report.teamstate_governance,
      linked_issues: ['#82', '#84', '#86'],
    },
    arms: report.arms,
    deltas,
    tts_impact: buildTtsImpact(report),
    interpretation: report.interpretation,
    operator_decision: operatorDecisionForComparison(report.comparison_status, report.interpretation.signal_interpretation),
    notes: [
      'Durable checkpoint/decision record for the Run 2 three-arm comparison (#86); it records an outcome and does NOT tune the model, add features, or change data/folds/target/eval/null-handling.',
      'No fantasy advice, player rankings, start/sit, trade, draft, or product claims; no claim that Teamstate is proven predictive in general.',
      'If comparison_status is fail_closed, no metric claim can be made.',
    ],
  };
};

const num = (value: number | null, digits = 4): string => (value == null ? 'n/a' : value.toFixed(digits));

/** Renders the durable outcome record as an operator-facing Markdown checkpoint. Pure (no I/O). */
export const renderRun2TeamstateComparisonOutcomeMarkdown = (record: Run2OutcomeRecord): string => {
  const id = record.experiment_identity;
  const lines: string[] = [];
  lines.push('# Run 2 Teamstate comparison outcome');
  lines.push('');
  lines.push(`_Generated ${record.generated_at} • record ${record.outcome_record_version} • status: **${record.comparison_status}**_`);
  lines.push('');
  lines.push(
    'This is a durable checkpoint of one controlled experiment: how the governed TTS / Teamstate artifact changed the existing Run 1 baseline, with a shuffled-Teamstate control. It records an outcome and a next-step decision — it does **not** tune the model, add features, or change the data/folds/target/evaluation/null-handling. It is **not** proof of general predictive value and contains no fantasy advice or product claims.',
  );
  lines.push('');

  lines.push('## 1. Experiment identity');
  lines.push('');
  lines.push(`- Repo: \`${id.repo}\``);
  lines.push(`- Comparison version: \`${id.comparison_version}\``);
  lines.push(`- Input season: ${id.input_season} → target season: ${id.target_season}`);
  lines.push(`- Target definition: ${id.target_definition}`);
  lines.push(`- Evaluation method: ${id.evaluation_method}`);
  lines.push(`- Model family: \`${id.model_family}\` (ridge λ=${id.ridge_lambda})`);
  lines.push(`- Null handling: \`${id.null_handling_method ?? 'n/a'}\``);
  lines.push(`- Recorded forecast cutoff: input season \`${id.recorded_cutoff?.input_season ?? 'n/a'}\`, as-of \`${id.recorded_cutoff?.as_of ?? 'n/a'}\` (target-season start \`${id.recorded_cutoff?.target_season_start ?? 'n/a'}\`; source generated-at \`${id.recorded_cutoff?.source_generated_at ?? 'n/a'}\`)`);
  lines.push(`- Source artifact refs: ${id.source_artifact_refs.map((ref) => `\`${ref.artifact_id}\``).join(', ') || '(none)'}`);
  lines.push(`- Validation refs: ${id.validation_refs.map((ref) => `\`${ref.artifact_id}\``).join(', ') || '(none)'}`);
  lines.push(`- Lineage refs: ${id.lineage_refs.map((ref) => `\`${ref.artifact_id}\``).join(', ') || '(none)'}`);
  lines.push(`- Linked issues/PRs: ${id.linked_issues.join(', ')}`);
  lines.push('');

  if (record.comparison_status !== 'completed' || record.arms === null || record.deltas === null || record.tts_impact === null) {
    lines.push('## 2-4. Metrics, deltas, TTS impact');
    lines.push('');
    lines.push('**The comparison failed closed — no metric claim can be made.**');
    lines.push('');
    lines.push(`Failure reason: ${record.interpretation.failure_reason_if_any ?? '(unspecified)'}`);
    lines.push('');
  } else {
    lines.push('## 2. Three-arm metrics');
    lines.push('');
    lines.push('| Arm | Sample size | MAE | RMSE | Pearson | Rank corr |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const arm of record.arms) {
      lines.push(
        `| ${arm.arm} | ${arm.overall.sample_size} | ${num(arm.overall.mae)} | ${num(arm.overall.rmse)} | ${num(arm.overall.correlation)} | ${num(arm.overall.rank_correlation)} |`,
      );
    }
    lines.push('');
    lines.push('Per-position MAE (where the Run 1 evaluation produces it):');
    lines.push('');
    lines.push('| Arm | QB | RB | WR | TE |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const arm of record.arms) {
      const byPos = (position: 'QB' | 'RB' | 'WR' | 'TE'): string => num(arm.by_position[position]?.mae ?? null, 2);
      lines.push(`| ${arm.arm} | ${byPos('QB')} | ${byPos('RB')} | ${byPos('WR')} | ${byPos('TE')} |`);
    }
    lines.push('');

    lines.push('## 3. Deltas (directionality: negative MAE delta = lower error / improvement; positive = worse)');
    lines.push('');
    lines.push('| Comparison | MAE Δ | RMSE Δ | Pearson Δ | Rank corr Δ | MAE direction |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const delta of record.deltas) {
      lines.push(
        `| ${delta.comparison} | ${num(delta.mae_delta, 6)} | ${num(delta.rmse_delta, 6)} | ${num(delta.correlation_delta, 6)} | ${num(delta.rank_correlation_delta, 6)} | ${delta.mae_direction} |`,
      );
    }
    lines.push('');

    lines.push('## 4. How the TTS artifact changed Run 1');
    lines.push('');
    for (const line of record.tts_impact.summary) lines.push(`- ${line}`);
    lines.push('');
  }

  lines.push('## 5. Interpretation and decision');
  lines.push('');
  lines.push('Machine-readable interpretation (copied from the #86 comparison):');
  lines.push('');
  lines.push(`- \`real_teamstate_improved_vs_run1\`: ${record.interpretation.real_teamstate_improved_vs_run1}`);
  lines.push(`- \`shuffled_improved_vs_run1\`: ${record.interpretation.shuffled_improved_vs_run1}`);
  lines.push(`- \`real_improved_vs_shuffled\`: ${record.interpretation.real_improved_vs_shuffled}`);
  lines.push(`- \`signal_interpretation\`: **${record.interpretation.signal_interpretation}**`);
  lines.push(`- \`failure_reason_if_any\`: ${record.interpretation.failure_reason_if_any ?? 'null'}`);
  lines.push(`- \`recommendation_for_next_step\`: ${record.interpretation.recommendation_for_next_step}`);
  lines.push('');
  lines.push('### Operator decision');
  lines.push('');
  lines.push(`- Status: **${record.operator_decision.status}**`);
  lines.push(`- No metric claim: ${record.operator_decision.no_metric_claim}`);
  lines.push(`- Rationale: ${record.operator_decision.rationale}`);
  lines.push('');
  lines.push('Caveats:');
  for (const caveat of record.interpretation.caveats) lines.push(`- ${caveat}`);
  lines.push('');
  lines.push('---');
  for (const note of record.notes) lines.push(`- ${note}`);
  lines.push('');
  return lines.join('\n');
};
