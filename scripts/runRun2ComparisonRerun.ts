/**
 * Rerun the unchanged Teamstate Run 2 three-arm comparison with full-coverage Teamstate evidence and
 * write a durable report (Forecast #96). Reproducible, network-free:
 *
 *   npm run rerun:run2-comparison-full-coverage
 *
 * Writes docs/reports/run2-teamstate-comparison-rerun-full-coverage-2026-06-29.{json,md}. It changes only
 * the source binding (full 32-team team-week values); the comparison design is unchanged and frozen.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TeamstateTeamWeekValueRow } from '../src/rehearsal/runRun2GovernedTeamstateValueBinding.js';
import {
  FULL_MODE_GOVERNED_SOURCE_SHA256,
  nextStepForRerun,
  runRun2ComparisonRerunFromValues,
} from '../src/rehearsal/runRun2ComparisonRerun.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-06-29';
const VALUES_REL = 'data/fixtures/teamstate/teamstate_team_week_values_2024.json';
const REPORT_JSON_REL = `docs/reports/run2-teamstate-comparison-rerun-full-coverage-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/run2-teamstate-comparison-rerun-full-coverage-${REPORT_DATE}.md`;

const valuesFile = JSON.parse(readFileSync(path.join(REPO_ROOT, VALUES_REL), 'utf-8')) as {
  provenance: { governedSourceSha256: string; refs: string[] };
  teamWeekValues: TeamstateTeamWeekValueRow[];
};

if (valuesFile.provenance.governedSourceSha256 !== FULL_MODE_GOVERNED_SOURCE_SHA256) {
  process.stderr.write(
    `rerun refused: team-week values sha ${valuesFile.provenance.governedSourceSha256} does not match the pinned governed source ${FULL_MODE_GOVERNED_SOURCE_SHA256}.\n`,
  );
  process.exit(1);
}

const result = runRun2ComparisonRerunFromValues(valuesFile.teamWeekValues);
if (!result.ok) {
  process.stderr.write(`rerun failed: ${JSON.stringify(result.errors)}\n`);
  process.exit(1);
}
const report = result.data;
const nextStep = nextStepForRerun(report);

const pct = (value: number | null): string => (value == null ? 'n/a' : value.toFixed(4));
const findArm = (name: string) => report.arms?.find((arm) => arm.arm === name);
const run1 = findArm('run1_baseline');
const real = findArm('real_teamstate_run2');
const shuffled = findArm('shuffled_teamstate_control');

const durable = {
  report_version: 'run2-teamstate-comparison-rerun-full-coverage-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#96',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  authorized_unchanged_rerun_after_gate_pass: true,
  relation: ['#86', '#88', '#90', '#92', '#94 (gate passed)'],
  source_evidence_identity: {
    teamstate_team_week_values: VALUES_REL,
    governed_source_sha256: FULL_MODE_GOVERNED_SOURCE_SHA256,
    refs: valuesFile.provenance.refs,
    gate_status_from_94: 'teamstate_coverage_gate_passed (decision may_rerun_unchanged_comparison)',
  },
  invariants_unchanged: {
    population: true,
    target: true,
    folds: true,
    model_class: true,
    ridge_lambda: report.ridge_lambda,
    null_handling: report.null_handling?.method ?? null,
    run1_feature_columns: report.run1_feature_columns,
    teamstate_feature_columns: report.teamstate_feature_columns,
    shuffled_control_intact: report.shuffled_ref !== null,
    source_binding_update_only: 'team-week values replaced by the full 32-team gate-passed governed set',
  },
  coverage: report.coverage,
  null_handling: report.null_handling,
  arms: report.arms,
  deltas: report.deltas,
  interpretation: report.interpretation,
  comparison_status: report.comparison_status,
  final_signal_interpretation: report.interpretation.signal_interpretation,
  next_step: nextStep,
  teamstate_governance: report.teamstate_governance,
  recorded_cutoff: report.recorded_cutoff,
  notes: report.notes,
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(durable, null, 2)}\n`, 'utf-8');

const armRow = (label: string, arm: ReturnType<typeof findArm>): string =>
  `| ${label} | ${arm?.overall.sample_size ?? 'n/a'} | ${pct(arm?.overall.mae ?? null)} | ${pct(arm?.overall.rmse ?? null)} | ${pct(arm?.overall.correlation ?? null)} | ${pct(arm?.overall.rank_correlation ?? null)} |`;
const deltaRow = (d: NonNullable<typeof report.deltas>[number]): string =>
  `| ${d.comparison} | ${d.mae_delta} | ${d.rmse_delta} | ${d.correlation_delta ?? 'n/a'} | ${d.rank_correlation_delta ?? 'n/a'} | ${d.improved ? 'yes' : 'no'} |`;

const cov = report.coverage;
const md = `# Run 2 Teamstate comparison rerun — full coverage

_Generated ${REPORT_DATE} • record ${durable.report_version} • status: **${report.comparison_status}** • signal: **${report.interpretation.signal_interpretation}**_

This is the **authorized unchanged rerun** of the #86 three-arm comparison after the Teamstate coverage gate passed (#94/#95, \`may_rerun_unchanged_comparison\`). The only change from the prior run is the **source binding**: the team-week values are the full 32-team gate-passed governed set instead of the original 3-team fixture. No model, population, target, folds, hyperparameters, features, null handling, shuffled-control, metrics, or interpretation labels changed. The goal was to measure what the same experiment says once the coverage defect is removed — not to obtain a better result. This is one controlled experiment and makes **no** claim that Teamstate is predictive in general; it is not product/advice output.

## 1. Experiment identity

- Issue: \`TIBER-Forecast#96\` • rerun date ${REPORT_DATE}
- Relation: #86 (harness) → #88 (first outcome) → #90 (failed-sanity audit) → #92 (gate) → #94 (gate **passed**)
- Source team-week values: \`${VALUES_REL}\`
- Governed source sha256: \`${FULL_MODE_GOVERNED_SOURCE_SHA256}\`
- Refs: ${valuesFile.provenance.refs.map((r) => `\`${r}\``).join(', ')}
- Gate status (#94): \`teamstate_coverage_gate_passed\` → \`may_rerun_unchanged_comparison\`
- Authorized unchanged rerun after gate pass: yes

## 2. Invariant confirmation (unchanged)

- Population, target, folds, model class, ridge lambda (${report.ridge_lambda}), train-fold standardization, train-fold mean imputation, prediction clipping: **unchanged** (all from the frozen harness).
- Run 1 feature columns: \`${report.run1_feature_columns.join(', ')}\`
- Teamstate feature columns: \`${report.teamstate_feature_columns.join(', ')}\`
- Null handling: \`${report.null_handling?.method ?? 'n/a'}\`; shuffled-control intact: ${report.shuffled_ref !== null ? 'yes' : 'no'}
- **Source-binding update only:** team-week values replaced by the full 32-team gate-passed governed set.

## 3. Coverage summary

- Candidate observations: ${cov?.observation_count ?? 'n/a'} • scored rows: ${cov?.scored_row_count ?? 'n/a'}
- Teamstate matched rows: ${cov?.teamstate_matched_rows ?? 'n/a'} • unmatched: ${cov?.teamstate_unmatched_rows ?? 'n/a'}
- Imputed (null) Teamstate cells — real arm: ${report.null_handling?.real_run2_imputed_null_cells ?? 'n/a'}, shuffled arm: ${report.null_handling?.shuffled_control_imputed_null_cells ?? 'n/a'} (vs ~93/114 in the original sparse run)
- Teamstate feature columns: \`${report.teamstate_feature_columns.join(', ')}\`; pressure excluded/deferred; fantasy splits absent/excluded.

## 4. Metrics by arm

| Arm | n | MAE | RMSE | Pearson | Rank corr |
| --- | --- | --- | --- | --- | --- |
${armRow('run1_baseline', run1)}
${armRow('real_teamstate_run2', real)}
${armRow('shuffled_teamstate_control', shuffled)}

Directionality: lower MAE / RMSE is better; higher correlations are better.

## 5. Deltas

| Comparison | ΔMAE | ΔRMSE | ΔPearson | ΔRank | MAE improved |
| --- | --- | --- | --- | --- | --- |
${(report.deltas ?? []).map(deltaRow).join('\n')}

## 6. Interpretation

- Real Teamstate improved vs Run 1: **${report.interpretation.real_teamstate_improved_vs_run1}**
- Shuffled improved vs Run 1: **${report.interpretation.shuffled_improved_vs_run1}**
- Real improved vs shuffled: **${report.interpretation.real_improved_vs_shuffled}**
- Signal interpretation: \`${report.interpretation.signal_interpretation}\`
- Harness recommendation: ${report.interpretation.recommendation_for_next_step}

## 7. Decision / next step

- **Next step:** \`${nextStep}\`
- Even with full 32-team coverage and zero imputed Teamstate cells, the shuffled control beat the real arm and real Teamstate did not improve Run 1 — the sanity control fails again. The coverage defect is removed, so sparse coverage is no longer an available explanation for this setup. This is **not** evidence that Teamstate works; do not attribute any movement to Teamstate signal. Audit the failed sanity control (join/leakage/variance/feature-shape) — or pause the Teamstate Run 2 path — before any further Run 2 work. No signal claim is made.

## Reproduce

\`\`\`bash
npm run rerun:run2-comparison-full-coverage   # regenerate this report (network-free)
npm run build                                  # tsc --noEmit
npm test                                       # incl. tests/run2ComparisonRerunFullCoverage.test.ts
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `${report.comparison_status} • ${report.interpretation.signal_interpretation} → ${nextStep} | ` +
    `run1 ${run1?.overall.mae.toFixed(4)} / real ${real?.overall.mae.toFixed(4)} / shuffled ${shuffled?.overall.mae.toFixed(4)} MAE\n`,
);
process.stderr.write(`  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
