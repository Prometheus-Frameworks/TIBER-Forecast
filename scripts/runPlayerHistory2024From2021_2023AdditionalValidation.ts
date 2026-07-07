/**
 * Run the 2024-from-2021-2023 additional-validation pass (Forecast #137), following the #135/PR #136
 * mirror refresh (squash-merged as `db13503`) and its decision
 * `may_open_player_history_2024_from_2021_2023_additional_validation_issue`.
 *
 * Deterministic and network-free: reads the committed #136 refreshed mirrors + the committed #136
 * mirror-refresh-gate report, re-verifies every precondition directly against the mirrors (never
 * trusting the committed report's counts alone -- see `evaluateAdditionalValidationPreconditions`),
 * runs the isolated three-arm LOOCV design, and writes:
 *
 *   docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.{json,md}
 *
 * This is a BOUNDED additional-validation run: it computes and reports validation metrics for the
 * 2024 target window only. It does not decide a threshold, bind anything into production Forecast,
 * or make a production-readiness/leakage-audit-complete claim. No TIBER-Data change. Exits non-zero
 * unless the decision is may_open_player_history_2024_from_2021_2023_threshold_review_issue.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADDITIONAL_VALIDATION_RIDGE_LAMBDA,
  ADDITIONAL_VALIDATION_SHUFFLE_SEED,
  PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_ISSUE,
  executePlayerHistory2024From2021_2023AdditionalValidation,
} from '../src/rehearsal/playerHistory2024From2021_2023AdditionalValidation.js';
import {
  INPUT_MIRROR_PATH_2021_2023,
  OUTCOME_MIRROR_PATH_2024,
  type PlayerHistory2021_2023InputMirror,
  type PlayerHistory2024From2021_2023MirrorRefreshGateResult,
  type PlayerHistory2024OutcomeMirror,
} from '../src/rehearsal/playerHistory2024From2021_2023MirrorRefresh.js';
import type { ControlledRunMetrics } from '../src/rehearsal/playerHistoryControlledRun.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-07';
const MIRROR_REFRESH_REPORT_REL = `docs/reports/player-history-2024-from-2021-2023-mirror-refresh-${REPORT_DATE}.json`;
const REPORT_JSON_REL = `docs/reports/player-history-2024-from-2021-2023-additional-validation-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-2024-from-2021-2023-additional-validation-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const outcomeMirror = readJson<PlayerHistory2024OutcomeMirror>(OUTCOME_MIRROR_PATH_2024);
const inputMirror = readJson<PlayerHistory2021_2023InputMirror>(INPUT_MIRROR_PATH_2021_2023);
const mirrorRefreshReport = readJson<{ refresh_gate_result: PlayerHistory2024From2021_2023MirrorRefreshGateResult }>(MIRROR_REFRESH_REPORT_REL);
const priorGate = mirrorRefreshReport.refresh_gate_result;

const startedAt = Date.now();
const { report } = executePlayerHistory2024From2021_2023AdditionalValidation(
  outcomeMirror,
  inputMirror,
  priorGate,
  ADDITIONAL_VALIDATION_SHUFFLE_SEED,
  ADDITIONAL_VALIDATION_RIDGE_LAMBDA,
);
const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

const fullReport = {
  report_version: 'player-history-2024-from-2021-2023-additional-validation-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  marking: report.marking,
  predecessor_refs: [
    'TIBER-Data#202/#207 (2021-2025 promotion)',
    'TIBER-Forecast#135/#136 (2024-from-2021-2023 mirror refresh, squash-merged as db13503)',
  ],
  inputs: {
    outcome_mirror: { path: OUTCOME_MIRROR_PATH_2024, governed_source: outcomeMirror.governed_source, counts: outcomeMirror.counts },
    input_mirror: { path: INPUT_MIRROR_PATH_2021_2023, governed_source: inputMirror.governed_source, counts: inputMirror.counts },
    mirror_refresh_gate: { path: MIRROR_REFRESH_REPORT_REL, status: priorGate.status, decision: priorGate.decision },
  },
  design_note:
    'Same isolated three-arm LOOCV design as #111/#121 (baseline_only / real_player_history_features / ' +
    'shuffled_player_history_control), reusing the #111 LOOCV engine and metric primitives verbatim. Only the ' +
    'feature window differs: target season 2024, input seasons 2021-2023, so the player-history feature block is ' +
    're-keyed to seasons 2023/2022/2021 rather than the 2024/2023/2022 keys #111/#121 used for their 2025-target window.',
  scope_note:
    'Runs ONLY the 2024-from-2021-2023 additional-validation path against the #136 refreshed mirrors. Does not ' +
    'consume, recompute, or compare against the #110 archived candidate mirrors, the #119/#120 promoted-source ' +
    'mirrors (2025 outcome / 2022-2024 input), or any other prior mirror family.',
  validation: report,
  next_allowed_step:
    report.decision === 'may_open_player_history_2024_from_2021_2023_threshold_review_issue'
      ? 'A SEPARATE issue may be opened to consider a threshold against the metrics recorded above. This decision does not itself accept, reject, or amend any threshold, and does not authorize production binding, feature wiring, or product output.'
      : report.decision === 'player_history_2024_from_2021_2023_additional_validation_requires_followup'
        ? 'Do not open the threshold-review issue yet. Fix the identified population/overlap floor or metric-definition gap and re-run this validation.'
        : 'Do not use this result at all. Fix the first blocking precondition reason and re-run this validation.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const fmt = (value: number | null, digits = 3): string => (value === null ? 'n/a' : value.toFixed(digits));
const metricsRow = (label: string, metrics: ControlledRunMetrics): string => `| ${label} | ${metrics.n} | ${fmt(metrics.mae)} | ${fmt(metrics.rmse)} | ${fmt(metrics.pearson)} | ${fmt(metrics.spearman)} |`;

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

const v = report;
const md = `# Player-history 2024-from-2021-2023 additional validation (#137)

_Generated ${REPORT_DATE} • ${v.version} • **${v.marking}**_

**Decision: \`${v.decision}\`**

Runs the bounded additional-validation pass authorized by #136's decision \`may_open_player_history_2024_from_2021_2023_additional_validation_issue\` against the #136 refreshed mirrors ONLY. Computes and reports validation metrics for the 2024 target window; does not decide a threshold, does not bind anything into production Forecast, and makes no production-readiness or leakage-audit-complete claim. No TIBER-Data change.

## 1. Preconditions (re-verified directly against the mirrors this run consumes)

- #136 mirror-refresh gate (re-verified): status \`${priorGate.status}\` • decision \`${priorGate.decision}\`
- Outcome mirror: \`${OUTCOME_MIRROR_PATH_2024}\` (sha256 \`${outcomeMirror.governed_source.sha256}\`, promotion review \`${outcomeMirror.governed_source.promotionReview}\`)
- Input mirror: \`${INPUT_MIRROR_PATH_2021_2023}\` (2021-2023 REG only; 0 rows at or beyond target season 2024)
- Preconditions: ${v.preconditions.checks.filter((c) => c.passed).length}/${v.preconditions.checks.length} checks passed — integrity_passed=**${v.preconditions.integrity_passed}**, floors_passed=**${v.preconditions.floors_passed}**
- Observed overlap: joined ${v.preconditions.observed_overlap.joined_rows} of ${v.preconditions.observed_overlap.scored_target_rows} scored (share ${v.preconditions.observed_overlap.joined_share === null ? 'n/a' : v.preconditions.observed_overlap.joined_share.toFixed(4)}), by position ${JSON.stringify(v.preconditions.observed_overlap.joined_rows_by_position)}

## 2. Design (same #111/#121 design; feature window re-keyed to 2023/2022/2021)

- Arms: ${v.arms.map((arm) => `\`${arm}\``).join(', ')}
- Validation: leave-one-out cross-validation, ${v.fold_design.folds} folds (fold order = sorted player_id; fully deterministic)
- Baseline: train-fold position mean; consumes no player-history payloads
- Feature arms: ridge (lambda=${v.fold_design.ridge_lambda}, intercept unpenalized) on position dummies + has_history indicator + player-history columns across the 5 #104 families; train-fold-only imputation and z-scoring
- Shuffled control: \`${v.fold_design.shuffle_method}\`, seed ${v.fold_design.shuffle_seed}
- Population: ${v.population.evaluated_rows} evaluated rows (${v.population.joined_rows} joined, ${v.population.no_history_rows} no-history); by position: ${Object.entries(v.population.by_position).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- Shuffled-control integrity: ${v.population.shuffled_control_integrity.donors_assigned} donors assigned, ${v.population.shuffled_control_integrity.self_donations} self-donations, ${v.population.shuffled_control_integrity.cross_position_donations} cross-position donations

## 3. Metrics by arm (experimental 2024-from-2021-2023 results, NOT production signal)

${v.population.evaluated_rows > 0 ? subgroupTable('Overall (n=' + v.population.evaluated_rows + ')', v.metrics_by_arm.overall) : '_No rows evaluated (run blocked; see preconditions above)._'}

${v.population.evaluated_rows > 0 ? subgroupTable('Joined only (primary comparison population, n=' + v.population.joined_rows + ')', v.metrics_by_arm.joined_only) : ''}

${v.population.evaluated_rows > 0 ? subgroupTable('No-history subgroup (n=' + v.population.no_history_rows + ')', v.metrics_by_arm.no_history_only) : ''}

${Object.entries(v.metrics_by_arm.per_position).map(([position, metrics]) => subgroupTable(`Position ${position}`, metrics)).join('\n\n')}

## 4. Pairwise comparisons (MAE delta = second arm minus first; positive favors the first arm)

${
  v.comparisons.length > 0
    ? `| Comparison | Subgroup | MAE delta | RMSE delta | Better on MAE |
|---|---|---|---|---|
${v.comparisons.map((c) => `| ${c.comparison} | ${c.subgroup} | ${fmt(c.mae_delta)} | ${fmt(c.rmse_delta)} | ${c.better_on_mae} |`).join('\n')}`
    : '_No comparisons available (run blocked)._'
}

## 5. Decision

- **\`${v.decision}\`**
- ${v.decision_rationale}

## 6. Non-goals confirmed

- No threshold was accepted, rejected, or amended by this issue.
- No production Forecast behavior was modified; nothing was wired into \`seasonalPprModel.ts\`; the production baseline is unchanged.
- No product routes or UI surfaces were added; no fantasy advice, rankings, start/sit, trade, or draft output was produced.
- No TIBER-Data change; nothing was promoted or demoted.
- The leakage split is preserved: the input mirror carries zero 2024 rows; the outcome mirror carries only 2024 target values.
- Only the #136 refreshed mirrors were consumed; no prior mirror family (#110 archived candidate, #119/#120 promoted-source) was read or compared against.
- No production-readiness or leakage-audit-complete claim is made.
- ${v.decision === 'may_open_player_history_2024_from_2021_2023_threshold_review_issue' ? 'The positive decision authorizes only a separate threshold-review issue; it decides nothing about the threshold itself.' : 'No follow-up threshold-review issue is authorized by this result as recorded.'}

## 7. Next allowed step

${fullReport.next_allowed_step}

## Reproduce

\`\`\`bash
npm run validate:player-history-2024-from-2021-2023-additional   # deterministic, network-free
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

const joined = report.metrics_by_arm.joined_only;
process.stderr.write(
  `2024-from-2021-2023 additional validation complete in ${elapsedSeconds}s: ${report.population.evaluated_rows} evaluated rows, ${report.fold_design.folds} LOOCV folds\n` +
    `joined-population MAE -- baseline: ${fmt(joined.baseline_only.mae)}, real: ${fmt(joined.real_player_history_features.mae)}, shuffled: ${fmt(joined.shuffled_player_history_control.mae)}\n` +
    `decision: ${report.decision}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
if (report.decision !== 'may_open_player_history_2024_from_2021_2023_threshold_review_issue') {
  process.exit(1);
}
