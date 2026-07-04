/**
 * Execute the promoted-source controlled rerun of the player-history experiment (Forecast #121).
 * Reproducible, network-free, deterministic:
 *
 *   npm run experiment:player-history-promoted-controlled-rerun
 *
 * Fails closed unless the committed #119 mirror-refresh gate report shows status `passed` and
 * decision `may_open_promoted_controlled_rerun_issue`, AND every structural/leakage/provenance/
 * population-floor check re-verifies directly against the promoted mirrors this script loads (never
 * trusting the committed report's counts alone -- see
 * `assertPromotedControlledRerunPreconditions`). Writes
 * docs/reports/player-history-promoted-controlled-rerun-2026-07-04.{json,md}.
 *
 * Every metric in the output is marked experimental_promoted_source_result_not_production_signal. No
 * production Forecast behavior changes, no feature binding, no promotion, no product/advice output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ControlledRunMetrics } from '../src/rehearsal/playerHistoryControlledRun.js';
import {
  PROMOTED_CONTROLLED_RERUN_ISSUE,
  PROMOTED_MIRROR_ARCHIVED_CANDIDATE_PATHS,
  executePromotedControlledRerun,
  type CandidateSourceReferenceResult,
  type PromotedControlledRerunPriorGateEvidence,
} from '../src/rehearsal/playerHistoryPromotedControlledRerun.js';
import type {
  PromotedInputMirror,
  PromotedMirrorRefreshGateResult,
  PromotedOutcomeMirror,
} from '../src/rehearsal/playerHistoryPromotedMirrorRefresh.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-04';
const OUTCOME_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json';
const INPUT_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json';
const REFRESH_GATE_REL = 'docs/reports/player-history-promoted-mirror-overlap-gate-2026-07-04.json';
const CANDIDATE_RUN_REL = 'docs/reports/player-history-controlled-run-2026-07-02.json';
const ROBUSTNESS_REL = 'docs/reports/player-history-robustness-checks-2026-07-03.json';
const REPORT_JSON_REL = `docs/reports/player-history-promoted-controlled-rerun-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-promoted-controlled-rerun-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const outcomeMirror = readJson<PromotedOutcomeMirror>(OUTCOME_MIRROR_REL);
const inputMirror = readJson<PromotedInputMirror>(INPUT_MIRROR_REL);
const refreshGateReport = readJson<{ gate_result: PromotedMirrorRefreshGateResult }>(REFRESH_GATE_REL);
const candidateRunReport = readJson<{
  experiment: {
    decision: { decision: string };
    metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> };
  };
}>(CANDIDATE_RUN_REL);
const robustnessReport = readJson<{ robustness: { decision: { decision: string } } }>(ROBUSTNESS_REL);

const gates: PromotedControlledRerunPriorGateEvidence = {
  mirrorRefreshGateResult: refreshGateReport.gate_result,
};

const candidateJoined = candidateRunReport.experiment.metrics_by_arm.joined_only;
const candidateReference: CandidateSourceReferenceResult = {
  decision: candidateRunReport.experiment.decision.decision,
  joined_mae: {
    baseline_only: candidateJoined.baseline_only!.mae!,
    real_player_history_features: candidateJoined.real_player_history_features!.mae!,
    shuffled_player_history_control: candidateJoined.shuffled_player_history_control!.mae!,
  },
  joined_rmse: {
    baseline_only: candidateJoined.baseline_only!.rmse!,
    real_player_history_features: candidateJoined.real_player_history_features!.rmse!,
    shuffled_player_history_control: candidateJoined.shuffled_player_history_control!.rmse!,
  },
};

const startedAt = Date.now();
const { report, predictions } = executePromotedControlledRerun(outcomeMirror, inputMirror, gates, candidateReference);
const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

const fullReport = {
  report_version: 'player-history-promoted-controlled-rerun-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PROMOTED_CONTROLLED_RERUN_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  marking: report.marking,
  predecessor_refs: [
    'TIBER-Data#184-193', 'TIBER-Forecast#99-#118',
    'TIBER-Forecast#111/#112 (candidate-source controlled run)',
    'TIBER-Forecast#115/#116 (candidate-source robustness checks)',
    'TIBER-Forecast#117/#118 (promoted-source gate)',
    'TIBER-Forecast#119/#120 (promoted-source mirror refresh)',
  ],
  inputs: {
    outcome_mirror: { path: OUTCOME_MIRROR_REL, governed_source: outcomeMirror.governed_source, source_lineage: outcomeMirror.source_lineage },
    input_mirror: { path: INPUT_MIRROR_REL, governed_source: inputMirror.governed_source, source_lineage: inputMirror.source_lineage },
    refresh_gate: {
      path: REFRESH_GATE_REL,
      status: gates.mirrorRefreshGateResult.status,
      decision: gates.mirrorRefreshGateResult.decision,
    },
    candidate_source_run: { path: CANDIDATE_RUN_REL, decision: candidateReference.decision },
    candidate_source_robustness: { path: ROBUSTNESS_REL, decision: robustnessReport.robustness.decision.decision },
  },
  archived_candidate_mirrors_untouched_at: PROMOTED_MIRROR_ARCHIVED_CANDIDATE_PATHS,
  design_note:
    'Preserves the #112 three-arm design verbatim: same arms, same LOOCV/train-fold-only imputation and standardization discipline, same ridge lambda (1.0), same shuffle seed (20260702) and position-stratified derangement method. Only the source mirrors changed (promoted-governed rather than candidate-evidence); no other deviation from #112 was introduced.',
  baseline_choice_rationale:
    'baseline_only is the train-fold position mean of the 2025 outcome: reproducible on the promoted-source population without production rewiring, structurally unable to leak the held-out outcome, and consuming no player-history payloads. Identical rationale to #112.',
  null_handling_policy:
    'Nulls preserved end-to-end; per-fold imputation uses the #104 train-fold mean primitives fit on training rows only; standardization is train-fold-only z-scoring; no full-population statistics were fit; no null was silently coerced to zero outside the documented ridge-neutral train-fold fallback for fully-null training columns.',
  experiment: report,
  next_allowed_step:
    report.decision.decision === 'promoted_player_history_signal_replicated_requires_followup'
      ? 'Open a SEPARATE follow-up review/design issue for production-binding prerequisites or feature-contract design. This result does not itself authorize production binding, seasonalPprModel.ts wiring, Data artifact promotion, or product output; a positive replicated result requires its own review before anything further.'
      : 'No further step is authorized by this result. A non-replicated or inconclusive result stands as recorded; no follow-up rerun issue is implied.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const fmt = (value: number | null, digits = 3): string => (value === null ? 'n/a' : value.toFixed(digits));
const metricsRow = (label: string, metrics: ControlledRunMetrics): string =>
  `| ${label} | ${metrics.n} | ${fmt(metrics.mae)} | ${fmt(metrics.rmse)} | ${fmt(metrics.pearson)} | ${fmt(metrics.spearman)} |`;

const armLabels: Record<string, string> = {
  baseline_only: 'baseline_only',
  real_player_history_features: 'real_player_history',
  shuffled_player_history_control: 'shuffled_control',
};

const subgroupTable = (title: string, metrics: Record<string, ControlledRunMetrics>): string =>
  `### ${title}

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
${Object.entries(metrics).map(([arm, m]) => metricsRow(armLabels[arm] ?? arm, m)).join('\n')}`;

const e = report;
const cmp = report.candidate_source_comparison;
const md = `# Promoted-source controlled rerun (#121)

_Generated ${REPORT_DATE} • ${e.version} • **${e.marking}**_

**Decision: \`${e.decision.decision}\`**

This is an ISOLATED controlled rerun against the PROMOTED-governed mirrors from #119/PR #120. No production Forecast behavior changed; no feature binding occurred; no product-facing player-history signal is claimed; no fantasy advice/rankings/start-sit/trade/draft output was produced; no TIBER-Data change or artifact promotion/demotion occurred. Metrics below exist only inside this report. The archived #110 candidate mirrors remain untouched.

## 1. Inputs and preflight (all verified fail-closed before execution)

- Outcome mirror: \`${OUTCOME_MIRROR_REL}\` (sha256 \`${outcomeMirror.governed_source.sha256}\`, status \`${outcomeMirror.governed_source.artifactStatus}\`)
- Input mirror: \`${INPUT_MIRROR_REL}\` (2022-2024 REG only; no 2025 rows)
- #119 mirror-refresh gate (re-verified): status \`${gates.mirrorRefreshGateResult.status}\` • decision \`${gates.mirrorRefreshGateResult.decision}\`
- Candidate-source reference: #112 decision \`${candidateReference.decision}\`, #116 robustness decision \`${robustnessReport.robustness.decision.decision}\`

## 2. Design (verbatim #112 design; only the source mirrors changed)

- Arms: ${e.arms.map((arm) => `\`${arm}\``).join(', ')}
- Validation: leave-one-out cross-validation, ${e.fold_design.folds} folds (fold order = sorted player_id; fully deterministic)
- Baseline: train-fold position mean; consumes no player-history payloads
- Feature arms: ridge (lambda=${e.fold_design.ridge_lambda}, intercept unpenalized) on position dummies + has_history indicator + player-history columns across the 5 #104 families; train-fold-only imputation and z-scoring
- Shuffled control: \`${e.fold_design.shuffle_method}\`, seed ${e.fold_design.shuffle_seed}
- Population: ${e.population.evaluated_rows} evaluated rows (${e.population.joined_rows} joined, ${e.population.no_history_rows} no-history); by position: ${Object.entries(e.population.by_position).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- Shuffled-control integrity: ${e.population.shuffled_control_integrity.donors_assigned} donors assigned, ${e.population.shuffled_control_integrity.self_donations} self-donations, ${e.population.shuffled_control_integrity.cross_position_donations} cross-position donations

## 3. Metrics by arm (experimental promoted-source results, NOT production signal)

${subgroupTable('Overall (n=' + e.population.evaluated_rows + ')', e.metrics_by_arm.overall)}

${subgroupTable('Joined only (primary comparison population, n=' + e.population.joined_rows + ')', e.metrics_by_arm.joined_only)}

${subgroupTable('No-history subgroup (n=' + e.population.no_history_rows + ')', e.metrics_by_arm.no_history_only)}

${Object.entries(e.metrics_by_arm.per_position).map(([position, metrics]) => subgroupTable(`Position ${position}`, metrics)).join('\n\n')}

## 4. Pairwise comparisons (MAE delta = second arm minus first; positive favors the first arm)

| Comparison | Subgroup | MAE delta | RMSE delta | Better on MAE |
|---|---|---|---|---|
${e.comparisons.map((c) => `| ${c.comparison} | ${c.subgroup} | ${fmt(c.mae_delta)} | ${fmt(c.rmse_delta)} | ${c.better_on_mae} |`).join('\n')}

## 5. Comparison to the #112/#116 candidate-source result

| Metric | Candidate (#112) | Promoted rerun (#121) | Delta |
|---|---|---|---|
| joined MAE (baseline_only) | ${fmt(candidateReference.joined_mae.baseline_only)} | ${fmt(e.metrics_by_arm.joined_only.baseline_only.mae)} | ${fmt(cmp.joined_mae_delta_vs_candidate.baseline_only)} |
| joined MAE (real_player_history_features) | ${fmt(candidateReference.joined_mae.real_player_history_features)} | ${fmt(e.metrics_by_arm.joined_only.real_player_history_features.mae)} | ${fmt(cmp.joined_mae_delta_vs_candidate.real_player_history_features)} |
| joined MAE (shuffled_player_history_control) | ${fmt(candidateReference.joined_mae.shuffled_player_history_control)} | ${fmt(e.metrics_by_arm.joined_only.shuffled_player_history_control.mae)} | ${fmt(cmp.joined_mae_delta_vs_candidate.shuffled_player_history_control)} |
| joined RMSE (real_player_history_features) | ${fmt(candidateReference.joined_rmse.real_player_history_features)} | ${fmt(e.metrics_by_arm.joined_only.real_player_history_features.rmse)} | ${fmt(cmp.joined_rmse_delta_vs_candidate.real_player_history_features)} |

- Candidate (#112) decision: \`${cmp.candidate_decision}\` (real beat both comparators: **${cmp.candidate_beat_baseline_and_shuffled}**)
- Promoted rerun (#121) real beat both comparators: **${cmp.promoted_beat_baseline_and_shuffled}**
- Directionally consistent: **${cmp.directionally_consistent}**
- ${cmp.replication_note}

## 6. Decision

- **\`${e.decision.decision}\`**
- Primary metric: ${e.decision.primary_metric} • real beats baseline: **${e.decision.real_beats_baseline_on_primary}** • real beats shuffled: **${e.decision.real_beats_shuffled_on_primary}** • real beats shuffled on secondary (${e.decision.secondary_metric}): **${e.decision.real_beats_shuffled_on_secondary}** • directionally consistent with candidate: **${e.decision.directionally_consistent_with_candidate}**
- ${e.decision.rationale}

## 7. Non-goals confirmed

- No production Forecast behavior was modified; nothing was wired into \`seasonalPprModel.ts\`; the production baseline is unchanged.
- No product routes or UI surfaces were added; no fantasy advice, rankings, start/sit, trade, or draft output was produced.
- No TIBER-Data or Teamstate change; no Data artifact promotion/demotion.
- No 2025 player-season summary was consumed as a 2025 input feature; no availability/ownership/depth/injury status was inferred.
- No null was coerced to zero outside the documented train-fold imputation policy.
- The archived #110 candidate mirrors were not modified.
- No production signal is claimed. ${e.decision.decision === 'promoted_player_history_signal_replicated_requires_followup' ? 'The replicated result requires its own follow-up review issue before anything further.' : ''}

## 8. Next allowed step

${fullReport.next_allowed_step}

## Reproduce

\`\`\`bash
npm run experiment:player-history-promoted-controlled-rerun   # deterministic, network-free
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

const joined = report.metrics_by_arm.joined_only;
process.stderr.write(
  `promoted-source controlled rerun complete in ${elapsedSeconds}s: ${predictions.length} LOOCV folds\n` +
    `joined-population MAE -- baseline: ${fmt(joined.baseline_only.mae)}, real: ${fmt(joined.real_player_history_features.mae)}, shuffled: ${fmt(joined.shuffled_player_history_control.mae)}\n` +
    `decision: ${report.decision.decision}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
